# 07 — Build order after G1

Prerequisite for every phase: **met on 2026-10-03.** G1 is merged at `f04054b` (PR #7);
`src/features/audit/index.ts` exports `meta` and a default page, types come from `@/shared/contracts`
(the envelope type is `ApiResponse`), and the client is `createGatewayClient()` from
`@/shared/contracts/client`. P1 may start.

Per phase: a short branch `codex/audit-<slice>` from current `origin/main`, update by **merge** (never
rebase or force push), `npm run format -- <owned files>`, `npm run check:fast` before a small commit (it now also regenerates `openapi.gen.ts` and runs vitest),
`npm run check` before the PR, commits as `type(scope): description` with no `Co-Authored-By`, draft PR
while unfinished, one PR at a time merged by the integrator.

## Delivery — what actually happened

The phase text below is the record of intent and is left as it was written. This table is what shipped,
because a plan that disagrees with the repository is worse than no plan.

| Phase | Planned branch                   | What actually shipped                                                                                                                                                                     | State                                 |
| ----- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| P1    | `codex/audit-trace-view`         | as planned — PR #11                                                                                                                                                                       | merged                                |
| P2    | `codex/audit-personal-dashboard` | as planned — PR #13                                                                                                                                                                       | merged                                |
| P3    | `codex/audit-admin-dashboard`    | as planned — PR #17                                                                                                                                                                       | merged                                |
| P4    | `codex/audit-usage-estimates`    | **never a branch.** The estimates panel, `N/A` rules, source-trace link and illustrative cost shipped inside P2; its two worksheet edge cases were only asserted later, in the range work | folded into P2                        |
| P5    | `codex/audit-csv-export`         | shipped as `codex/audit-focus-and-export` — PR #21, together with the focus fix and the AT10/AT15/AT16 coverage table                                                                     | merged                                |
| (new) | —                                | `codex/audit-range-and-paging` — the UTC day control, cursor paging, and the two edge-case tests P4 owed                                                                                  | merged                                |
| P6    | `codex/audit-qa-evidence`        | split: `codex/audit-trace-qa` (PR #46), `codex/audit-p6-evidence` (PR #52) and `codex/audit-blocked-evidence` (PR #58) — real-run evidence for the trace view, the dashboard and a BLOCK  | merged; three observations still owed |
| (new) | —                                | `codex/gateway-metrics` (PR #57) and `codex/gateway-audit-list` (PR #62) — the two gateway reads this feature consumes, delegated by the integrator                                       | merged                                |
| (new) | —                                | `codex/gateway-audit-export` — the audit CSV, and `codex/audit-list-own-scope` — the list is own records in both scopes                                                                   | pushed, PR not opened                 |

P6's blockers are gone: T03 landed, the three reads it needed were delegated to me and built, and the
DOM runner arrived with happy-dom. What is still owed is not code — a 375 px pass, the full keyboard path
and one non-admin session — and each needs a browser and a password that is never written down.

Two phases were therefore wrong in shape, not in content: P4 was never a slice of its own, and P5 arrived
with work the plan had not anticipated. The day control and the paging were lines inside P2, P4 and P5
that each phase shipped around; [13-range-and-paging.md](13-range-and-paging.md) records how that
happened and why it was easy to miss.

Per-phase evidence lives in [08](08-p1-handoff.md), [09](09-p2-handoff.md), [11](11-p3-handoff.md),
[12](12-p5-handoff.md) and [13](13-range-and-paging.md).

## P1 — Minimal safe trace detail (gate G2)

Branch `codex/audit-trace-view`. Target: the chat answer's trace link lands on a real view
(`docs/demo/runbook.md:19`).

- Consumes `GET /audit/{id}`.
- Renders [01 §2](01-field-map.md): summary, three-column usage, stage list, assessment block.
- Ships states: loading, 403, 404, 503 `AUDIT_UNAVAILABLE`, `INCOMPLETE`, unknown usage, unresolved
  reservation, event cap.
- Tests: AT10-5, AT10-7, AT10-8, AT10-9, AT15-1, AT15-2, AT15-3, AT15-10.
- Handoff names: the exported component, the route it is mounted on, endpoints consumed, states shipped,
  checks run, and what is still unavailable.

## P2 — Personal dashboard

Branch `codex/audit-personal-dashboard`. Consumes `GET /metrics?scope=own` and `GET /audit`.

- Two equally visible groups per [04 §2](04-component-plan.md); recent-activity list linking to P1.
- States: empty day, invalid range, rate limited, page cap, `confirmed_test_failures: null`.
- Tests: AT10-1, AT15-4, AT15-6, AT15-7, AT15-8.

## P3 — Organisation aggregates and stage expansion

Branch `codex/audit-admin-dashboard`. Consumes `GET /metrics?scope=organisation`.

- Scope control, admin-only refusal state, expandable tool subcalls with root-versus-subcall labelling.
- Tests: AT10-2, AT10-3, AT10-4.

## P4 — Context reduction and illustrative cost

Branch `codex/audit-usage-estimates`.

- `permitted` versus `selected` comparison, percent or `N/A`, source-trace link, illustrative cost with
  disclaimer and rate version.
- Tests: AT15-5, AT15-9, and the [05 §5.3](05-test-plan.md) edge cases.

## P5 — Audit CSV download

Branch `codex/audit-csv-export`. Consumes `GET /audit/export` with the current scope and day.

- Loading, success with export trace, 403, over-cap narrowing, failure; one request per double click.
- Tests: AT10-6, AT16-6.

## P6 — Evidence and release support

Branch `codex/audit-qa-evidence`.

- `hackyeah-browser-qa` run per role at ~375 px and ~1440 px, keyboard path, console/network check,
  screenshots without secrets.
- Verify displayed numbers against persisted records for the selected traces
  (`docs/testing/acceptance.md:63`).
- Rehearse the `2:35–3:00` demo beat (`docs/demo/runbook.md:25`): security decisions beside actual usage,
  estimates labelled, policy/feed version change visible between stages, replayed evidence declared as
  replayed.
- Report AT10/AT15/AT16 results and name every gate not run.

## Demo beat sheet for 2:35–3:00

| Beat | Action                               | Visible proof                                             | Spoken honesty line                                    |
| ---- | ------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------ |
| 1    | admin opens organisation reporting   | controls and resources side by side                       | "Blocked attempts are refused requests, not breaches." |
| 2    | point at the cost card               | figure + rate version + disclaimer                        | "Illustrative equivalent, not an invoice."             |
| 3    | open the blocked trace               | reason codes, zero generation, nothing about the resource | "No denied content appears here."                      |
| 4    | open the outage trace                | `Not measured` plus retained reservation                  | "Unknown usage is not zero."                           |
| 5    | expand stages across a policy change | different `policy_version` between events                 | "The next operation used the new version."             |
| 6    | download the CSV                     | export trace id shown                                     | "Scoped to admin, formula-safe, capped at 1000 rows."  |

Fallback if a live call fails: show a preserved real trace with its timestamp and say it is replayed
(`docs/demo/runbook.md:27`).

## Handoff template

```text
Handoff: [gate/task/slice]
Ready commit/PR: [SHA + link]
Public exports or routes: [exact names]
Inputs/outputs: [canonical contract reference]
Checks actually run: [commands + result]
Real services used / fixtures used: [explicit]
Still unavailable: [list or none]
Unblocks: [person + next step]
```
