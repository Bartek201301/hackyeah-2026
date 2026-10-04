import { describe, expect, it } from "vitest";
import type { ActorContext, Review } from "@/shared/contracts";
import { sha256Hex } from "./checks";
import { GatewayError } from "./envelope";
import type { GatewayDeps, RepositoryPort, ReviewRow } from "./ports";
import { listReviews, readReview, REVIEW_LIMIT } from "./reviews";

const ORG = "11111111-1111-4111-8111-111111111111";
const REVIEW_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";
const TRACE = "44444444-4444-4444-8444-444444444444";
const CANDIDATE = "Qualified AsterCloud sales pipeline is USD 176 million.";

const actorOf = (role: ActorContext["role"]): ActorContext => ({
  actor_id: "55555555-5555-4555-8555-555555555555",
  organisation_id: ORG,
  role,
  deal_ids: [],
  audience: "actor",
  scopes: [],
});
const admin = actorOf("admin");

// TEST FAKE: a review_requests row as the admin reads project it.
const row = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  id: REVIEW_ID,
  version: 2,
  candidate_text: CANDIDATE,
  classification: "restricted",
  status: "pending",
  document_id: "66666666-6666-4666-8666-666666666666",
  ...over,
});

type Opts = {
  rows: ReviewRow[];
  /** null = no such review for this organisation. */
  one: ReviewRow | null;
  /** false = the write failed; a GatewayError = the RPC's own refusal. */
  audit: boolean | GatewayError;
};

type Recorded = Parameters<RepositoryPort["recordAccessDecision"]>[0];

// TEST FAKE: unit tests only; the app never composes these.
function harness(over: Partial<Opts> = {}) {
  const o: Opts = { rows: [row()], one: row(), audit: true, ...over };
  const listed: { organisationId: string; limit: number }[] = [];
  const read: { organisationId: string; id: string }[] = [];
  const recorded: Recorded[] = [];
  const repository: Pick<RepositoryPort, "listReviews" | "readReview" | "recordAccessDecision"> = {
    async listReviews(organisationId, limit) {
      listed.push({ organisationId, limit });
      return o.rows;
    },
    async readReview(organisationId, id) {
      read.push({ organisationId, id });
      return o.one;
    },
    async recordAccessDecision(input) {
      recorded.push(input);
      if (o.audit instanceof GatewayError) throw o.audit;
      if (!o.audit) throw new Error("rpc unreachable");
      return { trace_id: TRACE, policy_version: 4, feed_version: 7 };
    },
  };
  const deps = { repository: repository as RepositoryPort, detection: null, generation: null } as GatewayDeps;
  return { deps, listed, read, recorded };
}

describe("listReviews", () => {
  it("returns the organisation's queue to an administrator", async () => {
    const { deps, listed } = harness({ rows: [row(), row({ id: OTHER_ID, status: "approved" })] });
    const { status, body } = await listReviews(deps, admin);

    expect(status).toBe(200);
    expect(body.decision).toBe("ALLOW");
    const items = (body.data as { items: Review[] }).items;
    expect(items.map((i) => i.id)).toEqual([REVIEW_ID, OTHER_ID]);
    expect(items[0]).toEqual(row());
    // Scope and cap come from here; the ordering is the query's (pending first, then newest).
    expect(listed).toEqual([{ organisationId: ORG, limit: REVIEW_LIMIT }]);
    expect(REVIEW_LIMIT).toBe(50);
    expect(body.trace_id).toBe(TRACE);
  });

  it.each(["employee", "analyst", "external"] as const)(
    "refuses %s before reading anything",
    async (role) => {
      const { deps, listed, recorded } = harness();
      const { status, body } = await listReviews(deps, actorOf(role));

      expect(status).toBe(403);
      expect(body.error?.code).toBe("ACCESS_DENIED");
      // Nothing is queried, so a non-admin cannot learn that a held candidate exists.
      expect(listed).toEqual([]);
      expect(recorded).toEqual([]);
      expect(body.data).toBeNull();
    },
  );

  it("audits the listing as ids and a count, never as candidate text", async () => {
    const { deps, recorded } = harness();
    await listReviews(deps, admin);

    expect(recorded[0]!.operation).toBe("review_list");
    expect(recorded[0]!.decision).toBe("ALLOW");
    expect(recorded[0]!.event).toEqual({
      stage: "access",
      result_count: 1,
      review_ids: [REVIEW_ID],
    });
    // Listing discloses candidate text, so the record must be checked as strictly as a read's.
    expect(JSON.stringify(recorded[0])).not.toContain(CANDIDATE);
  });

  it("releases no queue when the read could not be audited", async () => {
    const { deps } = harness({ audit: false });
    const { status, body } = await listReviews(deps, admin);
    expect(status).toBe(503);
    expect(body.error?.code).toBe("AUDIT_UNAVAILABLE");
    expect(body.data).toBeNull();
  });

  it("withholds the whole queue when one row does not match the contract", async () => {
    const { deps } = harness({ rows: [row(), row({ candidate_text: "" })] });
    const { status, body } = await listReviews(deps, admin);
    expect(status).toBe(503);
    expect(body.error?.code).toBe("STATE_UNAVAILABLE");
    expect(body.data).toBeNull();
  });
});

