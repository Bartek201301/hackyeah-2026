import "server-only";
import { getActor } from "@/shared/auth/actor";
import type { ActorContext } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import { GatewayError, errorOutcome, toResponse } from "./envelope";
import type { Outcome } from "./ports";

const MAX_BODY_BYTES = 16 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID.test(value);

type Context = { actor: ActorContext; body: unknown; key: string | null; signal: AbortSignal };

/** One gateway entry for public routes: Origin → actor → Idempotency-Key → body → run. */
export async function handle(
  request: Request,
  opts: { body?: "ChatRequest"; idempotent?: boolean },
  run: (ctx: Context) => Promise<Outcome>,
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
    const tooLarge = () => toResponse(errorOutcome("INVALID_INPUT", { status: 413 }));
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge();
    // ponytail: buffers a chunked body before the size check (signed-in callers only); stream-count if abused.
    const text = await request.text();
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) return tooLarge();
    try {
      body = JSON.parse(text);
    } catch {
      return toResponse(errorOutcome("INVALID_INPUT"));
    }
    // additionalProperties: false rejects role, actor_id, organisation_id and any other unknown field.
    if (!check(opts.body, body).ok) return toResponse(errorOutcome("INVALID_INPUT"));
  }

  try {
    return toResponse(await run({ actor, body, key, signal: request.signal }));
  } catch (error) {
    if (error instanceof GatewayError) return toResponse(errorOutcome(error.code));
    // Error name only: never content, database detail or stacks.
    console.error("gateway route failed", error instanceof Error ? error.name : "unknown");
    return toResponse(errorOutcome("STATE_UNAVAILABLE"));
  }
}
