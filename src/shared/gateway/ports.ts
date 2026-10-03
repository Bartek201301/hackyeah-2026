import type {
  ActorContext,
  ApiResponse,
  DetectionPort,
  GenerationPort,
  Run,
  Usage,
} from "@/shared/contracts";

export type BudgetUnit = "generation_tokens" | "generation_ms" | "semantic_tokens" | "commercial_micro_usd";
/** Raw head snapshot; the engine validates policy/feed before use. */
export type Controls = {
  policy: unknown;
  feed: unknown;
  policy_version: number;
  feed_version: number;
  feed_expires_at: string;
};
export type RunRecord = {
  id: string;
  kind: Run["kind"];
  state: Run["state"];
  stage: string;
  policy_version: number;
  feed_version: number;
  input_private: unknown;
  result_private: unknown;
  lease_expires_at: string | null;
};
export type StartedRun = {
  run_id: string;
  kind: Run["kind"];
  state: Run["state"];
  stage: string;
  replay: boolean;
  policy_version: number;
  feed_version: number;
};
export type BegunOperation = {
  operation_id: string;
  state: string;
  replay: boolean;
  policy_version: number;
  feed_version: number;
};
/** What run_read/replay returns later; stored privately in runs.result_private. */
export type StoredResult = Pick<
  ApiResponse,
  "decision" | "reasons" | "semantic" | "usage" | "data" | "error"
> & {
  status: number;
};
export type FinalOutcome = {
  run_state: Run["state"];
  operation_state: "completed" | "denied" | "unknown";
  operation: string;
  stage: string;
  decision: ApiResponse["decision"];
  reasons: string[];
  usage: Usage;
  result: StoredResult | null;
  /** Safe audit payload: stage, decision, reasons, findings, semantic, usage. Never prompt or answer text. */
  event: Record<string, unknown>;
};
/** Names follow protocols.md; startRun/readRun/claimRun are additions. Every method throws GatewayError
 *  carrying the RPC's ErrorCode, or STATE_UNAVAILABLE for anything else. */
export interface RepositoryPort {
  loadActivePolicyAndFeed(organisationId: string): Promise<Controls | null>;
  startRun(input: {
    actor: ActorContext;
    operation: string;
    kind: Run["kind"];
    idempotencyKey: string;
    requestSha256: string;
    traceId: string;
    inputPrivate: Record<string, unknown>;
  }): Promise<StartedRun>;
  beginOperation(input: {
    actor: ActorContext;
    operation: string;
    idempotencyKey: string;
    requestSha256: string;
    traceId: string;
    runId: string | null;
  }): Promise<BegunOperation>;
  /** Own runs only: organisation and actor must match. */
  readRun(actor: ActorContext, runId: string): Promise<RunRecord | null>;
  /** Returns the lease token, or null when the run is not pending. */
  claimRun(actor: ActorContext, runId: string, leaseMs: number): Promise<string | null>;
  reserveCall(input: {
    operationId: string;
    callId: string;
    provider: "laya" | "ollama";
    periodStart: string;
    units: { unit: BudgetUnit; amount: number; actor_limit: number; org_limit: number }[];
  }): Promise<void>;
  finishCall(
    callId: string,
    actuals: { unit: BudgetUnit; actual: number | null }[],
  ): Promise<{ settled: number; unresolved: number; overrun: boolean }>;
  /** false = the run was already terminal (settle once). */
  finalizeRun(input: {
    runId: string;
    leaseToken: string;
    operationId: string;
    outcome: FinalOutcome;
  }): Promise<boolean>;
}
/** null = adapter not composed → 503 before any reservation, never ALLOW. */
export type GatewayDeps = {
  repository: RepositoryPort;
  detection: DetectionPort | null;
  generation: GenerationPort | null;
};
export type Outcome = { status: number; body: ApiResponse };
