# 01 — Field map: every visual to its authoritative contract field

Authority: `docs/contracts/openapi.json` owns HTTP field names. `docs/contracts/protocols.md` owns
semantics. `docs/product/technical-spec.md:77-85` owns the reporting formulas.
`docs/testing/acceptance.md:63` owns the rule that displayed numbers must equal stored usage.

Label classes used in the `Class` column are defined in [02-honesty-rules.md](02-honesty-rules.md):
**M** measured · **E** estimated · **R** reserved/unresolved · **U** unknown (null on a settled record) ·
**NM** not measured (no record) · **NP** not permitted.

## 0. Envelope versus payload — read this before any table

Every response is the `Response` envelope. For `GET /audit`, `GET /audit/{id}` and `GET /metrics` the
envelope's own `decision`, `reasons`, `usage` and `timings` describe **the audit read itself**, not the
trace being inspected. The inspected trace lives in `data.items[0]`.

| Rule                                                                                   | Why                                                       |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Trace fields are read from `data.items[i].*`, never from the envelope root             | the root belongs to the read operation                    |
| Envelope `decision` / `error` are checked on every call before rendering anything      | `docs/contracts/protocols.md:11-19` — 200 is not approval |
| Envelope `usage` / `timings` are never displayed as the audited run's usage or timings | they would be the cost of opening the page                |
| `GET` retrieval creates its own audited access decision                                | `docs/contracts/protocols.md:9`                           |

**Open gap (→ 06, item 3).** `AuditProjection` has **no `timings` object**. The only durations reachable
through audit contracts are `usage.generation_ms` and `usage.semantic_ms` (per trace and per event), plus
`Metrics.usage`. The envelope breakdown `deterministic_ms / provider_ms / persistence_ms` exists only on
the _original_ operation's response, which the audit feature never receives. AT15 asks for
"provider vs overhead timings" (`docs/testing/acceptance.md:23`) and `DESIGN.md` asks the trace screen to
show "measured usage/timings". Both are only partly satisfiable today. Until the integrator answers,
the trace screen shows generation and semantic durations and states plainly that the gateway-overhead
breakdown is not exposed by this endpoint — it does not estimate it.

## 1. View A — Trace list (`GET /audit?after=<uuid>`)

Payload `data.items: AuditProjection[]`, maximum 100, order `(created_at,id)` descending
(`docs/contracts/data-model.md:56`). Row layout per [04](04-component-plan.md).

| Field ID     | Screen label      | Contract path            | Type / null              | Derivation | Class | Rendering rules                                                                                                                     |
| ------------ | ----------------- | ------------------------ | ------------------------ | ---------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `A.trace`    | Trace             | `items[].trace_id`       | uuid                     | direct     | M     | monospace, truncated head+tail, full value in `title`; links to detail                                                              |
| `A.op`       | Operation         | `items[].operation`      | string 1..60             | direct     | M     | shown verbatim as the operation code, not prettified into a sentence                                                                |
| `A.when`     | Time (UTC)        | `items[].created_at`     | date-time                | direct     | M     | UTC with an explicit `UTC` suffix (`DESIGN.md` — labelled or zoned)                                                                 |
| `A.decision` | Decision          | `items[].decision`       | enum \| null             | direct     | M / U | `Badge`: ALLOW success · REDACT warning · REVIEW warning · BLOCK danger · null neutral `Pending`                                    |
| `A.state`    | State             | `items[].state`          | string 1..40             | direct     | M     | second `Badge` or caption; `incomplete` must be visible, never collapsed into decision                                              |
| `A.reasons`  | Reasons           | `items[].reasons[]`      | string[] ≤20, each 1..80 | direct     | M     | reason **codes** only; first two inline, remainder behind `+N` in the detail view                                                   |
| `A.policy`   | Policy version    | `items[].policy_version` | integer ≥1               | direct     | M     | `v{n}`; present on every row                                                                                                        |
| `A.feed`     | Feed version      | `items[].feed_version`   | integer ≥1               | direct     | M     | `v{n}`                                                                                                                              |
| `A.actor`    | Actor             | `items[].actor_id`       | uuid                     | direct     | M     | own scope: hidden (always self). Organisation scope: shown as id, never resolved to a name — no name source exists in this contract |
| `A.usage`    | Tokens / duration | `items[].usage`          | object                   | see §4     | M/U/R | compact summary only: settled generation tokens, or `Not measured`; `unresolved_reservation` as its own chip                        |
| `A.more`     | Load more         | `items.length === 100`   | derived                  | derived    | —     | DECISION, pending `06` item 4: no `has_more` field exists; `after` = last row's `trace_id`                                          |

