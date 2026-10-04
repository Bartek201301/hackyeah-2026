import "server-only";
import { randomUUID } from "node:crypto";
import type {
  ActorContext,
  Assessment,
  DetectionPort,
  ErrorCode,
  Finding,
  GatewayPolicy,
  GenerationPort,
  ModelMessage,
  ThreatFeed,
  Usage,
} from "@/shared/contracts";
import manifest from "@/shared/contracts/runtime-manifest.json";
import verifier from "@/shared/contracts/security-verification.json";
import { check } from "@/shared/contracts/validate";
import { sha256Hex, utcDay, utf8Bytes, verifyCoverage } from "./checks";
import { envelope, errorOutcome, GatewayError } from "./envelope";
import type { BegunOperation, BudgetUnit, GatewayDeps, Outcome, RunRecord, StoredResult } from "./ports";

// Provider-call helpers shared by the run engines (chat, import, export): every provider call is
// reserved before dispatch and settled after it, and nothing here decides or discloses.

const UNKNOWN_OUTCOME = "The outcome of this run is unknown; it is kept for reconciliation.";
export const TERMINAL = new Set<string>([
  "completed",
  "review",
  "blocked",
  "failed",
  "incomplete",
  "cancelled",
]);

/** Early exit from a pipeline to finalize. */
export class Stop extends Error {
  constructor(readonly end: { error: ErrorCode }) {
    super("stop");
  }
}

export async function loadControls(deps: GatewayDeps, actor: ActorContext) {
  const c = await deps.repository.loadActivePolicyAndFeed(actor.organisation_id);
  if (!c) return null;
  const policy = check("GatewayPolicy", c.policy);
  const feed = check("ThreatFeed", c.feed);
  // An expired required feed is unavailable, not empty.
  if (!policy.ok || !feed.ok || !(Date.parse(c.feed_expires_at) > Date.now())) return null;
  return {
    policy: policy.value as GatewayPolicy,
    feed: feed.value as ThreatFeed,
    versions: { policy_version: c.policy_version, feed_version: c.feed_version },
  };
}

export const runVersions = (run: RunRecord) => ({
  policy_version: run.policy_version,
  feed_version: run.feed_version,
});

/** Terminal run → the stored result; the stored answer goes only to its owner (readRun is own-only). */
export function stored(run: RunRecord): Outcome | null {
  if (!TERMINAL.has(run.state)) return null;
  const r = run.result_private as StoredResult | null;
  if (!r) return errorOutcome("INCOMPLETE", { trace_id: run.id, ...runVersions(run) });
  const { status, ...fields } = r;
  return { status, body: envelope({ ...fields, trace_id: run.id, ...runVersions(run) }) };
}

export const leaseExpired = (run: RunRecord) =>
  run.state === "running" && run.lease_expires_at !== null && Date.parse(run.lease_expires_at) < Date.now();

export const unknownOutcome = (run: RunRecord) =>
  errorOutcome("INCOMPLETE", { trace_id: run.id, ...runVersions(run), message: UNKNOWN_OUTCOME });

/** run_read: own run of one of `kinds` → its stored result, unknown after a lost lease, else 202 + Run. */
export async function readOwnRun(
  deps: GatewayDeps,
  actor: ActorContext,
  runId: string,
  kinds: readonly RunRecord["kind"][],
): Promise<Outcome> {
  const run = await deps.repository.readRun(actor, runId);
  if (!run || !kinds.includes(run.kind)) return errorOutcome("NOT_FOUND");
  if (leaseExpired(run)) return unknownOutcome(run);
  return (
    stored(run) ?? {
      status: 202,
      body: envelope({
        trace_id: run.id,
        ...runVersions(run),
        data: { id: run.id, kind: run.kind, state: run.state, stage: run.stage },
      }),
    }
  );
}

export type Clock = ReturnType<typeof clock>;

/**
 * The execute skeleton every run kind shares: own run of this kind → stored result or lost lease →
 * validated controls → durable intent → lease. `exit` is an early answer with nothing to finalize;
 * otherwise the caller holds the lease and every later exit goes through finalize.
 */
