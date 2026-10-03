import "server-only";
import Ajv2020 from "ajv/dist/2020";
import policySchema from "../../../../docs/contracts/policy.schema.json";
import type { GatewayPolicy } from "@/shared/contracts";

export type FailureCode =
  | "invalid_input"
  | "invalid_response"
  | "revision_mismatch"
  | "incomplete"
  | "http_error"
  | "unavailable"
  | "timeout"
  | "cancelled"
  | "body_limit";
/** Private provider evidence, never a public API error or a reservation-release instruction. */
export class ProviderFailure extends Error {
  constructor(
    readonly code: FailureCode,
    readonly dispatched = false,
    readonly input_tokens: number | null = null,
    readonly output_tokens: number | null = null,
  ) {
    super(code);
    this.name = "ProviderFailure";
  }
}
export function requireValue(condition: unknown, code: FailureCode = "invalid_response"): asserts condition {
  if (!condition) throw new ProviderFailure(code);
}
export function object(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
export function keys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  requireValue(
    required.every((key) => Object.hasOwn(value, key)) &&
      Object.keys(value).every((key) => required.includes(key) || optional.includes(key)),
  );
}
export function count(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  requireValue(Number.isSafeInteger(value) && (value as number) >= 0);
  return value as number;
}
export function requiredCount(value: unknown): number {
  const parsed = count(value);
  requireValue(parsed !== null);
  return parsed;
}
export function scalar(value: unknown): number {
  requireValue(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
  return value;
}
export function uuid(value: unknown): asserts value is string {
  requireValue(
    typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}
export function text(value: unknown): asserts value is string {
  requireValue(typeof value === "string" && value.isWellFormed());
}
export function bytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

const ajv = new Ajv2020({ strict: true });
const semanticSchema = ajv.compile(policySchema.properties.semantic);
const executionSchema = ajv.compile(policySchema.properties.execution);
export function semanticLimits(value: GatewayPolicy["semantic"]) {
  requireValue(semanticSchema(value) && value.overlap_tokens < value.window_tokens, "invalid_input");
}
export function executionLimits(value: GatewayPolicy["execution"]) {
  requireValue(
    executionSchema(value) &&
      value.max_input_utf8_bytes + value.template_token_reserve + value.max_output_tokens <=
        value.context_tokens &&
      value.provider_timeout_ms <= value.max_elapsed_ms,
    "invalid_input",
  );
}
/** Convert validation failures without retaining input, thrown causes, headers or provider bodies. */
export function inputOnly<T>(validate: () => T): T {
  try {
    return validate();
  } catch {
    throw new ProviderFailure("invalid_input");
  }
}
