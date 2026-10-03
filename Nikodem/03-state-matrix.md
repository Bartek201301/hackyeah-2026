# 03 — State matrix and English copy

Every state below must be reachable in the running feature and provable by a fixture. Views:
**A** trace list · **B** trace detail · **C** personal dashboard · **D** organisation dashboard ·
**E** CSV export control.

Copy is the exact English string to ship. Short, actionable, no exclamation marks, no blame
(`DESIGN.md`). Status is never communicated by colour alone — every tone carries text or an icon.

## 1. Matrix

| State                                | Trigger                                                        | Views   | Block                       | Copy                                                                                                             | Must not appear                                | Fixture                             |
| ------------------------------------ | -------------------------------------------------------------- | ------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------- |
| Loading                              | request in flight                                              | A B C D | `LoadingState label=…`      | `Loading audit records…` / `Loading metrics…`                                                                    | Polish default label                           | —                                   |
| Empty day                            | 200, `items: []` / all-zero metrics                            | A C D   | `EmptyState`                | `No audit records for this UTC day.` · `Choose another day to see earlier activity.`                             | `0` presented as a measurement of nothing      | `metrics-own-employee-empty.json`   |
| Success — own scope                  | 200, `scope: "own"`                                            | A B C   | normal render               | `Own activity`                                                                                                   | another actor's row                            | `metrics-own-analyst-allow.json`    |
| Success — organisation scope         | 200, `scope: "organisation"`, admin                            | A D     | normal render               | `Organisation activity`                                                                                          | totals computed from one page                  | `metrics-org-admin-full.json`       |
| Organisation requested by non-admin  | 403 `ACCESS_DENIED`                                            | D E     | `Notice tone="danger"`      | `Organisation reporting is not available to your account.`                                                       | reason why, or any organisation figure         | `error-403-organisation.json`       |
| Unauthenticated                      | 401 `UNAUTHENTICATED`                                          | all     | `ErrorState` + sign-in link | `Your session has ended.` · `Sign in again to view audit records.`                                               | stale cached numbers                           | `error-401-unauthenticated.json`    |
| Trace not found or not yours         | 404 `NOT_FOUND`                                                | B       | `ErrorState`                | `This trace is not available.` · `Check the trace identifier, or return to your activity list.`                  | any hint that the id exists                    | `error-404-trace.json`              |
| Invalid range                        | 400 `INVALID_INPUT` (range beyond one UTC day)                 | C D E   | `Field error` on the picker | `Select a range inside a single UTC day.`                                                                        | a silently clamped range                       | `error-400-invalid-range.json`      |
| Rate limited / budget refusal        | 429 `RATE_LIMITED` or `BUDGET_EXHAUSTED`                       | all     | `Notice tone="danger"`      | `Too many requests. Try again shortly.`                                                                          | a retry loop                                   | `error-429-rate-limited.json`       |
| Audit store unavailable              | 503 `AUDIT_UNAVAILABLE`, `decision: null`                      | A B C D | `ErrorState` + retry        | `Audit records are unavailable.` · `The record for a recent operation may not exist yet.`                        | `0` counters, or a claim that nothing happened | `error-503-audit-unavailable.json`  |
| Durable state unavailable            | 503 `STATE_UNAVAILABLE`                                        | A B C D | `ErrorState` + retry        | `Reporting state is unavailable.` · `Values shown earlier may be out of date.`                                   | partial numbers presented as current           | `error-503-state-unavailable.json`  |
| Incomplete trace                     | projection `state: "incomplete"` or `error.code: "INCOMPLETE"` | A B     | `Badge warning` + `Notice`  | `Incomplete operation.` · `Usage is retained as reserved until it is reconciled.`                                | an answer, or zeroed usage                     | `audit-detail-incomplete.json`      |
| Cancelled operation                  | projection reasons include `CANCELLED`                         | A B     | `Badge neutral`             | `Cancelled.` · `Cancellation does not prove the provider stopped work.`                                          | `0 ms`, `0 tokens` as proven values            | `audit-detail-incomplete.json`      |
| Unknown usage                        | nullable usage fields are `null`                               | A B C D | value slot                  | `Not measured`                                                                                                   | `0`                                            | `audit-detail-incomplete.json`      |
| Unresolved reservation               | `usage.unresolved_reservation: true`                           | A B C D | `Badge warning`             | `Unresolved reservation retained`                                                                                | adding reserved into actual                    | `audit-detail-incomplete.json`      |
| Reduction denominator zero / no chat | `context_reduction_percent: null`                              | C D     | stat value                  | `N/A` · hint `No completed chat in this scope and day.`                                                          | `0%`                                           | `metrics-org-zero-denominator.json` |
| Confirmed test failures unknown      | `confirmed_test_failures: null`                                | C D     | stat value                  | `Unknown` · hint `No dated test report yet.`                                                                     | `0`, `0 breaches`                              | `metrics-own-analyst-allow.json`    |
| Semantic assessment unavailable      | `semantic.status: "unavailable"`                               | B       | `Badge danger`              | `Assessment unavailable` · `Required assessment did not complete; the operation was withheld.`                   | treating it as a pass                          | `audit-detail-incomplete.json`      |
| Coverage incomplete                  | `semantic.coverage_complete: false`                            | B       | `Notice tone="danger"`      | `Coverage incomplete: {completed} of {planned} windows assessed.`                                                | a clean checkmark                              | `audit-detail-incomplete.json`      |
| Page cap reached                     | `items.length === 100`                                         | A       | footer caption + button     | `Showing the 100 most recent records.` · button `Load older records`                                             | implying the list is everything                | `audit-list-admin-page-cap.json`    |
| Event cap reached                    | server narrowing instruction for >200 events                   | B       | `Notice tone="info"`        | `This trace has more stages than one response can return.` · `Narrow the range to inspect the remaining stages.` | a partial stage list shown as complete         | `audit-detail-event-cap.json`       |
| CSV over row cap                     | export request exceeding 1000 rows                             | E       | `Notice tone="info"`        | `This export exceeds 1000 rows.` · `Narrow the scope or the day and request it again.`                           | a silently truncated file                      | `error-export-row-cap.json`         |
| Export in progress                   | download request pending                                       | E       | `Button loading`            | `Preparing CSV…`                                                                                                 | a second concurrent request                    | —                                   |
| Export failed                        | non-200 on `/audit/export`                                     | E       | `Notice tone="danger"`      | `The export could not be prepared.` · `Try again, or narrow the range.`                                          | a partially written file                       | `error-403-organisation.json`       |
| Export succeeded                     | 200 + `X-Trace-ID`                                             | E       | `Notice tone="success"`     | `CSV downloaded. Export trace {trace_id}.`                                                                       | the CSV contents rendered in the page          | —                                   |
| Pending decision                     | projection `decision: null`, no error                          | A B     | `Badge neutral`             | `Pending` · `No decision recorded yet.`                                                                          | reading pending as allowed                     | `audit-list-analyst-mixed.json`     |
| Blocked trace                        | `decision: "BLOCK"`                                            | A B     | `Badge danger`              | `Blocked` + reason codes                                                                                         | the denied resource's title or text            | `audit-detail-blocked-read.json`    |
| Review held                          | `decision: "REVIEW"`                                           | A B     | `Badge warning`             | `Held for review` · `Output is withheld until an administrator decides.`                                         | candidate text                                 | `audit-list-analyst-mixed.json`     |
| Redacted result                      | `decision: "REDACT"`                                           | A B     | `Badge warning`             | `Partly withheld`                                                                                                | what was removed                               | `audit-list-analyst-mixed.json`     |
| Unexpected client error              | network failure, invalid shape                                 | all     | `ErrorState` + retry        | `Something went wrong while loading this view.` · `Try again.`                                                   | stack traces, raw response bodies              | —                                   |

