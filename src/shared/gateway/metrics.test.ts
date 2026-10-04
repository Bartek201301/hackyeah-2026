import { describe, expect, it } from "vitest";
import type { ActorContext, Usage } from "@/shared/contracts";
import { notExecutedUsage } from "./envelope";
import {
  METRICS_ROW_CAP,
  aggregate,
  aggregateUsage,
  parseScope,
  parseWindow,
  readMetrics,
  utcDayBounds,
} from "./metrics";
import type { GatewayDeps, MetricsActivityRow, MetricsReservationRow, RepositoryPort } from "./ports";

const actor: ActorContext = {
  actor_id: "0c7e1b2a-3d4f-4a5b-8c6d-7e8f9a0b1c2d",
  organisation_id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
  role: "analyst",
  deal_ids: [],
  audience: "actor",
  scopes: [],
};
const admin: ActorContext = { ...actor, role: "admin" };
const NOW = new Date("2026-10-03T14:22:51.000Z");

const usage = (overrides: Partial<Usage> = {}): Usage => ({
  ...notExecutedUsage("illustrative-v1"),
  generation_input_tokens: 1200,
  generation_output_tokens: 300,
  generation_ms: 900,
  semantic_input_tokens: 500,
  semantic_ms: 112,
  comparison_micro_usd: 46,
  ...overrides,
});

let seq = 0;
const row = (overrides: Partial<MetricsActivityRow> = {}): MetricsActivityRow => ({
  trace_id: `6f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e${String(++seq).padStart(2, "0")}`,
  decision: "ALLOW",
  reasons: [],
  usage: usage(),
  ...overrides,
});

// TEST FAKE: records what the engine asked the database for, and answers with fixed rows.
function fakeDeps(rows: { activity?: MetricsActivityRow[]; reservations?: MetricsReservationRow[] } = {}): {
  deps: GatewayDeps;
  calls: Parameters<RepositoryPort["readMetricsRows"]>[0][];
} {
  const calls: Parameters<RepositoryPort["readMetricsRows"]>[0][] = [];
  const repository = {
    async readMetricsRows(input: Parameters<RepositoryPort["readMetricsRows"]>[0]) {
      calls.push(input);
      return { activity: rows.activity ?? [], reservations: rows.reservations ?? [] };
    },
  } as unknown as RepositoryPort;
  return { deps: { repository, detection: null, generation: null }, calls };
}

const read = async (
  who: ActorContext,
  params: { scope?: string | null; from?: string | null; to?: string | null } = {},
  rows: Parameters<typeof fakeDeps>[0] = {},
) => {
  const { deps, calls } = fakeDeps(rows);
  const outcome = await readMetrics(
    deps,
    who,
    { scope: params.scope ?? null, from: params.from ?? null, to: params.to ?? null },
    NOW,
  );
  return { outcome, calls };
};

describe("the window", () => {
  it("defaults to the whole current UTC day", () => {
    expect(utcDayBounds(NOW)).toEqual({
      from: "2026-10-03T00:00:00.000Z",
      to: "2026-10-03T23:59:59.999Z",
    });
    expect(parseWindow(null, null, NOW)).toEqual(utcDayBounds(NOW));
  });

  it("accepts a range inside one UTC day", () => {
    expect(parseWindow("2026-10-03T08:00:00Z", "2026-10-03T09:00:00Z", NOW)).toEqual({
      from: "2026-10-03T08:00:00.000Z",
      to: "2026-10-03T09:00:00.000Z",
    });
  });

  it("refuses a longer or impossible range instead of clamping it", () => {
    // Clamping would report a period the caller did not ask about, under their heading.
    expect(parseWindow("2026-10-01T00:00:00Z", "2026-10-03T23:59:59Z", NOW)).toBeNull();
    expect(parseWindow("2026-10-03T09:00:00Z", "2026-10-03T08:00:00Z", NOW)).toBeNull();
    expect(parseWindow("yesterday", "2026-10-03T08:00:00Z", NOW)).toBeNull();
    expect(parseWindow("2026-10-03T08:00:00Z", null, NOW)).toBeNull();
    expect(parseWindow(null, "2026-10-03T08:00:00Z", NOW)).toBeNull();
  });

  it("is refused by the engine with the sentence the screen shows", async () => {
    const { outcome } = await read(actor, { from: "2026-10-01T00:00:00Z", to: "2026-10-03T00:00:00Z" });
    expect(outcome.status).toBe(400);
    expect(outcome.body.error).toMatchObject({ code: "INVALID_INPUT" });
    expect(outcome.body.error?.message).toBe("Select a range inside a single UTC day.");
  });
});

