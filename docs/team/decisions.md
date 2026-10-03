# Accepted decisions

Accepted baseline 1.0 from the user-approved plan. Detailed fields/limits live in linked authoritative files. No open product-selection question remains; live credentials, GitHub owners and measured revisions are operational evidence to fill during named tasks.

| Decision                                                           | Rationale / authoritative detail                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Product name AI Control Gateway; AsterCloud fictional deal company | Prevent brand/domain confusion; [PRD](../product/requirements.md)                                                               |
| Gateway in server TypeScript/Next Route Handlers                   | Retains installed stack and makes one enforcement boundary; [architecture](../product/architecture.md)                          |
| Live Ollama and Laya on Mac required for demo                      | Uses available hardware; provider-neutral core does not make demo Laya optional; [technical spec](../product/technical-spec.md) |
| Four prepared password accounts, no anonymous/public signup        | Judge-ready roles with real identity and direct API tests; [role matrix](../product/requirements.md)                            |
| English UI/docs/code                                               | Explicit user choice supersedes earlier Polish UI/report rules; [DESIGN](../../DESIGN.md)                                       |
| CSV/text PDF and allowlisted own Supabase dataset                  | Bounded 19-hour scope; OCR/PPTX/Parquet/arbitrary connectors deferred                                                           |
| Private originals; distinct status/classification                  | Removing malicious content does not declassify useful restricted facts                                                          |
| Exact extract review and rescan                                    | Uncertain content requires accountable human decision, not blanket release                                                      |
| Public summaries are fresh PDFs                                    | Replaces synthetic email outbox; public-only generation context prevents analyst-answer leakage                                 |
| Fail closed on required assessment/state failure                   | Replaces permissive proposals; service errors separate from verdicts                                                            |
| Atomic durable reservations; local/commercial-unit paths           | Concurrent calls cannot reuse remaining allowance; simulated commercial accounting labelled                                     |
| Versioned central policy and bounded external feed                 | Judges can change rules/signatures; no scattered thresholds or uploaded executable code                                         |
| Postgres FTS                                                       | Small synthetic corpus does not need vector infrastructure                                                                      |
| Claude Code first MCP client, public-scoped token                  | One verified integration within deadline; ChatGPT OAuth later                                                                   |
| No fine-tuning / cloud fallback in this delivery                   | Report is preliminary; evaluate actual typed checkpoint first and expose outage honestly                                        |
| Four builders with existing feature boundaries                     | Shared contracts first, app composition injects detection; no feature cross-imports                                             |
| Actual evidence separate from pitch estimates                      | No invented latency/savings or production-security claim                                                                        |

Historical alternatives remain in [archive](../archive/README.md), not active choices. Change decisions through reviewed PRs with affected requirements/contracts/tests updated together. Task progress belongs in PRs.