Not displayed in this view: `items[].events` (absent from list rows per
`docs/contracts/protocols.md:120`).

## 2. View B — Trace detail (`GET /audit/{id}`)

Payload `data.items[0]`, one item, with `events[]` capped at 200.

### 2.1 Header — same fields as View A

`trace_id`, `operation`, `created_at`, `decision`, `state`, `reasons[]`, `policy_version`,
`feed_version`, `actor_id`. Reasons appear in full here.

### 2.2 Stage list — `items[0].events[]`

| Field ID     | Screen label | Contract path                              | Type / null | Class | Rendering rules                                                                                                                                         |
| ------------ | ------------ | ------------------------------------------ | ----------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `B.stage`    | Stage        | `events[].stage`                           | string      | M     | ordered by `created_at`; stage code verbatim                                                                                                            |
| `B.event`    | Event        | `events[].event_type`                      | string      | M     | expected values from `docs/contracts/data-model.md:28`: `intent`, `decision`, `provider_started`, `completion`, `incomplete`, `review`, `configuration` |
| `B.when`     | Time (UTC)   | `events[].created_at`                      | date-time   | M     | UTC, plus elapsed-since-previous as a caption                                                                                                           |
| `B.versions` | Versions     | `events[].policy_version` / `feed_version` | integer ≥1  | M     | shown per event; a change between events is the policy/feed-change evidence for the demo                                                                |
| `B.findings` | Findings     | `events[].findings[]`                      | ≤20 objects | M     | see §2.3                                                                                                                                                |
| `B.semantic` | Assessment   | `events[].semantic`                        | object      | M/U   | see §2.4                                                                                                                                                |
| `B.usage`    | Stage usage  | `events[].usage`                           | object      | M/U/R | see §4; per-stage, never summed across overlapping stages                                                                                               |

Root versus subcall: `docs/contracts/data-model.md:33` — suboperations carry the parent trace/operation
in the audit payload, and `docs/contracts/data-model.md:58` requires distinct root traces to be counted
separately from subcall decisions. In this view, tool subevents are rendered as an expandable group and
the header count is labelled `root request`, never a sum of events.

### 2.3 Findings — `Finding`

| Field    | Contract path         | Type / null         | Class | Rendering rules                                                         |
| -------- | --------------------- | ------------------- | ----- | ----------------------------------------------------------------------- |
| code     | `findings[].code`     | string 1..60        | M     | shown verbatim                                                          |
| category | `findings[].category` | string 1..60        | M     | shown verbatim                                                          |
| severity | `findings[].severity` | info\|review\|block | M     | `Badge`: info neutral · review warning · block danger                   |
| stage    | `findings[].stage`    | string 1..40        | M     | groups findings under their stage                                       |
| locator  | `findings[].locator`  | string ≤80 \| null  | M / U | position reference only. Null renders `No locator`, never an empty cell |

A `Finding` carries no value field by design — "findings without values"
(`docs/product/technical-spec.md:100`). The UI must never add one,
and must never interpolate a locator into a quoted snippet.

### 2.4 Semantic assessment — `Assessment`

| Field                               | Contract path                                    | Type / null                                     | Class | Rendering rules                                                                                              |
| ----------------------------------- | ------------------------------------------------ | ----------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------ |
| status                              | `semantic.status`                                | complete\|not_required\|unavailable\|incomplete | M     | `Badge`; `not_required` is **not** a pass, `unavailable` is **not** a pass                                   |
| scores.instruction_manipulation     | `semantic.scores.instruction_manipulation`       | number 0..1 \| null                             | M / U | 2 decimals; null → `Not measured`. Caption: a score grants no permission (`docs/product/architecture.md:35`) |
| scores.sensitive_exposure           | `semantic.scores.sensitive_exposure`             | number 0..1 \| null                             | M / U | as above                                                                                                     |
| scores.resource_abuse               | `semantic.scores.resource_abuse`                 | number 0..1 \| null                             | M / U | as above                                                                                                     |
| checkpoint_revision                 | `semantic.checkpoint_revision`                   | string ≤100 \| null                             | M / U | the live-model evidence for the demo; null → `Revision not reported`                                         |
| windows_planned / windows_completed | `semantic.windows_planned` / `windows_completed` | integer ≥0                                      | M     | rendered as `completed / planned`                                                                            |
| coverage_complete                   | `semantic.coverage_complete`                     | boolean                                         | M     | `false` is a prominent warning, not a quiet flag — incomplete coverage withholds                             |
| text_sha256                         | `semantic.text_sha256`                           | string ≤64 \| null                              | M / U | truncated hash, integrity evidence only; null → `No hash recorded`                                           |
| coverage_ranges                     | `semantic.coverage_ranges[]`                     | ≤64 × {start_char,end_char,input_tokens ≤1024}  | M     | summarised as range count and total assessed tokens; offsets may be listed, text never exists here to leak   |