export async function openRun(
  deps: GatewayDeps,
  actor: ActorContext,
  runId: string,
  idempotencyKey: string,
  kind: RunRecord["kind"],
  t: Clock,
) {
  const repo = deps.repository;
  const run = await t.time("persistence_ms", () => repo.readRun(actor, runId));
  if (!run || run.kind !== kind) return { exit: errorOutcome("NOT_FOUND") };
  const done = stored(run);
  if (done) return { exit: done };
  if (leaseExpired(run)) return { exit: unknownOutcome(run) };

  // Controls are validated before any intent is written.
  const controls = await t.time("persistence_ms", () => loadControls(deps, actor));
  if (!controls) return { exit: errorOutcome("POLICY_UNAVAILABLE", { trace_id: run.id }) };
  const { policy, versions } = controls;
  const op = await t.time("persistence_ms", () =>
    repo.beginOperation({
      actor,
      operation: "run_execute",
      idempotencyKey,
      requestSha256: sha256Hex(run.id),
      traceId: run.id,
      runId: run.id,
    }),
  );
  if (op.policy_version !== versions.policy_version || op.feed_version !== versions.feed_version)
    return { exit: errorOutcome("STATE_UNAVAILABLE", { trace_id: run.id, ...versions }) };
  const lease = await t.time("persistence_ms", () =>
    repo.claimRun(actor, run.id, policy.execution.max_elapsed_ms),
  );
  if (!lease) {
    const now = await t.time("persistence_ms", () => repo.readRun(actor, run.id));
    return { exit: (now && stored(now)) ?? errorOutcome("CONFLICT", { trace_id: run.id, ...versions }) };
  }
  return { run, ...controls, op, lease };
}

export function clock() {
  const start = performance.now();
  const spent = { deterministic_ms: 0, semantic_ms: 0, provider_ms: 0, persistence_ms: 0 };
  return {
    async time<T>(key: keyof typeof spent, fn: () => T | Promise<T>): Promise<T> {
      const s = performance.now();
      try {
        return await fn();
      } finally {
        spent[key] += performance.now() - s;
      }
    },
    timings: () => ({
      total_ms: Math.round(performance.now() - start),
      deterministic_ms: Math.round(spent.deterministic_ms),
      semantic_ms: Math.round(spent.semantic_ms),
      provider_ms: Math.round(spent.provider_ms),
      persistence_ms: Math.round(spent.persistence_ms),
    }),
  };
}

const count = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null);
const millis = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.ceil(n) : null);

/**
 * Reserve → call → settle for one run under its lease. `usage` and `findings` are the run's own
 * accumulators; `started` (a provider call was dispatched) and `open` (a reservation whose settlement
 * is not confirmed) tell finalize whether the outcome is unknown.
 */
