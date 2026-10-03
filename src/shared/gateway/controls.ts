import "server-only";
import { randomUUID } from "node:crypto";
import type { ActorContext, ApiResponse } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import { envelope, errorOutcome } from "./envelope";
import type { GatewayDeps, Outcome } from "./ports";

/*
 * policy_read and feed_read: the active control documents, for an administrator only.
 *
 * requirements.md §2 gives "change policy/feed" to the administrator alone, and the documents name
 * every threshold and indicator the gateway enforces, so the read is as privileged as the write.
 * The organisation filter lives in loadActivePolicyAndFeed, which queries the head by
 * organisation_id — the gateway client bypasses RLS, so that filter is the access boundary.
 *
 * No audit write: this reads configuration, not protected content (same rule as the source list).
 *
 * The stored documents are validated against the published schemas before release. Both schemas are
 * closed (`additionalProperties: false`), so a document carrying anything the contract does not name
 * fails the check and withholds the whole read instead of leaking an unknown field.
 */

type Document = "policy" | "feed";

async function readControlDocument(deps: GatewayDeps, actor: ActorContext, want: Document): Promise<Outcome> {
  // Deterministic, server-side, before any read: the browser never asserts a role.
  if (actor.role !== "admin") return errorOutcome("ACCESS_DENIED");
  const controls = await deps.repository.loadActivePolicyAndFeed(actor.organisation_id);
  if (!controls) return errorOutcome("POLICY_UNAVAILABLE");

  // Releases the validated value, never the raw row: what is served passed the published schema.
  const released = (data: ApiResponse["data"]): Outcome => ({
    status: 200,
    body: envelope({
      trace_id: randomUUID(),
      decision: "ALLOW",
      policy_version: controls.policy_version,
      feed_version: controls.feed_version,
      data,
    }),
  });

  // Deliberately no expiry gate here, unlike the enforcement path in chat.ts: an expired feed is
  // exactly what an administrator needs to see in order to replace it. Expiry still stops chat.
  // Each document is narrowed in its own branch; one shared `checked` would widen both types.
  if (want === "policy") {
    const checked = check("GatewayPolicy", controls.policy);
    return checked.ok ? released({ policy: checked.value }) : errorOutcome("POLICY_UNAVAILABLE");
  }
  const checked = check("ThreatFeed", controls.feed);
  return checked.ok ? released({ feed: checked.value }) : errorOutcome("POLICY_UNAVAILABLE");
}

export const readPolicy = (deps: GatewayDeps, actor: ActorContext): Promise<Outcome> =>
  readControlDocument(deps, actor, "policy");

export const readFeed = (deps: GatewayDeps, actor: ActorContext): Promise<Outcome> =>
  readControlDocument(deps, actor, "feed");