## 3. Views C and D — Personal and organisation dashboard (`GET /metrics`)

Query: `scope=own|organisation` (default `own`, organisation requires admin), `from`/`to` within **one
UTC day**, omitted means the current UTC day (`docs/contracts/protocols.md:120`).

Two groups must be **equally visible** (`docs/demo/scenarios.md`, "Dashboard proof").

### 3.1 Group 1 — Controls

| Field ID  | Screen label            | Contract path             | Type / null        | Class | Rendering rules                                                               |
| --------- | ----------------------- | ------------------------- | ------------------ | ----- | ----------------------------------------------------------------------------- |
| `C.root`  | Root requests           | `root_requests`           | integer ≥0         | M     | labelled `root`; excludes tool subcalls                                       |
| `C.block` | Blocked attempts        | `blocked_attempts`        | integer ≥0         | M     | caption: a blocked attempt is not a confirmed breach                          |
| `C.loop`  | Stopped loops           | `stopped_loops`           | integer ≥0         | M     | separate counter, never folded into blocked attempts                          |
| `C.rev`   | Review cases            | `review_cases`            | integer ≥0         | M     | separate counter                                                              |
| `C.test`  | Confirmed test failures | `confirmed_test_failures` | integer ≥0 \| null | M / U | null → `Unknown`, with caption `No dated test report yet`. Never `0 breaches` |

### 3.2 Group 2 — Resources

| Field ID  | Screen label                       | Contract path                       | Type / null        | Class | Rendering rules                                                                 |
| --------- | ---------------------------------- | ----------------------------------- | ------------------ | ----- | ------------------------------------------------------------------------------- |
| `D.gin`   | Generation input tokens            | `usage.generation_input_tokens`     | integer ≥0 \| null | M / U | null → `Not measured`                                                           |
| `D.gout`  | Generation output tokens           | `usage.generation_output_tokens`    | integer ≥0 \| null | M / U | null → `Not measured`                                                           |
| `D.gms`   | Generation duration                | `usage.generation_ms`               | integer ≥0 \| null | M / U | ms under 1000, else seconds with one decimal                                    |
| `D.sin`   | Laya input tokens                  | `usage.semantic_input_tokens`       | integer ≥0 \| null | M / U | separate card from generation — never added to `D.gin`                          |
| `D.sms`   | Laya duration                      | `usage.semantic_ms`                 | integer ≥0         | M     | never null; a real `0` is legitimate and means no semantic call                 |
| `D.res`   | Reserved generation tokens         | `usage.reserved_generation_tokens`  | integer ≥0         | R     | shown beside actual, never added to it                                          |
| `D.unres` | Unresolved reservations            | `usage.unresolved_reservation`      | boolean            | R     | `true` → warning chip `Unresolved reservation retained`                         |
| `D.cost`  | Illustrative commercial equivalent | `usage.comparison_micro_usd`        | integer ≥0 \| null | E     | micro-USD → USD with explicit unit; mandatory disclaimer; null → `Not measured` |
| `D.rate`  | Rate version                       | `usage.comparison_rate_version`     | string 1..60       | M     | printed next to every money figure                                              |
| `D.full`  | Permitted corpus tokens            | `permitted_source_tokens_estimate`  | number ≥0 \| null  | E     | the reduction denominator; null → `N/A`                                         |
| `D.sel`   | Selected context tokens            | `selected_source_tokens_estimate`   | number ≥0 \| null  | E     | the numerator side                                                              |
| `D.red`   | Context reduction                  | `context_reduction_percent`         | number ≥0 \| null  | E     | null → `N/A`, never `0%`; one decimal; labelled estimated                       |
| `D.saved` | Estimated avoided input spend      | `estimated_avoided_input_micro_usd` | number ≥0 \| null  | E     | disclaimer required; no output savings, no blocked-call savings                 |
| `D.ctx`   | Reduction source trace             | `context_trace_id`                  | uuid \| null       | M / U | links to View B; null → the three estimates above must all read `N/A`           |
| `D.scope` | Scope                              | `scope`                             | own\|organisation  | M     | echoed from the response, not from local state                                  |
| `D.range` | Range (UTC)                        | `from` / `to`                       | date-time          | M     | echoed from the response; shows the one-day window actually used                |

