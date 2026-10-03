import { describe, expect, it } from "vitest";
import policyJson from "../../../docs/contracts/policy.example.json";
import feedJson from "../../../docs/contracts/threat-feed.example.json";
import type { ActorContext, Excerpt } from "@/shared/contracts";
import { sha256Hex } from "./checks";
import { GatewayError } from "./envelope";
import { readExcerpt, searchExcerpts } from "./excerpts";
import type { GatewayDeps, PermittedExcerpt, RepositoryPort } from "./ports";

const DEAL = "11111111-1111-4111-8111-111111111111";
const OTHER_DEAL = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";
const EX_ID = "44444444-4444-4444-8444-444444444444";
const ABSENT_ID = "55555555-5555-4555-8555-555555555555";
const TRACE = "66666666-6666-4666-8666-666666666666";
const QUERY = "FY2025 revenue";

const actor: ActorContext = {
  actor_id: "77777777-7777-4777-8777-777777777777",
  organisation_id: "88888888-8888-4888-8888-888888888888",
  role: "analyst",
  deal_ids: [DEAL],
  audience: "actor",
  scopes: [],
};

// TEST FAKE: a row shaped like search_permitted_excerpts output (migration F).
const row = (over: Partial<PermittedExcerpt> = {}): PermittedExcerpt => ({
  id: EX_ID,
  version: 2,
  text: "Finance workbook lists FY2025 revenue as USD 125 million.",
  classification: "restricted",
  locator: "row:12",
  source_date: "2026-04-02",
  period: "FY2025",
  unit: "USD million",
  basis: "actual",
  fact_key: "revenue",
  source_label: "ASTER finance workbook",
  ...over,
});

type Opts = {
  rows: PermittedExcerpt[];
  controls: boolean;
  /** false = the write failed; a GatewayError = the RPC's own refusal. */
  audit: boolean | GatewayError;
};

type Recorded = Parameters<RepositoryPort["recordAccessDecision"]>[0];

// TEST FAKE: unit tests only; the app never composes these.
function harness(over: Partial<Opts> = {}) {
  const o: Opts = { rows: [row()], controls: true, audit: true, ...over };
  const searches: Parameters<RepositoryPort["searchPermittedExcerpts"]>[1][] = [];
  const reads: Parameters<RepositoryPort["readPermittedExcerpts"]>[] = [];
  const recorded: Recorded[] = [];
  const repository: Pick<
    RepositoryPort,
    "loadActivePolicyAndFeed" | "searchPermittedExcerpts" | "readPermittedExcerpts" | "recordAccessDecision"
  > = {
    async loadActivePolicyAndFeed() {
      if (!o.controls) return null;
      return {
        policy: structuredClone(policyJson),
        feed: structuredClone(feedJson),
        policy_version: 4,
        feed_version: 7,
        feed_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      };
    },
    async searchPermittedExcerpts(_actor, input) {
      searches.push(input);
      return o.rows;
    },
    async readPermittedExcerpts(...args) {
      reads.push(args);
      return o.rows;
    },
    async recordAccessDecision(input) {
      recorded.push(input);
      if (o.audit instanceof GatewayError) throw o.audit;
      if (!o.audit) throw new Error("rpc unreachable");
      return { trace_id: TRACE, policy_version: 4, feed_version: 7 };
    },
  };
  const deps = { repository: repository as RepositoryPort, detection: null, generation: null } as GatewayDeps;
  return { deps, searches, reads, recorded };
}