describe("readReview", () => {
  it("returns one candidate at its current version and audits the read", async () => {
    const { deps, read, recorded } = harness();
    const { status, body } = await readReview(deps, admin, REVIEW_ID);

    expect(status).toBe(200);
    expect(body.decision).toBe("ALLOW");
    expect(body.data).toEqual(row());
    expect(read).toEqual([{ organisationId: ORG, id: REVIEW_ID }]);
    expect(recorded[0]!.operation).toBe("review_read");
    expect(recorded[0]!.event).toEqual({ stage: "access", review_id: REVIEW_ID, version: 2 });
    expect(JSON.stringify(recorded[0])).not.toContain(CANDIDATE);
    // A fresh access decision every time, so a key cannot replay an earlier read.
    expect(recorded[0]!.idempotencyKey).toBeNull();
  });

  it("refuses a non-admin without touching the review", async () => {
    const { deps, read, recorded } = harness();
    const { status, body } = await readReview(deps, actorOf("external"), REVIEW_ID);
    expect(status).toBe(403);
    expect(body.error?.code).toBe("ACCESS_DENIED");
    expect(read).toEqual([]);
    expect(recorded).toEqual([]);
  });

  it("answers another organisation's review exactly as one that does not exist", async () => {
    const other = await readReview(harness({ one: null }).deps, admin, REVIEW_ID);
    const absent = await readReview(harness({ one: null }).deps, admin, OTHER_ID);

    expect(other.status).toBe(404);
    expect(other.body).toEqual(absent.body);
    expect(other.body.decision).toBeNull();
    expect(other.body.data).toBeNull();
  });

  it("records a refused read with no id in the payload", async () => {
    const { deps, recorded } = harness({ one: null });
    await readReview(deps, admin, REVIEW_ID);

    expect(recorded[0]!.decision).toBe("BLOCK");
    expect(recorded[0]!.reasons).toEqual(["review:unavailable"]);
    expect(recorded[0]!.event).toEqual({ stage: "access" });
    expect(JSON.stringify(recorded[0]!.event)).not.toContain(REVIEW_ID);
    expect(recorded[0]!.requestSha256).toBe(sha256Hex(REVIEW_ID));
  });

  it("releases no candidate when the read could not be audited", async () => {
    const { deps } = harness({ audit: false });
    const { status, body } = await readReview(deps, admin, REVIEW_ID);
    expect(status).toBe(503);
    expect(body.error?.code).toBe("AUDIT_UNAVAILABLE");
    expect(body.data).toBeNull();
  });

  it("passes on a refusal the audit RPC itself decided", async () => {
    const { deps } = harness({ audit: new GatewayError("CONFLICT") });
    const { status } = await readReview(deps, admin, REVIEW_ID);
    expect(status).toBe(409);
  });
});