Formulas, all from `docs/product/technical-spec.md:81-85`, restated so the UI never invents one:

- actual generation tokens = settled provider-reported counts; unknown and reserved shown separately.
- commercial equivalent = input tokens × versioned input rate + output tokens × versioned output rate.
  Server-computed; the UI only formats and labels it.
- context reduction = `max(0, full − selected) / full`; denominator zero → `N/A`; same pinned tokenizer
  and same role/audience on both sides; excludes duplicates and prompt overhead.
- estimated avoided input spend = positive reduction × comparison input rate. No speculative output
  savings, no blocked-call costs.

The UI performs **no arithmetic on money and no re-derivation of reduction**. It formats server numbers.
The only client-side arithmetic allowed is formatting and `completed / planned` style ratios.

## 4. `Usage` as rendered in a trace or stage (§1 `A.usage`, §2.2 `B.usage`)

Three columns, never merged, in this order: **Actual** · **Reserved** · **Unknown**.

| Column   | Fields                                                                                                                       | Note                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Actual   | `generation_input_tokens`, `generation_output_tokens`, `generation_ms` when non-null; `semantic_input_tokens`, `semantic_ms` | generation and Laya in separate rows                                                                               |
| Reserved | `reserved_generation_tokens`, `unresolved_reservation`                                                                       | one operation's reservation, or a window's outstanding total — the caption says which; a timeout is not zero usage |
| Unknown  | every null-valued field above                                                                                                | `Not measured`, with the reason when `state` explains it                                                           |

`docs/product/technical-spec.md:75` — unknown usage stays null with unresolved reserved units, and
cancellation or timeout does not prove the server stopped computing.

## 5. Contract fields deliberately not displayed

| Path                                                   | Why not                                                                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| envelope `trace_id`                                    | identifies the audit read, not the audited run; kept only for a support/diagnostic line                                                                                              |
| envelope `semantic`, `usage`, `timings`                | belong to the read operation; displaying them would misattribute cost                                                                                                                |
| envelope `policy_version`, `feed_version`              | versions in force for the read; the audited run's versions come from the projection                                                                                                  |
| envelope `data` other union members                    | `Run`, `Excerpt`, `Review`, `{answer,citations}`, `{download_path,…}` belong to other operations; validating the audit-specific shape is required (`docs/contracts/protocols.md:21`) |
| `error.retryable`                                      | drives whether a retry control is offered, not shown as text                                                                                                                         |
| `Assessment.coverage_ranges[].start_char` / `end_char` | summarised as a count; raw offsets add no operator value on the dashboard                                                                                                            |

## 6. Fields the views need and the contract does not provide

Each becomes a numbered item in [06-integrator-requests.md](06-integrator-requests.md).

| Need                                                             | Closest existing field                    | Consequence if unanswered                                             |
| ---------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| Gateway overhead breakdown per trace                             | none (`AuditProjection` has no `timings`) | trace screen states the breakdown is not exposed; AT15 partly unmet   |
| Human-readable actor label in organisation scope                 | `actor_id` only                           | organisation rows show UUIDs                                          |
| `has_more` / next-cursor signal on `/audit`                      | none; `after` is a request parameter      | pagination inferred from `items.length === 100`                       |
| Operation display names                                          | `operation` code only                     | codes shown verbatim, which is acceptable and honest                  |
| Human label for `comparison_rate_version`                        | opaque string                             | printed verbatim beside money                                         |
| Source of the dated test report behind `confirmed_test_failures` | null until it exists                      | renders `Unknown` indefinitely, which is correct but needs confirming |