describe("searchExcerpts", () => {
  it("returns the projected excerpt and its citation for a permitted row", async () => {
    const { deps, searches, recorded } = harness();
    const { status, body } = await searchExcerpts(deps, actor, { query: QUERY }, KEY);

    expect(status).toBe(200);
    expect(body.decision).toBe("ALLOW");
    const items = (body.data as { items: Excerpt[] }).items;
    expect(items).toEqual([
      {
        id: EX_ID,
        version: 2,
        text: row().text,
        classification: "restricted",
        citation: {
          excerpt_id: EX_ID,
          excerpt_version: 2,
          source_label: "ASTER finance workbook",
          source_date: "2026-04-02",
          period: "FY2025",
          locator: "row:12",
        },
      },
    ]);
    // Permissions are derived in SQL: only the audience and the policy limit are passed.
    expect(searches[0]).toEqual({
      query: QUERY,
      dealId: null,
      audience: "actor",
      limit: policyJson.execution.max_search_results,
    });
    // The trace and the versions are the audited ones, not invented here.
    expect(body.trace_id).toBe(TRACE);
    expect(body.policy_version).toBe(4);
    expect(recorded[0]!.operation).toBe("excerpt_search");
  });

  it("audits the query as a hash and a count, never as text", async () => {
    const { deps, recorded } = harness({ rows: [row(), row({ id: ABSENT_ID })] });
    await searchExcerpts(deps, actor, { query: QUERY, deal_id: DEAL }, KEY);

    const event = recorded[0]!.event;
    expect(event).toEqual({ stage: "retrieval", query_sha256: sha256Hex(QUERY), result_count: 2 });
    // Belt and braces: neither the question nor any excerpt text may appear anywhere in the record.
    const serialized = JSON.stringify(recorded[0]);
    expect(serialized).not.toContain(QUERY);
    expect(serialized).not.toContain(row().text);
    expect(recorded[0]!.decision).toBe("ALLOW");
  });

  it("narrows to a deal the actor is a member of", async () => {
    const { deps, searches } = harness();
    await searchExcerpts(deps, actor, { query: QUERY, deal_id: DEAL }, KEY);
    expect(searches[0]!.dealId).toBe(DEAL);
  });

  it("refuses a deal the actor is not a member of, without searching", async () => {
    const { deps, searches, recorded } = harness();
    const { status, body } = await searchExcerpts(deps, actor, { query: QUERY, deal_id: OTHER_DEAL }, KEY);

    expect(status).toBe(404);
    expect(body.error?.code).toBe("NOT_FOUND");
    // deal_id narrows and never grants: nothing is queried and nothing is audited as an access.
    expect(searches).toEqual([]);
    expect(recorded).toEqual([]);
  });

  it("withholds the result when the policy is unavailable", async () => {
    const { deps, searches } = harness({ controls: false });
    const { status, body } = await searchExcerpts(deps, actor, { query: QUERY }, KEY);
    expect(status).toBe(503);
    expect(body.error?.code).toBe("POLICY_UNAVAILABLE");
    expect(searches).toEqual([]);
  });

  it("releases nothing when the access could not be audited", async () => {
    const { deps } = harness({ audit: false });
    const { status, body } = await searchExcerpts(deps, actor, { query: QUERY }, KEY);
    expect(status).toBe(503);
    expect(body.error?.code).toBe("AUDIT_UNAVAILABLE");
    expect(body.data).toBeNull();
  });

  it("passes on a refusal the audit RPC itself decided", async () => {
    // A replayed Idempotency-Key with a different body is a conflict, not an unavailable audit.
    const { deps } = harness({ audit: new GatewayError("CONFLICT") });
    const { status, body } = await searchExcerpts(deps, actor, { query: QUERY }, KEY);
    expect(status).toBe(409);
    expect(body.error?.code).toBe("CONFLICT");
  });

  it("withholds the whole result when one row does not match the contract", async () => {
    const { deps } = harness({ rows: [row(), row({ id: "not-a-uuid" })] });
    const { status, body } = await searchExcerpts(deps, actor, { query: QUERY }, KEY);
    expect(status).toBe(503);
    expect(body.error?.code).toBe("STATE_UNAVAILABLE");
    expect(body.data).toBeNull();
  });
});

describe("readExcerpt", () => {
  it("returns one permitted excerpt and audits the access as allowed", async () => {
    const { deps, reads, recorded } = harness();
    const { status, body } = await readExcerpt(deps, actor, EX_ID);

    expect(status).toBe(200);
    expect(body.decision).toBe("ALLOW");
    expect((body.data as Excerpt).id).toBe(EX_ID);
    expect(reads[0]).toEqual([actor, "actor", [EX_ID]]);
    expect(recorded[0]!.operation).toBe("excerpt_read");
    expect(recorded[0]!.decision).toBe("ALLOW");
    expect(recorded[0]!.event).toEqual({ stage: "access", excerpt_id: EX_ID });
    // A fresh audited access every time: a replayed key must not return an earlier read.
    expect(recorded[0]!.idempotencyKey).toBeNull();
  });

  it("answers an id outside the actor's permissions exactly as an id that does not exist", async () => {
    const forbidden = await readExcerpt(harness({ rows: [] }).deps, actor, EX_ID);
    const absent = await readExcerpt(harness({ rows: [] }).deps, actor, ABSENT_ID);

    expect(forbidden.status).toBe(404);
    // Same body, so a 404 can never confirm that an excerpt exists.
    expect(forbidden.body).toEqual(absent.body);
    expect(forbidden.body.decision).toBeNull();
    expect(forbidden.body.data).toBeNull();
  });

  it("records a denied read without the id anywhere in the payload", async () => {
    const { deps, recorded } = harness({ rows: [] });
    await readExcerpt(deps, actor, EX_ID);

    expect(recorded[0]!.decision).toBe("BLOCK");
    expect(recorded[0]!.reasons).toEqual(["excerpt:unavailable"]);
    expect(recorded[0]!.event).toEqual({ stage: "access" });
    // The request hash is unavoidable; the id itself must not be readable from the record.
    expect(JSON.stringify(recorded[0]!.event)).not.toContain(EX_ID);
    expect(recorded[0]!.requestSha256).toBe(sha256Hex(EX_ID));
  });

  it("releases nothing when the access could not be audited", async () => {
    const { deps } = harness({ audit: false });
    const { status, body } = await readExcerpt(deps, actor, EX_ID);
    expect(status).toBe(503);
    expect(body.error?.code).toBe("AUDIT_UNAVAILABLE");
    expect(body.data).toBeNull();
  });
});