describe("the scope", () => {
  it("defaults to own and rejects anything it does not define", () => {
    expect(parseScope(null)).toBe("own");
    expect(parseScope("own")).toBe("own");
    expect(parseScope("organisation")).toBe("organisation");
    expect(parseScope("everyone")).toBeNull();
    expect(parseScope("ORGANISATION")).toBeNull();
  });

  it("filters own activity by the trusted actor, in the query", async () => {
    const { calls } = await read(actor, { scope: "own" });
    expect(calls[0].ownActorId).toBe(actor.actor_id);
    expect(calls[0].organisationId).toBe(actor.organisation_id);
  });

  it("refuses the organisation scope to a non-admin", async () => {
    const { outcome, calls } = await read(actor, { scope: "organisation" });
    expect(outcome.status).toBe(403);
    expect(outcome.body.error?.code).toBe("ACCESS_DENIED");
    // Nothing was read: the refusal happens before any organisation row is fetched.
    expect(calls).toEqual([]);
  });

  it("does not quietly downgrade a refused organisation request to own figures", async () => {
    const { outcome } = await read(actor, { scope: "organisation" }, { activity: [row()] });
    expect(outcome.body.data).toBeNull();
  });

  it("lets an admin read the whole organisation", async () => {
    const { outcome, calls } = await read(admin, { scope: "organisation" });
    expect(outcome.status).toBe(200);
    expect(calls[0].ownActorId).toBeNull();
  });
});

describe("the counters", () => {
  it("counts one root request per stored run, never a call inside one", async () => {
    const { outcome } = await read(actor, {}, { activity: [row(), row(), row()] });
    expect(outcome.body.data).toMatchObject({ root_requests: 3 });
  });

  it("keeps blocked attempts, loop stops and review cases apart", async () => {
    const activity = [
      row({ decision: "BLOCK", reasons: ["input_signature:SIG-001"] }),
      row({ decision: "BLOCK", reasons: ["generation:tool_call_refused"] }),
      row({ decision: "REVIEW", reasons: ["semantic:review_required"] }),
      row({ decision: "ALLOW" }),
    ];
    const { outcome } = await read(actor, {}, { activity });
    expect(outcome.body.data).toMatchObject({
      root_requests: 4,
      // A loop stop is a ceiling refusal and is not folded into the security counter.
      blocked_attempts: 1,
      stopped_loops: 1,
      review_cases: 1,
    });
  });

  it("reports an absent test report as unknown, not as zero failures", async () => {
    const { outcome } = await read(actor, {}, { activity: [row()] });
    expect(outcome.body.data).toMatchObject({ confirmed_test_failures: null });
  });

  it("withholds every estimate while no baseline is computed", async () => {
    const { outcome } = await read(actor, {}, { activity: [row()] });
    expect(outcome.body.data).toMatchObject({
      permitted_source_tokens_estimate: null,
      selected_source_tokens_estimate: null,
      context_reduction_percent: null,
      estimated_avoided_input_micro_usd: null,
      context_trace_id: null,
    });
  });
});

