import "server-only";
import { getActor } from "@/shared/auth/actor";
import type { ActorContext } from "@/shared/contracts";
import { check, type SchemaName } from "@/shared/contracts/validate";
import { GatewayError, errorOutcome, toResponse } from "./envelope";
import type { Outcome } from "./ports";

const MAX_BODY_BYTES = 16 * 1024;
/** One file at policy max_bytes (2 MiB) plus room for the multipart framing and short fields. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 + 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID.test(value);

/** null = over the limit. Counts bytes as they arrive, so a chunked body cannot buffer past it. */
async function readLimited(request: Request, max: number): Promise<Buffer | null> {
  if (Number(request.headers.get("content-length") ?? 0) > max) return null;
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    size += value.byteLength;
    if (size > max) {
      void reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}

type Context = {
  actor: ActorContext;
  body: unknown;
  form: FormData | null;
  key: string | null;
  signal: AbortSignal;
};

/**
 * One gateway entry for public routes: Origin → actor → Idempotency-Key → body → run. `multipart` lists the
 * form fields the operation accepts; each may appear at most once.
 */
export async function handle(
  request: Request,
  opts: { body?: SchemaName; multipart?: readonly string[]; idempotent?: boolean },
  // A Response is passed through as is: a non-JSON success such as a CSV download.
  run: (ctx: Context) => Promise<Outcome | Response>,
): Promise<Response> {
  // Defence in depth on top of SameSite cookies.
  if (request.method !== "GET" && request.method !== "HEAD") {
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      return toResponse(errorOutcome("ACCESS_DENIED"));
    }
  }

  let actor: ActorContext | null;
  try {
    actor = await getActor();
  } catch {
    // Never 401 or ALLOW: identity state is unavailable.
    return toResponse(errorOutcome("STATE_UNAVAILABLE"));
  }
  if (!actor) return toResponse(errorOutcome("UNAUTHENTICATED"));

  const key = opts.idempotent ? request.headers.get("idempotency-key") : null;
  if (opts.idempotent && !(key && isUuid(key))) return toResponse(errorOutcome("INVALID_INPUT"));

  let body: unknown;
  if (opts.body) {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return toResponse(errorOutcome("UNSUPPORTED_FILE"));
    }
    const bytes = await readLimited(request, MAX_BODY_BYTES);
    if (bytes === null) return toResponse(errorOutcome("INVALID_INPUT", { status: 413 }));
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return toResponse(errorOutcome("INVALID_INPUT"));
    }
    // additionalProperties: false rejects role, actor_id, organisation_id and any other unknown field.
    if (!check(opts.body, body).ok) return toResponse(errorOutcome("INVALID_INPUT"));
  }

  let form: FormData | null = null;
  if (opts.multipart) {
    const type = request.headers.get("content-type") ?? "";
    if (!type.toLowerCase().startsWith("multipart/form-data")) {
      return toResponse(errorOutcome("UNSUPPORTED_FILE"));
    }
    // Counted before parsing: the form parser only ever sees a body already under the cap.
    const bytes = await readLimited(request, MAX_UPLOAD_BYTES);
    if (bytes === null) return toResponse(errorOutcome("INVALID_INPUT", { status: 413 }));
    try {
      form = await new Response(new Uint8Array(bytes), { headers: { "content-type": type } }).formData();
    } catch {
      return toResponse(errorOutcome("INVALID_INPUT"));
    }
    const names = [...form.keys()];
    if (names.some((n) => !opts.multipart!.includes(n)) || new Set(names).size !== names.length) {
      return toResponse(errorOutcome("INVALID_INPUT"));
    }
  }

  try {
    const result = await run({ actor, body, form, key, signal: request.signal });
    return result instanceof Response ? result : toResponse(result);
  } catch (error) {
    if (error instanceof GatewayError) return toResponse(errorOutcome(error.code));
    // Error name only: never content, database detail or stacks.
    console.error("gateway route failed", error instanceof Error ? error.name : "unknown");
    return toResponse(errorOutcome("STATE_UNAVAILABLE"));
  }
}