### 1.1 Error codes not reachable from this feature

The contract defines 15 error codes. Five cannot be produced by `/audit`, `/audit/{id}`, `/metrics` or
`/audit/export`, and are therefore deliberately absent from the matrix rather than given invented states:

| Code                                                              | Why not reachable here                                                                                                                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONFLICT`                                                        | version/idempotency conflicts belong to mutations; audit reads are GET                                                                                            |
| `UNSUPPORTED_FILE`                                                | upload-only                                                                                                                                                       |
| `POLICY_UNAVAILABLE`, `SEMANTIC_UNAVAILABLE`, `MODEL_UNAVAILABLE` | these describe the **audited** operation; they reach the audit feature as `reasons[]`, `state` and `semantic.status` on a projection, not as the read's own error |

The three provider/policy codes are still covered on screen, through the `Semantic assessment unavailable`
and `Incomplete trace` rows above. A generic client-error state catches anything unforeseen.

## 2. Standing copy

| Key                    | English string                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `page.dashboard.title` | `Activity and usage`                                                                               |
| `page.dashboard.desc`  | `Your audited operations, security decisions and measured resource use.`                           |
| `page.org.title`       | `Organisation reporting`                                                                           |
| `page.trace.title`     | `Trace detail`                                                                                     |
| `scope.own`            | `Own activity`                                                                                     |
| `scope.org`            | `Organisation activity`                                                                            |
| `range.label`          | `UTC day`                                                                                          |
| `range.default`        | `Current UTC day`                                                                                  |
| `group.controls`       | `Security decisions`                                                                               |
| `group.resources`      | `Resource use`                                                                                     |
| `label.notMeasured`    | `Not measured`                                                                                     |
| `label.unknown`        | `Unknown`                                                                                          |
| `label.na`             | `N/A`                                                                                              |
| `label.estimated`      | `Estimated`                                                                                        |
| `label.reserved`       | `Reserved`                                                                                         |
| `label.actual`         | `Actual`                                                                                           |
| `disclaimer.money`     | `Illustrative commercial equivalent; not an invoice.`                                              |
| `disclaimer.rate`      | `Rate version {comparison_rate_version}.`                                                          |
| `disclaimer.blocked`   | `Blocked attempts are refused requests, not confirmed breaches.`                                   |
| `disclaimer.reduction` | `Estimated from the permitted corpus using one pinned estimator. Source trace {context_trace_id}.` |
| `disclaimer.overhead`  | `Gateway overhead breakdown is not exposed by this endpoint.`                                      |
| `button.export`        | `Download audit CSV`                                                                               |
| `button.loadOlder`     | `Load older records`                                                                               |
| `a11y.traceLink`       | `Open trace {trace_id}`                                                                            |
| `a11y.expandStages`    | `Show tool subcalls for {stage}`                                                                   |

## 3. Formatting rules

| Value        | Rule                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------- |
| Timestamps   | `YYYY-MM-DD HH:MM:SS UTC`, explicit zone suffix                                           |
| Token counts | English grouping (`1,024`), unit word `tokens`                                            |
| Durations    | `<1000` → `{n} ms`; otherwise `{n.n} s`                                                   |
| Percentages  | one decimal, `%` suffix; `N/A` when null                                                  |
| Money        | micro-USD → `USD {n.nnnnnn}` with the unit stated, plus `disclaimer.money`                |
| UUIDs        | first 8 and last 4 characters with an ellipsis; full value in `title` and in copy actions |
| Scores       | two decimals, `0.00`–`1.00`; null → `Not measured`                                        |
| Ratios       | `{completed} / {planned}`                                                                 |

English formatting is required by `DESIGN.md`. Note the shared `BarChart` hardcodes `pl-PL` grouping
(`src/shared/ui/BarChart.tsx:28`) — see [04](04-component-plan.md) and [06](06-integrator-requests.md).

Money changed from four decimals to six during P2, and the reason matters: one micro-USD is
`0.000001` USD, so an illustrative figure of a few micro-USD rounded to `USD 0.0000` — a real cost
displayed as nothing. `docs/product/technical-spec.md:82` forbids implying a zero total operating cost,
so the format is now exact for integer micro-USD. Implemented in `formatMicroUsd`
(`src/features/audit/format.ts`) and asserted in `metrics.test.ts`.

## 4. Fixture index

Files live in `fixtures/`. Shapes match the contract exactly — no marker fields are added, because the
filename and this table carry the "fixture" label. Accounts, organisation and deal UUIDs come from
`docs/demo/fixtures.json`; trace UUIDs use the `…-0000000003xx` range, following
`docs/contracts/examples/blocked.response.json`.

| File                                | Endpoint                    | Represents                                                                     | Scenario |
| ----------------------------------- | --------------------------- | ------------------------------------------------------------------------------ | -------- |
| `audit-list-analyst-mixed.json`     | `GET /audit`                | analyst own list: ALLOW, REVIEW, REDACT, BLOCK and a pending row               | S01–S05  |
| `audit-detail-allow-chat.json`      | `GET /audit/{id}`           | completed chat trace, full settled usage, complete coverage                    | S01      |
| `audit-detail-blocked-read.json`    | `GET /audit/{id}`           | direct restricted read refused, zero generation, nothing leaked                | S04      |
| `audit-detail-incomplete.json`      | `GET /audit/{id}`           | provider outage: unknown usage, unresolved reservation, assessment unavailable | S11      |
| `audit-detail-loop-stop.json`       | `GET /audit/{id}`           | repeated tool calls stopped, accounting retained                               | S08      |
| `audit-detail-event-cap.json`       | `GET /audit/{id}`           | more stages than one response returns, narrowing instruction                   | —        |
| `audit-list-admin-page-cap.json`    | `GET /audit`                | organisation list at the 100-row cap                                           | —        |
| `metrics-own-analyst-allow.json`    | `GET /metrics`              | own scope with measured usage and null `confirmed_test_failures`               | S01      |
| `metrics-own-employee-empty.json`   | `GET /metrics`              | own scope, empty day, every estimate null                                      | S02      |
| `metrics-org-admin-full.json`       | `GET /metrics`              | organisation scope with reduction, cost and unresolved reservations            | S09, S10 |
| `metrics-org-zero-denominator.json` | `GET /metrics`              | organisation scope, reduction `N/A`                                            | —        |
| `error-401-unauthenticated.json`    | any                         | 401 envelope                                                                   | —        |
| `error-403-organisation.json`       | `/metrics`, `/audit/export` | non-admin asking for organisation scope                                        | S12      |
| `error-404-trace.json`              | `GET /audit/{id}`           | unknown or foreign trace id                                                    | S12      |
| `error-400-invalid-range.json`      | `/metrics`                  | range wider than one UTC day                                                   | —        |
| `error-429-rate-limited.json`       | any                         | refusal under limit                                                            | S09      |
| `error-503-audit-unavailable.json`  | any                         | audit store down, `decision: null`                                             | S11      |
| `error-503-state-unavailable.json`  | any                         | durable state down                                                             | S11      |
| `error-export-row-cap.json`         | `/audit/export`             | export above 1000 rows with a narrowing instruction                            | —        |
