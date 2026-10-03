# 09 — P2 delivered: personal dashboard and activity list

Phase P2 of [07-build-order.md](07-build-order.md). Branch `codex/audit-personal-dashboard`, stacked on
`codex/audit-trace-view` because P2 imports P1's `copy.ts`, `format.ts` and `envelope.ts`. The PRs must
merge in that order.

## What exists now

| File                             | Role                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `metrics.ts`                     | `GET /metrics` payload narrowing, screen state, and the dashboard view model |
| `activity.ts`                    | `GET /audit` list: rows, page cap, next cursor, settled token sums           |
| `components/Dashboard.tsx`       | client component; reads both endpoints and classifies each independently     |
| `components/MetricsPanels.tsx`   | the two equally weighted groups plus the scope and window line               |
| `components/ActivityList.tsx`    | rows linking to `/audit?trace=<id>`                                          |
| `components/DashboardStates.tsx` | the shared refusal states in the words a dashboard needs                     |
| `envelope.ts`                    | refactored: `classifyFailure` is now shared by all three reads               |

`metrics.test.ts` and `activity.test.ts` add 30 assertions; the feature now holds **73**, the repository
**87**.

## Decisions taken, and why

**The screen does no arithmetic on money and never re-derives the reduction.** Both are computed and
versioned by the gateway (`docs/product/technical-spec.md:81-85`); the view formats and labels them. The
only client-side arithmetic is a row's settled token sum, which is the contract's own definition of
actual generation tokens — and it refuses to sum when either side is `null`, because adding a number to
an unknown would present a partial figure as a total.

**Money is now six decimals, not four.** One micro-USD is `0.000001` USD, so the previous rule rendered
a real illustrative cost of 18 micro-USD as `USD 0.0000`. Showing a real cost as zero implies a zero
total operating cost, which `:82` forbids. [03 §3](03-state-matrix.md) is corrected accordingly.

**An estimate without a traceable baseline is withheld.** When `context_trace_id` is `null`, all four
estimate rows read `N/A` — stricter than the contract requires. An estimate whose baseline cannot be
inspected is not evidence, and the demo will be asked exactly that question.

**An empty day is reported as empty, not as five measured zeros.** Zeros appear only when something
happened and a counter genuinely is zero.

**The two reads are classified independently**, so a failing metrics call cannot hide the activity list.
When both fail the same way the screen says it once, not twice.

**No scope control yet.** The organisation scope is P3. Offering a control whose refusal path is
unfinished would be worse than not offering it.

**No range picker yet.** No `from`/`to` is sent, so the gateway's default window applies and the screen
displays the window the response reports, never one it assumed.

## Evidence

| Check                                   | Result                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run`                        | **87 passed** (7 files); 73 in this feature                                                                                                       |
| `npx tsc --noEmit` after `next typegen` | 0 errors                                                                                                                                          |
| `npx eslint src/features/audit`         | 0 problems                                                                                                                                        |
| `npx prettier --check .`                | clean                                                                                                                                             |
| `node scripts/check-rules.mjs`          | `✅ struktura OK`                                                                                                                                 |
| `npx next build`                        | success; `/audit` dynamic                                                                                                                         |
| Live on `localhost:3000`                | `/api/v1/metrics?scope=own` → 503, `/api/v1/audit` → 503; `/audit` renders only the English loading state server-side, with no zero-filled panels |

One assertion worth keeping in mind: the arithmetic oracle in `metrics.test.ts` recomputes
`(48000 − 6240) / 48000 = 87.0%` and compares it with the value in the payload. The screen still prints
the server's number — the test guards the data, not the view. That is the shape AT15-8 needs once real
metrics exist.

**Not verified.** No browser pass again: no DOM or e2e runner, so no screenshots, no keyboard walk, no
375 px / 1440 px check, and the client-side states were never seen rendered — only their inputs and
outputs were asserted. No real metrics or audit rows exist until G2, so every number on screen today
comes from a refusal, not from a measurement.

## Still blocked on the integrator

Unchanged and now load-bearing for P2: real `GET /metrics` and `GET /audit` (both still the 503 seam),
an authenticated session with prepared accounts, and a runner for DOM assertions. Items 4 (pagination
signal), 6 (scope refusal and role discovery) and 13 (actor display label) from
[06-integrator-requests.md](06-integrator-requests.md) are the next ones to bite: P3 cannot ship a scope
control without item 6, and the activity list shows actor UUIDs until item 13 is answered.
