import { resolveIntegrationToken } from "@/shared/auth/integration-token";
import { loadControls } from "@/shared/gateway/calls";
import { errorOutcome, toResponse } from "@/shared/gateway/envelope";
import { classifyGuardTool, parseGuardRequest, stableGuardKey } from "@/shared/gateway/guard-request";
import { assessStandalone } from "@/shared/gateway/standalone-check";
import { gatewayDeps } from "@/app/api/v1/composition";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.INTERLOCK_PUBLIC_ORIGIN;
  let origin: URL;
  try {
    origin = new URL(expected ?? "");
  } catch {
    return toResponse(errorOutcome("STATE_UNAVAILABLE"));
  }
  if (
    new URL(request.url).host !== origin.host ||
    (request.headers.get("origin") && request.headers.get("origin") !== origin.origin)
  )
    return toResponse(errorOutcome("ACCESS_DENIED"));
  let identity;
  try {
    identity = await resolveIntegrationToken(request.headers.get("authorization"), null);
  } catch {
    return toResponse(errorOutcome("STATE_UNAVAILABLE"));
  }
  if (!identity || !identity.actor.scopes.some((s) => s === "guard:prompt" || s === "guard:tool"))
    return toResponse(errorOutcome("UNAUTHENTICATED"));
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return toResponse(errorOutcome("INVALID_INPUT"));
  if (Number(request.headers.get("content-length") ?? 0) > 8192)
    return toResponse(errorOutcome("INVALID_INPUT", { status: 413 }));
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    if (!request.body) return toResponse(errorOutcome("INVALID_INPUT"));
    const reader = request.body.getReader();
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      bytes += chunk.byteLength;
      if (bytes > 8192) return toResponse(errorOutcome("INVALID_INPUT", { status: 413 }));
      chunks.push(chunk);
    }
  } catch {
    return toResponse(errorOutcome("INVALID_INPUT"));
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return toResponse(errorOutcome("INVALID_INPUT"));
  }
  const body = parseGuardRequest(value);
  if (!body) return toResponse(errorOutcome("INVALID_INPUT"));
  const scope = body.event_type === "prompt" ? "guard:prompt" : "guard:tool";
  try {
    identity = await resolveIntegrationToken(request.headers.get("authorization"), scope);
  } catch {
    return toResponse(errorOutcome("STATE_UNAVAILABLE"));
  }
  if (!identity) return toResponse(errorOutcome("ACCESS_DENIED"));
  const deps = gatewayDeps();
  try {
    const controls = await loadControls(deps, identity.actor);
    if (!controls?.policy.client_guard) return toResponse(errorOutcome("POLICY_UNAVAILABLE"));
    const classified =
      body.event_type === "tool"
        ? classifyGuardTool(body, controls.policy.client_guard)
        : { text: body.prompt };
    const outcome = await assessStandalone(deps, {
      ...identity,
      scope,
      stage: body.event_type === "prompt" ? "claude_prompt" : "claude_tool",
      text: classified.text,
      hardReason: classified.hardReason,
      idempotencyKey: stableGuardKey(identity.tokenId, body.event_id, body.event_type),
    });
    return toResponse(outcome);
  } catch {
    return toResponse(errorOutcome("STATE_UNAVAILABLE"));
  }
}
