import { describe, expect, it } from "vitest";
import policyJson from "../../../docs/contracts/policy.example.json";
import feedJson from "../../../docs/contracts/threat-feed.example.json";
import type { ActorContext } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import { readFeed, readPolicy } from "./controls";
import type { Controls, GatewayDeps, RepositoryPort } from "./ports";

const ORG = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";

const actorOf = (role: ActorContext["role"]): ActorContext => ({
  actor_id: "0c7e1b2a-3d4f-4a5b-8c6d-7e8f9a0b1c2d",
  organisation_id: ORG,
  role,
  deal_ids: [],
  audience: "actor",
  scopes: [],
});

const controls = (over: Partial<Controls> = {}): Controls => ({
  policy: structuredClone(policyJson),
  feed: structuredClone(feedJson),
  policy_version: 7,
  feed_version: 3,
  // Long expired on purpose: the enforcement path rejects this, the admin read must still show it.
  feed_expires_at: "2020-01-01T00:00:00.000Z",
  ...over,
});

// TEST FAKE: unit tests only; the app never composes these.
const deps = (value: Controls | null, seen: { organisationId?: string } = {}): GatewayDeps => {
  const repository: Pick<RepositoryPort, "loadActivePolicyAndFeed"> = {
    async loadActivePolicyAndFeed(organisationId) {
      seen.organisationId = organisationId;
      return value;
    },
  };
  return { repository: repository as RepositoryPort, detection: null, generation: null };
};

describe("policy_read and feed_read are administrator-only", () => {
  it.each(["analyst", "employee", "external"] as const)(
    "denies %s without reading anything",
    async (role) => {
      const seen: { organisationId?: string } = {};
      for (const read of [readPolicy, readFeed]) {
        const outcome = await read(deps(controls(), seen), actorOf(role));
        expect(outcome.status).toBe(403);
        expect(outcome.body.error?.code).toBe("ACCESS_DENIED");
        expect(outcome.body.data).toBeNull();
      }
      // The denial precedes the load: no control document is fetched for a non-administrator.
      expect(seen.organisationId).toBeUndefined();
    },
  );

  it("scopes the read to the actor's own organisation", async () => {
    const seen: { organisationId?: string } = {};
    await readPolicy(deps(controls(), seen), actorOf("admin"));
    expect(seen.organisationId).toBe(ORG);
  });
});

describe("readPolicy", () => {
  it("returns the active policy with the head versions", async () => {
    const outcome = await readPolicy(deps(controls()), actorOf("admin"));
    expect(outcome.status).toBe(200);
    expect(check("Response", outcome.body)).toEqual({ ok: true, value: outcome.body });
    expect(outcome.body.policy_version).toBe(7);
    expect(outcome.body.feed_version).toBe(3);
    expect(outcome.body.data).toEqual({ policy: policyJson });
  });

  it("withholds when no control head exists", async () => {
    const outcome = await readPolicy(deps(null), actorOf("admin"));
    expect(outcome.status).toBe(503);
    expect(outcome.body.error?.code).toBe("POLICY_UNAVAILABLE");
    expect(outcome.body.data).toBeNull();
  });

  it("withholds a stored document that is not a valid policy", async () => {
    const broken = { ...structuredClone(policyJson), mode: "whatever" };
    const outcome = await readPolicy(deps(controls({ policy: broken })), actorOf("admin"));
    expect(outcome.status).toBe(503);
    expect(outcome.body.error?.code).toBe("POLICY_UNAVAILABLE");
  });

  it("withholds a document carrying a field the contract does not name", async () => {
    // Both schemas are closed, so an unknown key fails closed instead of being served.
    const extra = { ...structuredClone(policyJson), operator_note: "do not show judges" };
    const outcome = await readPolicy(deps(controls({ policy: extra })), actorOf("admin"));
    expect(outcome.status).toBe(503);
    expect(JSON.stringify(outcome.body)).not.toContain("do not show judges");
  });
});

describe("readFeed", () => {
  it("returns the active feed with its indicators", async () => {
    const outcome = await readFeed(deps(controls()), actorOf("admin"));
    expect(outcome.status).toBe(200);
    expect(check("Response", outcome.body)).toEqual({ ok: true, value: outcome.body });
    expect(outcome.body.data).toEqual({ feed: feedJson });
    expect(outcome.body.feed_version).toBe(3);
  });

  it("still returns an expired feed, because that is what has to be replaced", async () => {
    // chat.ts treats an expired feed as unavailable; hiding it here would hide the cause.
    const outcome = await readFeed(deps(controls()), actorOf("admin"));
    expect(outcome.status).toBe(200);
    expect(Date.parse(controls().feed_expires_at)).toBeLessThan(Date.now());
  });

  it("withholds a stored document that is not a valid feed", async () => {
    const broken = { ...structuredClone(feedJson), indicators: "all of them" };
    const outcome = await readFeed(deps(controls({ feed: broken })), actorOf("admin"));
    expect(outcome.status).toBe(503);
    expect(outcome.body.error?.code).toBe("POLICY_UNAVAILABLE");
  });
});
