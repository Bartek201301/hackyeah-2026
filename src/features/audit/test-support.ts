/*
 * Builders used only by this feature's tests. Values are synthetic and deliberately not
 * round, so a number appearing on screen can be traced back to the case that produced it.
 * The richer labelled response examples used for the browser pass live outside src, in the
 * research folder; nothing here is evidence of a real run.
 */
import type { Assessment, AuditProjection, Usage } from "@/shared/contracts";

type AuditEvent = NonNullable<AuditProjection["events"]>[number];

/** A completed allowed generation with Laya assessment; the numbers match the T08 worksheet. */
export function usage(overrides: Partial<Usage> = {}): Usage {
  return {
    generation_input_tokens: 1842,
    generation_output_tokens: 551,
    generation_ms: 7120,
    semantic_input_tokens: 2048,
    semantic_ms: 486,
    reserved_generation_tokens: 4096,
    unresolved_reservation: false,
    comparison_micro_usd: 18,
    comparison_rate_version: "illustrative-v1",
    ...overrides,
  };
}

export function assessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    status: "complete",
    scores: { instruction_manipulation: 0.08, sensitive_exposure: 0.12, resource_abuse: 0.04 },
    checkpoint_revision: "typed-decisions@3",
    windows_planned: 2,
    windows_completed: 2,
    coverage_complete: true,
    text_sha256: "9f2c4a1b8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3928170605f4e3",
    coverage_ranges: [
      { start_char: 0, end_char: 4096, input_tokens: 1024 },
      { start_char: 4096, end_char: 8192, input_tokens: 1024 },
    ],
    ...overrides,
  };
}

export function auditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    stage: "input_assessment",
    event_type: "intent",
    created_at: "2026-10-03T09:41:07.000Z",
    policy_version: 7,
    feed_version: 4,
    findings: [],
    semantic: assessment(),
    usage: usage(),
    ...overrides,
  };
}

export function projection(overrides: Partial<AuditProjection> = {}): AuditProjection {
  return {
    trace_id: "3f6c1d2e-9b47-4c81-a0f5-7d2e5b914c33",
    actor_id: "b17d9f40-2c3a-4e55-9d81-6f0a4c7b2e19",
    operation: "chat_answer",
    created_at: "2026-10-03T09:41:06.000Z",
    decision: "ALLOW",
    reasons: [],
    state: "complete",
    policy_version: 7,
    feed_version: 4,
    usage: usage(),
    ...overrides,
  };
}

/**
 * A full envelope. Its root values describe the audit READ, so they are intentionally
 * different from the inspected trace: a test that confused the two would show it here.
 */
export function envelope(
  overrides: { data?: unknown; error?: { code: string; message: string; retryable: boolean } | null } = {},
): Record<string, unknown> {
  return {
    trace_id: "0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
    decision: "ALLOW",
    reasons: [],
    policy_version: 9,
    feed_version: 5,
    semantic: assessment({ status: "not_required", windows_planned: 0, windows_completed: 0 }),
    usage: usage({ generation_input_tokens: 0, generation_output_tokens: 0, generation_ms: 0 }),
    timings: { total_ms: 24, deterministic_ms: 11, semantic_ms: 0, provider_ms: 0, persistence_ms: 13 },
    data: overrides.data ?? null,
    error: overrides.error ?? null,
  };
}
