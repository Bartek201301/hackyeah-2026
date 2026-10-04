import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActorContext } from "@/shared/contracts";
import { createSupabaseAdmin } from "@/shared/supabase/admin";

const TOKEN = /^Bearer ([A-Za-z0-9_-]{43})$/;
const SHA256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export type IntegrationIdentity = { actor: ActorContext; tokenId: string };

/** A bearer token is an integration credential, never a browser session or provider credential. */
export async function resolveIntegrationToken(
  authorization: string | null,
  requiredScope: string | null,
  db: SupabaseClient = createSupabaseAdmin(),
): Promise<IntegrationIdentity | null> {
  const match = authorization?.match(TOKEN);
  if (!match) return null;
  const token = await db
    .from("access_tokens")
    .select("id, organisation_id, actor_id, scopes, audience, expires_at, revoked_at")
    .eq("token_sha256", SHA256(match[1]))
    .maybeSingle();
  if (token.error) throw new Error("Integration token lookup unavailable");
  const row = token.data;
  if (
    !row ||
    row.audience !== "public" ||
    row.revoked_at !== null ||
    !(Date.parse(row.expires_at) > Date.now()) ||
    !Array.isArray(row.scopes) ||
    (requiredScope !== null && !row.scopes.includes(requiredScope))
  )
    return null;
  const membership = await db
    .from("memberships")
    .select("role")
    .eq("organisation_id", row.organisation_id)
    .eq("actor_id", row.actor_id)
    .eq("active", true)
    .maybeSingle();
  if (membership.error) throw new Error("Integration actor lookup unavailable");
  if (!membership.data) return null;
  return {
    tokenId: row.id,
    actor: {
      actor_id: row.actor_id,
      organisation_id: row.organisation_id,
      role: membership.data.role,
      deal_ids: [],
      audience: "public",
      scopes: row.scopes,
    },
  };
}
