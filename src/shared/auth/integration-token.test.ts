import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { resolveIntegrationToken } from "./integration-token";

const RAW = "A".repeat(43);
const SHA = createHash("sha256").update(RAW).digest("hex");
const token: {
  id: string;
  organisation_id: string;
  actor_id: string;
  scopes: string[];
  audience: string;
  expires_at: string;
  revoked_at: string | null;
} = {
  id: "token",
  organisation_id: "org",
  actor_id: "actor",
  scopes: ["excerpt:search", "excerpt:read"],
  audience: "public",
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  revoked_at: null,
};

function fake(over: { token?: typeof token | null; membership?: { role: string } | null } = {}) {
  const filters: unknown[][] = [];
  const db = {
    from(table: string) {
      const query = {
        select() {
          return query;
        },
        eq(field: string, value: unknown) {
          filters.push([table, field, value]);
          return query;
        },
        async maybeSingle() {
          return {
            data:
              table === "access_tokens"
                ? over.token === undefined
                  ? token
                  : over.token
                : over.membership === undefined
                  ? { role: "admin" }
                  : over.membership,
            error: null,
          };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { db, filters };
}

describe("integration bearer identity", () => {
  it("hashes the credential and derives public scope from an active server membership", async () => {
    const { db, filters } = fake();
    const result = await resolveIntegrationToken(`Bearer ${RAW}`, "excerpt:search", db);
    expect(result?.actor).toEqual({
      actor_id: "actor",
      organisation_id: "org",
      role: "admin",
      deal_ids: [],
      audience: "public",
      scopes: ["excerpt:search", "excerpt:read"],
    });
    expect(filters).toContainEqual(["access_tokens", "token_sha256", SHA]);
    expect(filters).toContainEqual(["memberships", "organisation_id", "org"]);
    expect(filters).toContainEqual(["memberships", "actor_id", "actor"]);
    expect(filters).toContainEqual(["memberships", "active", true]);
    expect(JSON.stringify(filters)).not.toContain(RAW);
  });
  it("rejects malformed, missing, wrong-scope, revoked, expired and inactive credentials", async () => {
    for (const header of [null, "Bearer short", `Basic ${RAW}`])
      expect(await resolveIntegrationToken(header, "excerpt:search", fake().db)).toBeNull();
    expect(await resolveIntegrationToken(`Bearer ${RAW}`, "guard:tool", fake().db)).toBeNull();
    expect(
      await resolveIntegrationToken(
        `Bearer ${RAW}`,
        "excerpt:read",
        fake({ token: { ...token, revoked_at: new Date().toISOString() } }).db,
      ),
    ).toBeNull();
    expect(
      await resolveIntegrationToken(
        `Bearer ${RAW}`,
        "excerpt:read",
        fake({ token: { ...token, expires_at: new Date(Date.now() - 1000).toISOString() } }).db,
      ),
    ).toBeNull();
    expect(
      await resolveIntegrationToken(`Bearer ${RAW}`, "excerpt:read", fake({ membership: null }).db),
    ).toBeNull();
  });
});
