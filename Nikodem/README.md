# Builder C research package — T08 audit and usage dashboards

Private working material for Nikodem (Builder C). **Not product documentation, not evidence, never
committed.** Product specifications live in `docs/**` and are owned by the integrator.

## Why this folder exists

The handoff authorises exactly one kind of preparation before the shared foundation lands —
`docs/team/developer-handoffs.md`, G0 bullet for Nikodem:

> map each dashboard field to the existing contracts/formulas; prepare labelled static test cases for
> actual, estimated, unknown and denied states

This package is that preparation written down, so the implementation is mechanical: every visual
already has a named contract field, every number has a formula and an honesty label, and every state has
a fixture.

**Status 2026-10-03:** gate G1 is merged — `f04054b`, PR #7. `src/features/audit/index.ts`,
`@/shared/contracts` and the typed client exist on `main`, so T08 implementation may start. What G1
settled, and the two gaps it introduced, are recorded at the top of
[06-integrator-requests.md](06-integrator-requests.md).

## Scope

Owned: `src/features/audit/**` and its tests. Task T08 — minimal trace detail, personal dashboard,
admin organisation dashboard, usage/cost displays, audit-CSV download interaction.

Not owned and not planned here: authentication, gateway decisions, HTTP routes, migrations, shared
components, dependencies, workbench, detection.

Judging relevance: `Security/management reporting (20%)` — `docs/product/requirements.md:91`. Demo slot
`2:35–3:00 Admin dashboard and Claude Code trace` — `docs/demo/runbook.md:25`.

## Index

| File                                                   | Question it answers                                              | State                 |
| ------------------------------------------------------ | ---------------------------------------------------------------- | --------------------- |
| [01-field-map.md](01-field-map.md)                     | Where does every number come from, and what kind of truth is it? | ready                 |
| [02-honesty-rules.md](02-honesty-rules.md)             | What am I allowed to claim on screen, in which words?            | ready                 |
| [03-state-matrix.md](03-state-matrix.md)               | What does each view show in every state, with what copy?         | ready                 |
| [04-component-plan.md](04-component-plan.md)           | Can the shared blocks express these views, what is missing?      | ready                 |
| [05-test-plan.md](05-test-plan.md)                     | How are AT10/AT15/AT16 proven, and with which numbers?           | ready, partly blocked |
| [06-integrator-requests.md](06-integrator-requests.md) | One message: what I need from Bartosz, and my default if silent  | ready to send         |
| [07-build-order.md](07-build-order.md)                 | What do I build, in what order, after G1?                        | ready                 |
| [08-p1-handoff.md](08-p1-handoff.md)                   | What P1 shipped, with its evidence and what is not verified      | delivered             |
| [09-p2-handoff.md](09-p2-handoff.md)                   | What P2 shipped: dashboard, activity list, evidence and gaps     | delivered             |
| [10-answers-to-julian.md](10-answers-to-julian.md)     | The trace route and the workbench/audit boundary, for N1 and N2  | ready to send         |
| [11-p3-handoff.md](11-p3-handoff.md)                   | What P3 shipped: scope control, subcalls, the AT10-4 leak tests  | delivered             |
| [fixtures/](fixtures/)                                 | Schema-valid labelled data for views and tests                   | ready                 |

`05-test-plan.md` is partly blocked: `npm run test` (vitest) arrived with G1, but it collects only
`src/**/*.test.ts` in a Node environment, and there is no browser runner, so component-level and e2e
assertions still have nowhere to run. That gap is named, not hidden.

## Local hygiene

- `Nikodem/` is excluded through `.git/info/exclude` (local, never committed). `git status` stays clean
  and `scripts/check-rules.mjs` (which uses `git ls-files --others --exclude-standard`) does not warn.
- Prettier checks the whole tree and cannot see `.git/info/exclude`, so run
  `npm run format -- Nikodem` before `npm run check:fast`.
- Never `git add Nikodem`. Nothing here goes into a PR; what belongs in a PR is restated there in the
  PR's own words.
- `.gitignore` and `.prettierignore` are integrator-owned and are not touched.

## Rules this package enforces on itself

1. Every factual row cites a `path:line` in `docs/**` or `src/**`. A row with no source is either
   removed or marked `DECISION` and explained.
2. No field name is invented. If a visual needs data the contract does not define, it becomes an entry
   in `06-integrator-requests.md`, never a new local data model.
3. Fixtures are synthetic, named so they cannot be mistaken for evidence, and never reach the judged
   runtime.
4. `null` is never rendered as `0`; `Not measured`, `Unknown` and `N/A` are distinct.
