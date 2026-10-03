# Protected bridge — security, usage and recovery research

Researched 3 October 2026. T04; R01/R09/R10/R16; AT13 with AT07/08 support. Outcome: an interrupted request cannot expose unchecked output, silently spend twice, or erase uncertain usage. The authoritative [bridge protocol](../../../docs/contracts/protocols.md) already selects a Python bridge and local SQLite ledger; this brief compares implementation approaches without defining a replacement API.

## Fixed boundary and evidence

The gateway alone receives trusted actor context, reserves budgets and records durable audit. The bridge accepts its bearer-authenticated requests on fixed generation, assessment, health, lookup and cancellation routes. It has no database service key and cannot grant permissions. Only its loopback port is tunneled through HTTPS; raw Ollama/Laya ports remain local.

The project requires constant-time token comparison. Python's [hmac.compare_digest](https://docs.python.org/3/library/hmac.html) supplies the comparison primitive, but strict header parsing, required configuration, bounds and TLS are separate responsibilities. Reject absent/empty startup secrets; do not make an unset secret disable authentication. Health and ledger endpoints need the same bridge authentication, regardless of upstream Laya's public liveness behavior.

[FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/) provides a place to open/close clients and the ledger and perform readiness checks. It does not create durable jobs. The inspected Laya 0.3.24 server already uses a single inference worker behind bounded admission; launching many bridge workers will not automatically add model capacity. Uvicorn worker multiplication also multiplies in-memory queues and cancellation registries. Recommendation: begin with one bridge process and explicit bounded provider admission, then measure. This is an operational recommendation for Bartosz, not a change to central policy.

## Choices and recommendations

| Concern            | Recommended direction                                                                                                                                      | Alternative and cost                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Request validation | Strict allowlisted fields, UUID call IDs, fixed model/questions/tools, central policy subset checked against hard ceilings; count body bytes while reading | Trusting Content-Length or schema validation after an unbounded read allows resource exhaustion before validation    |
| Provider transport | Fixed configured loopback endpoints, no redirects, explicit connect/read/pool timeouts and total deadline; bounded JSON response bytes                     | Generic proxy/SDK retries can introduce unapproved destinations or duplicate effects                                 |
| Queue              | Explicit admission cap and queue deadline inside total call budget; keep health/cancel responsive                                                          | Unlimited waiting hides load and can outlive the gateway reservation/run deadline                                    |
| Durable ledger     | SQLite transaction commits accepted intent before dispatch and completed result before successful response                                                 | In-memory deduplication loses its safety property after restart                                                      |
| Ledger journaling  | Evaluate WAL with `synchronous=FULL`, short transactions and a busy timeout; disk errors withhold new dispatch                                             | WAL NORMAL offers different power-loss durability; do not treat speed as permission to lose accepted/completed state |
| Retry              | Same call ID and identical canonical payload returns retained state/result; changed payload conflicts                                                      | New IDs or automatic retry after timeout can perform the same generation twice                                       |

[SQLite WAL](https://www.sqlite.org/wal.html) permits readers alongside a writer but still serializes writers and has checkpoint/sidecar considerations. [Synchronous settings](https://www.sqlite.org/pragma.html#pragma_synchronous) distinguish durability choices. The local ledger must live on persistent local storage, not a temporary directory or network share. A Python asyncio timeout does not terminate synchronous model inference; cancellation must distinguish stopping future work from proving prior compute stopped.

## Failure evidence the ledger must support

| Boundary                                                       | Safe observable outcome to establish in tests                                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Reject before durable acceptance                               | No provider dispatch; a positively established no-effect outcome can release the reservation                           |
| Duplicate ID while accepted/running                            | Return existing status; no second worker or provider request                                                           |
| Accepted intent committed, process dies before dispatch marker | Retain evidence; only claim zero usage when durable state proves dispatch could not have happened                      |
| Dispatch or result uncertainty, including restart              | Mark unknown and retain reservation; never start another inference to reconstruct the answer                           |
| Provider completes, ledger completion fails                    | Withhold result; caller usage remains unresolved until reliable reconciliation                                         |
| Completion committed, HTTP response lost                       | Replay the retained completed result with the same ID; no extra inference                                              |
| Cancel before dispatch                                         | Record cancellation/no dispatch; no new provider effect                                                                |
| Cancel during inference                                        | Stop later windows/calls, request provider cancellation and report honest known/unknown usage; no unchecked disclosure |
| Ledger full, locked beyond deadline, corrupt or unavailable    | Reject new protected work; do not fall back to an in-memory ledger                                                     |

This is at-most-once dispatch discipline with explicit uncertainty, not a distributed exactly-once guarantee. The model server and SQLite cannot commit atomically. A dispatch marker must be durable before sending; the crash gap then becomes unknown, never evidence that a retry is safe. Bartosz owns reservation reconciliation in Supabase and the gateway policy applied to any replayed result.

## Privacy, retention and missing configuration

Store request hashes and bounded status/usage metadata instead of raw prompts. A cached generated result can itself contain restricted content: keep it in the private local result store, accessible only to the gateway service, never health/log output. A status lookup should return status/usage, not result text by default. Replay through the gateway still needs current permission/policy/output checks. The ledger is a protected operational store, not a sanitized audit projection.

Research recommendation: retain deduplication tombstones for the configured audit window even if protected result payloads are removed sooner under an agreed retention rule. Expiry must not silently make an old call ID dispatchable. Audit retention, result retention, ledger disk cap and post-expiry rejection need explicit coordination. The protocol requires audit-window retention but passes only execution/semantic subsets to provider requests; these do not convey retention or queue policy. See D04/D05 in the [decision register](../integration/contracts-and-open-decisions.md).

The same register asks Bartosz to define typed failure/lookup/cancel handoffs. `GenerationResult.finished=false` cannot by itself express queued, rejected-before-dispatch, cancelled and unknown outcomes or safely release reservations. Maciej should not invent a parallel public envelope or budget API.

## Verification and handoff

Future feature tests should count provider dispatches through duplicate concurrent requests, changed hashes, restart at each durable boundary, slow reads, oversized/chunked bodies, oversized responses, cancellation, and disk failures. Validate missing/wrong bearer and forbidden model/URL/tool inputs cause zero provider calls. Use synthetic local state; no shared Supabase resets.

Future integration tests jointly owned with Bartosz must show reservation-before-effect, unknown retained after timeout, replay without duplicate consumption and output withheld after audit failure. Review logs for absence of secrets, prompts and provider exception detail. Shutdown tests should show admission stops, live work is tracked, and unresolved jobs remain recoverable.

Not run: bridge code/tests, SQLite crash injection, authentication checks, tunnel checks, inference cancellation, Supabase reconciliation or load measurement. The project's security-review guidance was applied as a research checklist, not a certification.
