/*
 * The reporting scope, parsed from the URL.
 *
 * Parsing is pure and strict so an unrecognised value can never reach the gateway as a query
 * parameter, and so the fallback is the narrower scope rather than the wider one: an unreadable
 * `?scope=` lands on own activity, never on the organisation.
 */
import type { Metrics } from "@/shared/contracts";

export type ReportingScope = Metrics["scope"];

export const SCOPES: readonly ReportingScope[] = ["own", "organisation"];

export function parseScope(value: string | string[] | undefined): ReportingScope {
  return value === "organisation" ? "organisation" : "own";
}
