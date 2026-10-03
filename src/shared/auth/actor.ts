import "server-only";

import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { ActorContext } from "@/shared/contracts";
import { createSupabaseServer } from "@/shared/supabase/server";

type MembershipRow = { organisation_id: string; role: ActorContext["role"] };
type DealRow = { organisation_id: string; deal_id: string };

/** Exactly one active membership (RLS hides inactive ones); deals only from that organisation. */
export function toActorContext(
  actorId: string,
  memberships: readonly MembershipRow[],
  dealRows: readonly DealRow[],
): ActorContext | null {
  if (memberships.length !== 1) return null;
  const [{ organisation_id, role }] = memberships;
  return {
    actor_id: actorId,
    organisation_id,
    role,
    deal_ids: dealRows.filter((row) => row.organisation_id === organisation_id).map((row) => row.deal_id),
    audience: "actor",
    scopes: [],
  };
}

/**
 * Identity from the verified session JWT, role and deals from RLS-scoped membership rows.
 * null = no valid session or no single active membership (401). Throws when Supabase is
 * unavailable (503) — callers must never turn that into 401 or ALLOW.
 */
export async function getActor(): Promise<ActorContext | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getClaims();
  if (error && isAuthRetryableFetchError(error)) throw new Error("Auth unavailable", { cause: error });
  const actorId = data?.claims.sub;
  if (!actorId) return null;

  const [memberships, deals] = await Promise.all([
    supabase.from("memberships").select("organisation_id, role").eq("actor_id", actorId),
    supabase.from("deal_memberships").select("organisation_id, deal_id").eq("actor_id", actorId),
  ]);
  if (memberships.error || deals.error) {
    throw new Error("Membership read failed", { cause: memberships.error ?? deals.error });
  }
  return toActorContext(actorId, memberships.data, deals.data);
}