describe("the usage totals", () => {
  it("sums the settled usage of every trace in the window", () => {
    const total = aggregateUsage([row(), row()], []);
    expect(total).toMatchObject({
      generation_input_tokens: 2400,
      generation_output_tokens: 600,
      generation_ms: 1800,
      semantic_input_tokens: 1000,
      semantic_ms: 224,
      comparison_micro_usd: 92,
      comparison_rate_version: "illustrative-v1",
    });
  });

  it("lets one unknown make the total unknown, rather than understating it", () => {
    const total = aggregateUsage([row(), row({ usage: usage({ generation_input_tokens: null }) })], []);
    expect(total.generation_input_tokens).toBeNull();
    // The parts that were measured are still measured.
    expect(total.generation_output_tokens).toBe(600);
  });

  it("refuses to price a window that mixes rate versions", () => {
    const mixed = aggregateUsage(
      [row(), row({ usage: usage({ comparison_rate_version: "illustrative-v2" }) })],
      [],
    );
    expect(mixed.comparison_micro_usd).toBeNull();
    expect(mixed.comparison_rate_version).toBe("mixed");
  });

  it("prices a window whose other rows priced nothing (rate none, zero cost)", () => {
    const total = aggregateUsage([row(), row({ usage: notExecutedUsage() }), row()], []);
    expect(total.comparison_micro_usd).toBe(92);
    expect(total.comparison_rate_version).toBe("illustrative-v1");
    // A "none" row that does carry a price is still a different rate.
    const odd = aggregateUsage([row(), row({ usage: usage({ comparison_rate_version: "none" }) })], []);
    expect(odd.comparison_rate_version).toBe("mixed");
    // Only unpriced rows: zero under "none".
    const idle = aggregateUsage([row({ usage: notExecutedUsage() })], []);
    expect(idle.comparison_micro_usd).toBe(0);
    expect(idle.comparison_rate_version).toBe("none");
  });

  it("counts only reservations that are still outstanding, and never adds them to actual use", () => {
    const reservations: MetricsReservationRow[] = [
      { unit: "generation_tokens", amount: 4096, state: "reserved" },
      { unit: "generation_tokens", amount: 2048, state: "unresolved" },
      { unit: "generation_tokens", amount: 9999, state: "settled" },
      { unit: "generation_tokens", amount: 8888, state: "released" },
      { unit: "semantic_tokens", amount: 512, state: "reserved" },
    ];
    const total = aggregateUsage([row()], reservations);
    expect(total.reserved_generation_tokens).toBe(6144);
    expect(total.unresolved_reservation).toBe(true);
    expect(total.generation_input_tokens).toBe(1200);
  });

  it("treats a charged reservation as spent with an unknown actual: not outstanding, not zero", () => {
    const total = aggregateUsage(
      [row()],
      [
        { unit: "semantic_tokens", amount: 65536, state: "charged" },
        { unit: "generation_tokens", amount: 4096, state: "charged" },
      ],
    );
    // Not outstanding.
    expect(total.reserved_generation_tokens).toBe(0);
    expect(total.unresolved_reservation).toBe(false);
    // Not zero and not the measured figure alone: the actual is unknown.
    expect(total.semantic_input_tokens).toBeNull();
    expect(total.generation_input_tokens).toBeNull();
    expect(total.generation_output_tokens).toBeNull();
    expect(total.comparison_micro_usd).toBeNull();
    // A unit with no charged reservation stays measured.
    expect(total.generation_ms).toBe(900);
    expect(total.semantic_ms).toBe(112);
  });

  it("reports no outstanding reservation when every one is reconciled", () => {
    const total = aggregateUsage([row()], [{ unit: "generation_tokens", amount: 4096, state: "settled" }]);
    expect(total.reserved_generation_tokens).toBe(0);
    expect(total.unresolved_reservation).toBe(false);
  });

  it("reports a quiet window as measured zeros, because no row is a real absence of work", () => {
    const empty = aggregate("own", utcDayBounds(NOW), [], []);
    expect(empty.root_requests).toBe(0);
    expect(empty.usage.generation_input_tokens).toBe(0);
    expect(empty.usage.unresolved_reservation).toBe(false);
  });
});

describe("the response", () => {
  it("echoes the scope and the window it actually used", async () => {
    const { outcome } = await read(actor, { scope: "own" }, { activity: [row()] });
    expect(outcome.body.data).toMatchObject({
      scope: "own",
      from: "2026-10-03T00:00:00.000Z",
      to: "2026-10-03T23:59:59.999Z",
    });
  });

  it("describes the read itself at the root, not the window", async () => {
    const { outcome } = await read(actor, {}, { activity: [row({ decision: "BLOCK" })] });
    expect(outcome.body.decision).toBe("ALLOW");
    expect(outcome.body.error).toBeNull();
  });

  it("refuses a window larger than one read can total", async () => {
    const activity = Array.from({ length: METRICS_ROW_CAP + 1 }, () => row());
    const { outcome } = await read(actor, {}, { activity });
    expect(outcome.status).toBe(400);
    expect(outcome.body.error?.message).toContain("1000 records");
    expect(outcome.body.data).toBeNull();
  });

  it("still totals a window of exactly the cap", async () => {
    const activity = Array.from({ length: METRICS_ROW_CAP }, () => row());
    const { outcome, calls } = await read(actor, {}, { activity });
    expect(outcome.status).toBe(200);
    expect(outcome.body.data).toMatchObject({ root_requests: METRICS_ROW_CAP });
    // Read one past the cap, so "at the cap" and "over the cap" are distinguishable.
    expect(calls[0].limit).toBe(METRICS_ROW_CAP + 1);
  });

  it("withholds the window when a stored usage does not match the contract", async () => {
    const broken = row();
    (broken.usage as unknown as Record<string, unknown>).semantic_ms = "fast";
    const { outcome } = await read(actor, {}, { activity: [broken] });
    expect(outcome.status).toBe(503);
    expect(outcome.body.error?.code).toBe("STATE_UNAVAILABLE");
    expect(outcome.body.data).toBeNull();
  });
});
