# 05 — Test plan: AT10, AT15, AT16, and the arithmetic oracle

Source rows: `docs/testing/acceptance.md:18` (AT10), `:23` (AT15), `:24` (AT16), plus `:63`
("Dashboard numbers must equal the stored usage for the selected traces; estimated reduction must use the
same actor-permitted corpus on both sides").

## 1. Blocked prerequisites — stated, not hidden

Rechecked after the G1 merge (`f04054b`).

| Needed                            | Status                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Unit runner                       | **available** as `npm run test` (vitest 4.1.11, `vitest.config.mts`), not as the `test:unit` of `:33`               |
| Component/DOM assertions          | **blocked**: `include: ["src/**/*.test.ts"]` skips `.test.tsx`, `environment: "node"`, no jsdom or @testing-library |
| `npm run test:e2e`                | does not exist; introduced by T01/T11 (`:36`)                                                                       |
| Test-file location under `src/**` | convention set by G1: `*.test.ts` beside the module (`src/shared/contracts/validate.test.ts`)                       |
| Real audit data                   | needs T02 schema and T03 gateway; `/api/v1/**` answers 503 `STATE_UNAVAILABLE` for every path today                 |

Consequence for the design, not only for the tests: every number must be produced by a pure function in a
`.ts` module that the components merely call, because that is the only layer vitest can reach today.
Formatting, `null` handling and each formula in [01](01-field-map.md) therefore live outside the `.tsx`
files. Assertions marked `unit snapshot`, `e2e` or `DOM` below have no runner yet and are reported as
**not run**, never as passed.

## 2. AT10 — audit

| ID     | Assertion                                                                                                  | Layer                        | Fixture / data                                      |
| ------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------- |
| AT10-1 | Personal scope shows only the signed-in actor's traces; another actor's `trace_id` is not reachable        | e2e + real data              | two prepared accounts                               |
| AT10-2 | `scope=organisation` as a non-admin renders the denied state and no organisation figure                    | unit + e2e                   | `error-403-organisation.json`                       |
| AT10-3 | Admin organisation view renders aggregates from `/metrics`; no client-side summation of `/audit` rows      | unit                         | `metrics-org-admin-full.json`                       |
| AT10-4 | No rendered state contains prompt text, excerpt text, document titles, secrets or contact canaries         | unit snapshot + e2e DOM scan | all fixtures                                        |
| AT10-5 | A `BLOCK` trace shows reason codes only; the denied resource identifier is absent from the DOM             | unit                         | `audit-detail-blocked-read.json`                    |
| AT10-6 | Downloaded CSV bytes contain no cell beginning `=`, `+`, `-`, `@`, tab or CR (server's job, asserted here) | e2e against the real route   | real export                                         |
| AT10-7 | Finalisation failure renders incomplete with retained reserved usage and no result                         | unit                         | `audit-detail-incomplete.json`                      |
| AT10-8 | Every cap renders its narrowing instruction                                                                | unit                         | `*-page-cap`, `*-event-cap`, `error-export-row-cap` |
| AT10-9 | 503 `AUDIT_UNAVAILABLE` renders "records may be unavailable", never zeroed counters                        | unit                         | `error-503-audit-unavailable.json`                  |

AT10's "intent before external call" is a gateway property owned by the integrator; the audit feature's
part is to **display** the intent/completion stages faithfully, asserted by AT10-7 and by the stage order
in `audit-detail-allow-chat.json`.

## 3. AT15 — reporting and performance honesty

| ID      | Assertion                                                                                             | Layer | Fixture                             |
| ------- | ----------------------------------------------------------------------------------------------------- | ----- | ----------------------------------- |
| AT15-1  | Nullable usage fields render `Not measured`; no `0` substitution                                      | unit  | `audit-detail-incomplete.json`      |
| AT15-2  | `semantic_ms: 0` renders `0 ms` (a real measurement, not unknown)                                     | unit  | `audit-detail-blocked-read.json`    |
| AT15-3  | Reserved and unresolved values appear in their own column and are never added to actual               | unit  | `audit-detail-incomplete.json`      |
| AT15-4  | Generation and Laya usage are in separate regions; no combined token total exists in the DOM          | unit  | `metrics-own-analyst-allow.json`    |
| AT15-5  | `context_reduction_percent: null` renders `N/A` and the two estimates render `N/A`                    | unit  | `metrics-org-zero-denominator.json` |
| AT15-6  | Every money figure carries the illustrative disclaimer and `comparison_rate_version`                  | unit  | `metrics-own-analyst-allow.json`    |
| AT15-7  | `confirmed_test_failures: null` renders `Unknown`, and no breach wording appears anywhere             | unit  | `metrics-own-analyst-allow.json`    |
| AT15-8  | Displayed totals equal §5 expected values for the fixture set                                         | unit  | §5 worksheet                        |
| AT15-9  | The reduction label names its source trace and the permitted-corpus basis                             | unit  | `metrics-own-analyst-allow.json`    |
| AT15-10 | The trace screen states that the gateway-overhead breakdown is not exposed, rather than estimating it | unit  | `audit-detail-allow-chat.json`      |

Timing evidence (`n`, cold/warm, device, provider versus overhead) is produced by T11
`benchmark:gateway`, which the integrator owns. The audit feature must not display any timing it did not
receive from a contract field.

## 4. AT16 — browser and release

| ID     | Assertion                                                                              | Evidence                       |
| ------ | -------------------------------------------------------------------------------------- | ------------------------------ |
| AT16-1 | Each prepared account signs in and sees its own dashboard; admin sees the scope switch | screenshots per role           |
| AT16-2 | All copy is English, including loading and error states                                | DOM scan for Polish characters |
| AT16-3 | Keyboard-only path: scope → day → list → trace → back → export, visible focus          | recorded steps                 |
| AT16-4 | ~375 px and ~1440 px with no horizontal page overflow; wide rows scroll locally        | screenshots at both sizes      |
| AT16-5 | Status is never conveyed by colour alone                                               | every `Badge` has text         |
| AT16-6 | Double-clicking export issues one request                                              | network log                    |

Browser evidence follows `hackyeah-browser-qa`: walk the real path (HTTP 200 is not success), check
~375 px and ~1440 px plus an intermediate size when the layout needs it, verify empty/loading/error
states, keyboard and focus, accessible names, console and network errors, screenshots without secrets.
The report is English and names the URL, the commit (or that it is unknown), the viewports, the steps,
the outcomes, and explicitly the checks **not** performed. No WCAG claim from tooling alone, no Core Web
Vitals without measurement.

### 4.1 Remaining state coverage

Closes the rule that every row of [03 §1](03-state-matrix.md) maps to at least one assertion.

| ID      | Assertion                                                                                                                     | Layer | Fixture                           |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------- |
| AT16-7  | Loading and empty states render with English copy, never the shared Polish defaults                                           | unit  | `metrics-own-employee-empty.json` |
| AT10-10 | 401 renders the session-ended state and clears any previously shown numbers                                                   | unit  | `error-401-unauthenticated.json`  |
| AT10-11 | A range wider than one UTC day shows the field error and sends no silently clamped request                                    | unit  | `error-400-invalid-range.json`    |
| AT10-12 | A successful export shows its export trace id; the CSV body is never rendered in the page                                     | e2e   | real export                       |
| AT10-13 | 429 renders the refusal without an automatic retry loop                                                                       | unit  | `error-429-rate-limited.json`     |
| AT15-11 | Decision mapping: ALLOW, REDACT, REVIEW, BLOCK and `null` each render their own badge and text; `null` never reads as allowed | unit  | `audit-list-analyst-mixed.json`   |
| AT15-12 | Cancelled trace states that cancellation does not prove zero consumption                                                      | unit  | `audit-detail-incomplete.json`    |

## 5. Arithmetic oracle

Expected screen values computed by hand from the fixture set, so a dashboard bug cannot hide behind its
own arithmetic (`docs/testing/acceptance.md:63`). Rates for `illustrative-v1`, declared here only as the
worksheet's assumption: input `3 micro-USD / 1k tokens`, output `15 micro-USD / 1k tokens`. The server
computes money; this worksheet only checks that the displayed figure matches the fixture.

### 5.1 Per-trace inputs (analyst, one UTC day)

| Trace | Scenario         | gen in | gen out | gen ms | sem in | sem ms | reserved | unresolved | micro-USD |
| ----- | ---------------- | ------ | ------- | ------ | ------ | ------ | -------- | ---------- | --------- |
| T1    | S01 allowed chat | 1842   | 311     | 4120   | 2048   | 486    | 4096     | false      | 10        |
| T2    | S04 blocked read | 0      | 0       | 0      | 0      | 0      | 0        | false      | 0         |
| T3    | S08 loop stop    | 1500   | 240     | 3000   | 1024   | 300    | 4096     | false      | 8         |
| T4    | S11 outage       | null   | null    | null   | null   | 512    | 4096     | true       | null      |

Interpretation rule, marked **DECISION** and sent as `06` item 8: `0` means the call provably never
happened (a refusal before any provider call), `null` means a call may have happened and the result is
unknown. The UI renders `0` as a measurement and `null` as `Not measured`.

### 5.2 Expected `metrics-own-analyst-allow.json` totals

| Aggregate                           | Computation            | Expected | Pass 2 | Class |
| ----------------------------------- | ---------------------- | -------- | ------ | ----- |
| `root_requests`                     | T1..T4                 | 4        | 4      | M     |
| `blocked_attempts`                  | T2                     | 1        | 1      | M     |
| `stopped_loops`                     | T3                     | 1        | 1      | M     |
| `review_cases`                      | none                   | 0        | 0      | M     |
| `confirmed_test_failures`           | no dated report        | null     | null   | U     |
| `usage.generation_input_tokens`     | 1842 + 0 + 1500        | 3342     | 3342   | M     |
| `usage.generation_output_tokens`    | 311 + 0 + 240          | 551      | 551    | M     |
| `usage.generation_ms`               | 4120 + 0 + 3000        | 7120     | 7120   | M     |
| `usage.semantic_input_tokens`       | 2048 + 0 + 1024        | 3072     | 3072   | M     |
| `usage.semantic_ms`                 | 486 + 0 + 300 + 512    | 1298     | 1298   | M     |
| `usage.reserved_generation_tokens`  | unresolved only (T4)   | 4096     | 4096   | R     |
| `usage.unresolved_reservation`      | any true               | true     | true   | R     |
| `usage.comparison_micro_usd`        | 10 + 0 + 8             | 18       | 18     | E     |
| `permitted_source_tokens_estimate`  | fixture input          | 48000    | 48000  | E     |
| `selected_source_tokens_estimate`   | fixture input          | 6240     | 6240   | E     |
| `context_reduction_percent`         | (48000 − 6240) / 48000 | 87.0     | 87.0   | E     |
| `estimated_avoided_input_micro_usd` | 41760 / 1000 × 3       | 125.28   | 125.28 | E     |
| `context_trace_id`                  | T1                     | T1 id    | T1 id  | M     |

Both passes agree. T4's unknown generation tokens are **excluded** from the settled sums and are
represented by the retained reservation plus `unresolved_reservation: true` — the screen must show both
facts, never silently absorb T4 into the totals.

Whether `Metrics.usage.reserved_generation_tokens` means "all reservations made" or "unresolved
reservations only" is not stated by the contract. The worksheet assumes unresolved-only; `06` item 7 asks
Bartosz to confirm. If the answer differs, only this row and the fixture change — no view changes.

### 5.3 Edge cases that must each have their own expected value

| Case                                  | Expected display                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| `permitted_source_tokens_estimate: 0` | reduction `N/A`, avoided spend `N/A`                                                |
| `context_trace_id: null`              | all three reduction figures `N/A`, no source link                                   |
| every usage field null, empty day     | `Not measured` everywhere, counters `0` only where the counter itself is a real `0` |
| `confirmed_test_failures: 0`          | `0`, with no breach wording                                                         |
| organisation list at 100 rows         | `Showing the 100 most recent records.` plus paging                                  |

### 5.4 Organisation totals

Not recomputed here on purpose. `docs/contracts/protocols.md:120` requires organisation metrics to come
from `/metrics`, which sums persisted settled usage and unresolved reservations across the scope. The
test asserts the opposite of arithmetic: that the organisation view issues a `/metrics` call with
`scope=organisation` and renders its fields unchanged, and that no summation over `/audit` rows exists in
the feature's code path.

## 6. Reporting rules for this feature's PRs

- List commands actually run with their exit codes; name every gate not run.
- Screenshots come from real runs; replayed evidence is labelled replayed.
- A fixture-driven unit test never counts as evidence that a live path works.

## 7. Coverage after P1–P3 — what actually runs today

State of the branch `codex/audit-focus-and-export` on top of `main` at PR #18. The feature holds 91
assertions in seven files; the repository runs 252. Legend: **unit** = asserted by `npm run test`;
**construction** = the model cannot express the failure, so there is nothing left to assert at this
layer; **not run** = no runner or no data exists for it, and it is reported as not run.

### 7.1 AT10 — audit

| ID      | Where it is asserted                                                            | Status                                                 |
| ------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| AT10-1  | —                                                                               | not run; needs T03 routes and two real sessions        |
| AT10-2  | `scope.test.ts` — refusal state, and figures beside a refusal ignored           | unit; the real-403 half needs T03                      |
| AT10-3  | `safety.test.ts` §"the list is never an aggregate"                              | unit                                                   |
| AT10-4  | `safety.test.ts` — four leak assertions against the view models                 | unit at model level; DOM scan not run                  |
| AT10-5  | `safety.test.ts` — reason codes survive, `Finding` has no `value` key           | unit at model level                                    |
| AT10-6  | `export.test.ts` covers the refusal and row-cap handling                        | the byte assertion is not run; needs the route         |
| AT10-7  | `envelope.test.ts` incomplete + unknown usage; `trace.test.ts` unknown group    | unit                                                   |
| AT10-8  | `envelope.test.ts` event cap; `activity.test.ts` page cap and cursor            | unit; the paging control exists, its click needs a DOM |
| AT10-9  | `envelope.test.ts` and `metrics.test.ts` unavailable states                     | unit                                                   |
| AT10-10 | `activity.test.ts` unauthenticated mapping                                      | unit; "clears earlier numbers" by construction         |
| AT10-11 | `metrics.test.ts` invalid-input mapping; `range.test.ts` day parsing and bounds | unit; the screen cannot construct a wider range        |
| AT10-12 | `export.test.ts` — the export trace id is reported                              | unit; "body never rendered" by construction            |
| AT10-13 | `activity.test.ts` rate-limited mapping                                         | unit; the absent retry control needs a DOM             |

### 7.2 AT15 — reporting honesty

| ID      | Where it is asserted                                                                                                       | Status                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| AT15-1  | `trace.test.ts` unknown group; `format.test.ts` null handling                                                              | unit                                                                 |
| AT15-2  | `format.test.ts` `formatDuration(0)`; `trace.test.ts` proven zero                                                          | unit                                                                 |
| AT15-3  | `trace.test.ts` — reserved never appears in actual                                                                         | unit                                                                 |
| AT15-4  | `trace.test.ts` and `metrics.test.ts` — separate generation and Laya rows                                                  | unit; "no combined total in the DOM" needs a DOM                     |
| AT15-5  | `metrics.test.ts` — null reduction, and estimates without a baseline                                                       | unit                                                                 |
| AT15-6  | `metrics.test.ts` — disclaimer, rate version, and no cost rounded to zero                                                  | unit                                                                 |
| AT15-7  | `metrics.test.ts` — Unknown, and the blocked-attempts caption                                                              | unit                                                                 |
| AT15-8  | `live-trace.test.ts` checks every displayed value against a real stored record; `metrics.test.ts` recomputes the reduction | **asserted for one real trace**; organisation totals need `/metrics` |
| AT15-9  | `metrics.test.ts` — estimate rows and the source trace                                                                     | unit at model level                                                  |
| AT15-10 | copy is rendered in two card headers                                                                                       | not asserted; needs a DOM                                            |
| AT15-11 | `trace.test.ts` `decisionBadge` for all five values                                                                        | unit                                                                 |
| AT15-12 | `envelope.test.ts` recognises cancellation                                                                                 | partial; the sentence itself needs a DOM                             |

### 7.3 AT16 — browser and release

| ID     | Status                                                                                                                                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AT16-1 | not run; needs a session per role. Login exists since T02 phase 3, so this is now a browser task                                                                                                                 |
| AT16-2 | by construction on both sides — every label here is passed explicitly, and the shared Polish defaults were removed by PR #38, so the loading boundary on `/audit` is English too. The DOM scan itself is not run |
| AT16-3 | code half done — every interactive element now carries a focus ring; the walk itself is not run                                                                                                                  |
| AT16-4 | not run                                                                                                                                                                                                          |
| AT16-5 | by construction — every `Badge` in this feature carries text, never colour alone                                                                                                                                 |
| AT16-6 | by construction — an in-flight guard plus a disabled button; the network log itself is not run                                                                                                                   |
| AT16-7 | by construction; the app-level Polish default this row tracked is resolved                                                                                                                                       |

### 7.4 What this table says plainly

Every assertion that can be made without a browser or without live data is made. What remains is one
runner and one set of routes, not a backlog of unwritten tests: **AT10-1, AT10-6, AT10-12, AT16-1,
AT16-4 and AT16-6 cannot be satisfied by anything this feature can add.** P5 narrowed AT10-6 and AT10-12 to
their observable halves: the handling is asserted, the bytes and the network log are not. AT10-4 and AT10-5 — the two
security assertions a judge is most likely to care about — are covered at the layer below the DOM and
will stay "model level" until a DOM runner exists.