export function createCalls({
  deps,
  policy,
  op,
  usage,
  t,
  overall,
  findings,
}: {
  deps: GatewayDeps;
  policy: GatewayPolicy;
  op: BegunOperation;
  usage: Usage;
  t: Clock;
  overall: AbortSignal;
  findings: Finding[];
}) {
  const repo = deps.repository;
  let semantic: Assessment | null = null;
  let started = false;
  let open = false;
  let modelTurns = 0;

  const reserve = async (
    callId: string,
    provider: "laya" | "ollama",
    units: { unit: BudgetUnit; amount: number; actor_limit: number; org_limit: number }[],
  ) => {
    // No new provider call after cancellation or the deadline.
    if (overall.aborted) throw new Stop({ error: "INCOMPLETE" });
    open = true;
    try {
      await t.time("persistence_ms", () =>
        repo.reserveCall({ operationId: op.operation_id, callId, provider, periodStart: utcDay(), units }),
      );
    } catch (e) {
      // All units or nothing: an exhausted budget leaves no reservation.
      if (e instanceof GatewayError && e.code === "BUDGET_EXHAUSTED") {
        open = false;
        throw new Stop({ error: "BUDGET_EXHAUSTED" });
      }
      throw e;
    }
    // Aborted while reserving: no call starts, which is positive evidence of zero usage.
    if (overall.aborted) {
      await finish(
        callId,
        units.map((u) => ({ unit: u.unit, actual: 0 })),
      );
      throw new Stop({ error: "INCOMPLETE" });
    }
  };
  const finish = async (callId: string, actuals: { unit: BudgetUnit; actual: number | null }[]) => {
    // A timeout or unknown usage never proves zero: null keeps the reservation unresolved.
    if (actuals.some((a) => a.actual === null)) usage.unresolved_reservation = true;
    await t.time("persistence_ms", () => repo.finishCall(callId, actuals));
    open = false;
  };

  /** `locator` is copied into the adapter's findings so a multi-unit run keeps them attributable. */
  const assess = async (
    text: string,
    operation: string,
    { audience = "actor", locator }: { audience?: "actor" | "public"; locator?: string } = {},
  ) => {
    const detection: DetectionPort | null = deps.detection;
    // Adapter not composed: no reservation, no call.
    if (!detection) throw new Stop({ error: "SEMANTIC_UNAVAILABLE" });
    const callId = randomUUID();
    const { semantic: sp, budgets } = policy;
    await reserve(callId, "laya", [
      {
        unit: "semantic_tokens",
        amount: sp.max_windows * sp.context_tokens,
        actor_limit: budgets.actor_semantic_tokens,
        org_limit: budgets.org_semantic_tokens,
      },
    ]);
    started = true;
    let result: Awaited<ReturnType<DetectionPort["assess"]>>;
    try {
      result = await t.time("semantic_ms", () =>
        detection.assess(
          { call_id: callId, text, operation, audience },
          policy,
          AbortSignal.any([overall, AbortSignal.timeout(sp.timeout_ms)]),
        ),
      );
    } catch {
      usage.semantic_input_tokens = null;
      await finish(callId, [{ unit: "semantic_tokens", actual: null }]);
      throw new Stop({ error: "SEMANTIC_UNAVAILABLE" });
    }
    const actual = count(result.semantic_input_tokens);
    usage.semantic_input_tokens =
      actual === null || usage.semantic_input_tokens === null ? null : usage.semantic_input_tokens + actual;
    usage.semantic_ms += millis(result.semantic_ms) ?? 0;
    await finish(callId, [{ unit: "semantic_tokens", actual }]);
    const covered = await t.time("deterministic_ms", () =>
      verifyCoverage(text, result.semantic, policy, manifest.laya_checkpoint_revision || null),
    );
    if (!covered) throw new Stop({ error: "SEMANTIC_UNAVAILABLE" });
    semantic = result.semantic;
    const found = locator ? result.findings.map((f) => ({ ...f, locator })) : result.findings;
    findings.push(...found);
    return { ...result, findings: found };
  };

  const generate = async (messages: readonly ModelMessage[], purpose?: "security_verification_v1") => {
    const generation: GenerationPort | null = deps.generation;
    if (!generation) throw new Stop({ error: "MODEL_UNAVAILABLE" });
    const callId = randomUUID();
    const { budgets } = policy;
    const ex = {
      ...policy.execution,
      ...(purpose ? { max_output_tokens: Math.min(128, policy.execution.max_output_tokens) } : {}),
    };
    if (modelTurns >= ex.max_model_turns) throw new Stop({ error: "INCOMPLETE" });
    // Reject an overlong verifier envelope before reservation/dispatch; never silently truncate it
    // or report the definitely-not-started call as unknown provider consumption.
    if (
      purpose &&
      utf8Bytes(JSON.stringify({ messages, tools: [], format: verifier.schema })) > ex.max_input_utf8_bytes
    )
      throw new Stop({ error: "INCOMPLETE" });
    const tokens =
      messages.reduce((n, m) => n + utf8Bytes(m.content), 0) +
      ex.template_token_reserve +
      ex.max_output_tokens;
    await reserve(callId, "ollama", [
      {
        unit: "generation_tokens",
        amount: tokens,
        actor_limit: budgets.actor_generation_tokens,
        org_limit: budgets.org_generation_tokens,
      },
      {
        unit: "generation_ms",
        amount: ex.provider_timeout_ms,
        actor_limit: budgets.actor_generation_ms,
        org_limit: budgets.org_generation_ms,
      },
    ]);
    usage.reserved_generation_tokens += tokens;
    modelTurns += 1;
    started = true;
    let g: Awaited<ReturnType<GenerationPort["generate"]>>;
    try {
      g = await t.time("provider_ms", () =>
        generation.generate(
          { call_id: callId, messages, tools: [], limits: ex, ...(purpose ? { purpose } : {}) },
          AbortSignal.any([overall, AbortSignal.timeout(ex.provider_timeout_ms)]),
        ),
      );
    } catch {
      Object.assign(usage, {
        generation_input_tokens: null,
        generation_output_tokens: null,
        generation_ms: null,
      });
      await finish(callId, [
        { unit: "generation_tokens", actual: null },
        { unit: "generation_ms", actual: null },
      ]);
      throw new Stop({ error: "MODEL_UNAVAILABLE" });
    }
    const inTokens = count(g.input_tokens);
    const outTokens = count(g.output_tokens);
    const ms = millis(g.duration_ms);
    Object.assign(usage, {
      generation_input_tokens:
        inTokens === null || usage.generation_input_tokens === null
          ? null
          : usage.generation_input_tokens + inTokens,
      generation_output_tokens:
        outTokens === null || usage.generation_output_tokens === null
          ? null
          : usage.generation_output_tokens + outTokens,
      generation_ms: ms === null || usage.generation_ms === null ? null : usage.generation_ms + ms,
    });
    await finish(callId, [
      {
        unit: "generation_tokens",
        actual: inTokens === null || outTokens === null ? null : inTokens + outTokens,
      },
      { unit: "generation_ms", actual: ms },
    ]);
    if (manifest.ollama_model_digest && g.model_digest !== manifest.ollama_model_digest)
      throw new Stop({ error: "MODEL_UNAVAILABLE" });
    if (overall.aborted) throw new Stop({ error: "INCOMPLETE" });
    return g;
  };

  return {
    assess,
    generate,
    reserve,
    finish,
    /** The last assessment whose coverage was verified. */
    get semantic() {
      return semantic;
    },
    get started() {
      return started;
    },
    get open() {
      return open;
    },
  };
}
