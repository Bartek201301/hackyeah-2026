# 13 — The last unbuilt lines of P2–P5: day selection and paging

Branch `codex/audit-range-and-paging`, stacked on `codex/audit-focus-and-export`. Merge order:
`codex/audit-focus-and-export` → this branch.

This closes three lines that P2, P4 and P5 listed and never delivered. They were easy to miss, because
each phase shipped the screen around the missing control.

## 1. The UTC day

`07-build-order.md` gave P5 "the current scope **and day**", the state matrix carried the standing copy
`UTC day` and `Current UTC day`, and the empty state told the reader to "choose another day" — while a
grep confirmed the feature **never sent `from` or `to` at all**.

- `range.ts` parses `?day=`, strictly: `2026-02-30` and `2027-02-29` are rejected rather than silently
  shifted, and anything unreadable falls back to the **current** UTC day, never to a wider window.
- `dayBounds` sends explicit inclusive bounds for exactly one day, which is what
  `docs/contracts/protocols.md:120` confines a range to. The screen therefore never asks for a range it
  would have to defend.
- The day lives in the URL, so a window is shareable and a reload shows the same evidence — which is the
  point when a number has to be defended after the demo.
- `DayControl` is a shared `Field` plus `Input type="date"`, and it re-validates the value before
  navigating: a typed or pasted value reaches the handler before any server sees it.
- Switching scope keeps the day. Resetting it silently would change two things at once.

**A new check fell out of this.** `metricsView` now reports `windowSingleDay`, computed by
`isSingleUtcDay` from the response's own `from`/`to`. If the gateway ever reported a wider window, the
figures are still shown as reported, with the discrepancy stated — the screen echoes the window, so it
should not also vouch for it.

## 2. Paging

`nextCursor` was computed and read by nobody; the list only printed `Showing the 100 most recent
records.` Now the footer carries a `Load older records` control that asks for the next page by cursor and
appends it.

**A failed older page never discards the rows already on screen.** It says what failed and leaves the
evidence in place: losing visible records to a network error would look like losing audit data.

Pages are keyed by the request, so changing the day or the scope drops them without a reset effect —
which also keeps the component free of the `setState` in an effect that React 19's lint rule rejects.

## 3. A false statement removed from the list

The matrix gave the activity list `No audit records for this UTC day.` / `Choose another day to see
earlier activity.` But `GET /audit` takes no range parameter, only `after`, so **that list is not
day-scoped**. The copy now reads `No audit records of your own are stored yet.` /
`Records appear here once an audited operation has been stored.` The day wording stays on the metrics
side, which really is confined to one day. [03 §3](03-state-matrix.md) records the change and the reason.

A second correction followed the gateway work: `audit_list` has no scope parameter, so the list is own
activity in both scopes. The card is now titled `Your recent activity`, the note above it says the scope
and day apply to the figures and the export rather than to the list, and the actor column is gone.

## 4. The two worksheet edge cases that had no test

From [05 §5.3](05-test-plan.md), both now asserted in `metrics.test.ts`:

- `permitted_source_tokens_estimate: 0` → the reduction and the avoided spend read `N/A`, and explicitly
  not `0.0%`.
- an empty day with every usage field null → `Not measured` for all four usage rows, while the five
  counters stay `0`, because a counter at zero is a real measurement of nothing happening and an
  unmeasured token count is not.

## Evidence

| Check                                   | Result                                                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run`                        | **276 passed** (23 files); **115 in this feature**                                                                                           |
| `npx tsc --noEmit` after `next typegen` | 0 errors                                                                                                                                     |
| `npx eslint src/features/audit`         | 0 problems                                                                                                                                   |
| `npx prettier --check .`                | clean                                                                                                                                        |
| `node scripts/check-rules.mjs`          | `✅ struktura OK`                                                                                                                            |
| `npx next build`                        | success                                                                                                                                      |
| Live on `localhost:3000`                | `/api/v1/metrics` and `/api/v1/audit/export` with explicit `from`/`to` both answer 503, so the range reaches the gateway in the agreed shape |

One commit rather than the two I planned: `Dashboard.tsx` carries both the day and the paging, so a split
would have required an intermediate commit that did not build.

**Not verified, and this got stricter.** Since T02 phase 3 every page redirects to `/login` without a
session, so the rendered HTML can no longer be inspected without credentials I do not hold. The day
input was never used, no page was ever navigated, the `Load older records` click was never issued and no
focus ring was seen. Day parsing and bounds are asserted by `range.test.ts` instead — 9 assertions,
including month, year and leap-day boundaries.

## What is left in the plan

P6 only, and it is entirely blocked: the browser pass per role, screenshots, the keyboard walk at 375 px
and 1440 px, and the one assertion that matters most — displayed numbers against persisted records
(`docs/testing/acceptance.md:63`). All of it needs the T03 routes, a session per role and a DOM runner.

Every line of P1–P5 that can be built without a server is now built.
