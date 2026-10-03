/*
 * View model for one audited trace. Pure, so every honesty rule below is testable:
 *  - actual, reserved and unknown resource use stay in separate groups and are never added up
 *  - a null measurement renders as "Not measured", never as 0
 *  - an unavailable or not-required assessment is never presented as a pass
 *  - stage durations are shown per stage and never summed across overlapping stages
 *  - a Finding carries no value, and this model does not add one
 */
import type { Assessment, AuditProjection, Decision, Finding, Usage } from "@/shared/contracts";
import type { Tone } from "@/shared/ui";
import { copy } from "./copy";
import {
  formatCount,
  formatDuration,
  formatElapsed,
  formatHash,
  formatRatio,
  formatRevision,
  formatScore,
  formatTimestampUtc,
  formatTokens,
  group,
} from "./format";

type AuditEvent = NonNullable<AuditProjection["events"]>[number];

export type ValueRow = { label: string; value: string };

export type UsageView = {
  actual: ValueRow[];
  reserved: ValueRow[];
  unknown: ValueRow[];
  unresolvedReservation: boolean;
};

export type FindingRow = {
  code: string;
  category: string;
  severity: Finding["severity"];
  stage: string;
  locator: string;
  tone: Tone;
};

export type AssessmentView = {
  statusLabel: string;
  statusTone: Tone;
  statusHint: string | null;
  scores: ValueRow[];
  windows: string;
  coverageComplete: boolean;
  coverageWarning: string | null;
  revision: string;
  hash: string;
  ranges: string;
};

export type StageRow = {
  key: string;
  stage: string;
  eventType: string;
  when: string;
  elapsed: string | null;
  policyVersion: number;
  feedVersion: number;
  policyChanged: boolean;
  feedChanged: boolean;
  findings: FindingRow[];
  assessment: AssessmentView;
  usage: UsageView;
};

export function decisionBadge(decision: Decision | null): {
  label: string;
  tone: Tone;
  hint: string | null;
} {
  switch (decision) {
    case "ALLOW":
      return { label: copy.decision.allow, tone: "success", hint: null };
    case "REDACT":
      return { label: copy.decision.redact, tone: "warning", hint: null };
    case "REVIEW":
      return { label: copy.decision.review, tone: "warning", hint: copy.decision.reviewHint };
    case "BLOCK":
      return { label: copy.decision.block, tone: "danger", hint: copy.disclaimer.blocked };
    default:
      // A missing decision is pending. Reading it as allowed would invert the safe default.
      return { label: copy.decision.pending, tone: "neutral", hint: copy.decision.pendingHint };
  }
}

export function findingTone(severity: Finding["severity"]): Tone {
  if (severity === "block") return "danger";
  if (severity === "review") return "warning";
  return "neutral";
}

export function findingRows(findings: readonly Finding[]): FindingRow[] {
  return findings.map((finding) => ({
    code: finding.code,
    category: finding.category,
    severity: finding.severity,
    stage: finding.stage,
    locator: finding.locator ?? copy.label.noLocator,
    tone: findingTone(finding.severity),
  }));
}

/**
 * Splits usage into the three groups required by the reporting rules. Measured values appear
 * only in `actual`, a reservation only in `reserved`, and every null only in `unknown`.
 */
export function usageView(usage: Usage): UsageView {
  const actual: ValueRow[] = [];
  const unknown: ValueRow[] = [];

  const measured = (label: string, value: number | null, format: (value: number) => string) => {
    if (value === null) unknown.push({ label, value: copy.label.notMeasured });
    else actual.push({ label, value: format(value) });
  };

  measured(copy.usage.generationInput, usage.generation_input_tokens, (value) => formatTokens(value));
  measured(copy.usage.generationOutput, usage.generation_output_tokens, (value) => formatTokens(value));
  measured(copy.usage.generationDuration, usage.generation_ms, (value) => formatDuration(value));
  measured(copy.usage.semanticInput, usage.semantic_input_tokens, (value) => formatTokens(value));
  // semantic_ms is the one duration the contract never leaves null.
  actual.push({ label: copy.usage.semanticDuration, value: formatDuration(usage.semantic_ms) });

  return {
    actual,
    reserved: [{ label: copy.usage.reservedTokens, value: formatTokens(usage.reserved_generation_tokens) }],
    unknown,
    unresolvedReservation: usage.unresolved_reservation,
  };
}

export function assessmentView(semantic: Assessment): AssessmentView {
  const status: Record<Assessment["status"], { label: string; tone: Tone; hint: string | null }> = {
    complete: { label: copy.assessment.complete, tone: "success", hint: null },
    // Neither of the next two is a pass, and the hint says so on screen.
    not_required: {
      label: copy.assessment.notRequired,
      tone: "neutral",
      hint: copy.assessment.notRequiredHint,
    },
    unavailable: {
      label: copy.assessment.unavailable,
      tone: "danger",
      hint: copy.assessment.unavailableHint,
    },
    incomplete: {
      label: copy.assessment.incomplete,
      tone: "warning",
      hint: copy.assessment.incompleteHint,
    },
  };
  const current = status[semantic.status] ?? status.unavailable;
  const assessedTokens = semantic.coverage_ranges.reduce((total, range) => total + range.input_tokens, 0);

  return {
    statusLabel: current.label,
    statusTone: current.tone,
    statusHint: current.hint,
    scores: [
      { label: copy.assessment.instruction, value: formatScore(semantic.scores.instruction_manipulation) },
      { label: copy.assessment.exposure, value: formatScore(semantic.scores.sensitive_exposure) },
      { label: copy.assessment.abuse, value: formatScore(semantic.scores.resource_abuse) },
    ],
    windows: formatRatio(semantic.windows_completed, semantic.windows_planned),
    coverageComplete: semantic.coverage_complete,
    coverageWarning: semantic.coverage_complete
      ? null
      : copy.state.coverageIncomplete
          .replace("{completed}", group(semantic.windows_completed))
          .replace("{planned}", group(semantic.windows_planned)),
    revision: formatRevision(semantic.checkpoint_revision),
    hash: formatHash(semantic.text_sha256),
    ranges: `${formatCount(semantic.coverage_ranges.length)} · ${formatTokens(assessedTokens)}`,
  };
}

/** Stages in stored order, each with its own measurements. Nothing is aggregated here. */
export function stageRows(events: readonly AuditEvent[] | undefined): StageRow[] {
  if (!events) return [];
  const ordered = [...events].sort(
    (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
  );

  return ordered.map((event, index) => {
    const previous = index > 0 ? ordered[index - 1] : null;
    return {
      key: `${event.created_at}-${event.stage}-${event.event_type}-${index}`,
      stage: event.stage,
      eventType: event.event_type,
      when: formatTimestampUtc(event.created_at),
      elapsed: previous ? formatElapsed(previous.created_at, event.created_at) : null,
      policyVersion: event.policy_version,
      feedVersion: event.feed_version,
      policyChanged: previous !== null && previous.policy_version !== event.policy_version,
      feedChanged: previous !== null && previous.feed_version !== event.feed_version,
      findings: findingRows(event.findings),
      assessment: assessmentView(event.semantic),
      usage: usageView(event.usage),
    };
  });
}
