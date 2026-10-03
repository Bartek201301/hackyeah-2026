# Builder A — workbench research index

**Owner:** Builder A (workbench). **Scope:** `src/features/workbench/**` and its tests, nothing else.
**Updated:** 2026-10-03, against merged main `50606ca`.

This folder is Builder A's own research. It is not a specification: authority stays with
[docs/README.md](../../docs/README.md) and the files it names. Where this folder and an authoritative
document disagree, the authoritative document wins — record the discrepancy and stop the dependent
change rather than implementing a compromise.

## Read in this order

| File                                                          | Purpose                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [00-contract-reference.md](00-contract-reference.md)          | One page to code against: envelope, enums, status→state, operations, canaries |
| [01-task-sequence.md](01-task-sequence.md)                    | Ordered tasks W0–W6 with prerequisites, acceptance and PR evidence            |
| [02-open-questions.md](02-open-questions.md)                  | Consolidated blocking questions per owner, ready to send                      |
| [03-browser-qa.md](03-browser-qa.md)                          | Signed-in browser checklist for every workbench view                          |
| [04-judge-script.md](04-judge-script.md)                      | Workbench operator script for the three-minute walkthrough                    |
| [05-session-handoff.md](05-session-handoff.md)                | State, bugs found, blockers and workflow gotchas as of 17:33 UTC              |
| [minimal-controlled-chat/](minimal-controlled-chat/README.md) | T06 chat brief — interaction boundary, polling, submission recovery           |
| [imports/](imports/README.md)                                 | T05 sources/upload brief — file selection, limits, outcome labels             |
| [review/](review/README.md)                                   | T07 review brief — candidate display, exact version, evidence                 |
| [policy-feed/](policy-feed/README.md)                         | T07 policy/feed brief — form over schema, conflict handling, validation       |
| [public-summary-download/](public-summary-download/README.md) | T09 export brief — run lifecycle, authenticated download, readiness           |

The five per-screen briefs are the research. The three numbered files are the working layer on top:
what to code against, in what order, and what is still blocked.

## State of play

**Merged main `50606ca`** ([PR #8](https://github.com/Bartek201301/hackyeah-2026/pull/8)).

- **G0** — accepted specification on main (`8c1484b`, [PR #5](https://github.com/Bartek201301/hackyeah-2026/pull/5)); closure recorded in issue #6.
- **G1** — shared foundation merged at `f04054b` ([PR #7](https://github.com/Bartek201301/hackyeah-2026/pull/7)). Gives
  schema-derived types in [src/shared/contracts/index.ts](../../src/shared/contracts/index.ts), the
  browser-safe typed client in [client.ts](../../src/shared/contracts/client.ts), the
  [workbench entry point](../../src/features/workbench/index.ts), `src/app/workbench/page.tsx`, a nav
  entry, and the 503 seam in [unavailable.ts](../../src/shared/gateway/unavailable.ts).
- **T02** — core schema merged and applied. [supabase/APPLIED.md](../../supabase/APPLIED.md) records
  `20261003152115_core_schema.sql`, commit `632d006`, applied 2026-10-03 15:31 UTC: **17 tables,
  RLS 17/17, 3 SELECT policies, anon probe denied 17/17.**

**Every `/api/v1/*` operation still returns HTTP 503 `STATE_UNAVAILABLE`.** The catch-all route
`src/app/api/v1/[...path]/route.ts` answers GET/POST/PUT/DELETE with
[unavailableResponse()](../../src/shared/gateway/unavailable.ts) until Bartosz's real routes take
precedence. No live gateway behaviour may be claimed anywhere in this folder.

**Not yet available:** prepared accounts, `demo:seed`, `test:db`, `test:e2e`, Playwright, and any
component-testing environment. Existing scripts are `dev`, `build`, `start`, `typecheck`, `lint`,
`check:rules`, `check`, `doctor`, `format`, `format:check`, `new-feature`, `test:tooling`,
`check:fast`, `contracts:types`, `test`.

## Delivery clock

From issue #6, immutable. Do not restart it.

| Marker              | UTC             | Kraków          |
| ------------------- | --------------- | --------------- |
| Original start (H)  | 3 Oct 14:28     | 3 Oct 16:28     |
| **Feature freeze**  | **4 Oct 07:00** | **4 Oct 09:00** |
| Submission deadline | 4 Oct 09:00     | 4 Oct 11:00     |

Issue #6 notes the implementation plan's H+17:00 T11 gate would land after the freeze, because the
window is 18 h 32 min rather than 19 h. T11 must therefore finish by 07:00 UTC.

## Working rules

- Branch `codex/<task>` from current `origin/main`; update with merge, never a shared rebase or force
  push. No direct push to main.
- Commit `type(scope): description`, **without `Co-Authored-By`**
  ([implementation plan](../../docs/team/implementation-plan.md)).
- Format only owned changed files: `npm run format -- <files>`. `check:fast` runs `prettier --check .`
  and there is no ignore entry for `Julian/`, so an unformatted file here breaks the check for the
  whole team.
- `npm run check:fast` before a small commit; `npm run check` (includes build) before a PR.
- Do not edit `src/app/**`, `src/shared/**`, `src/app/nav.ts`, `package.json`, lockfiles,
  `.gitignore`, `supabase/**`, or another builder's feature. Request changes from Bartosz with an
  exact input/output contract instead of duplicating shared code.
- No feature-private CSS; `scripts/check-rules.mjs` fails on any `.css` under `src/features/**`.
- Labelled development fixtures may exercise views and tests. They never substitute fake success in
  the judged app.
- UI role visibility is presentation, never authorization. No direct raw or excerpt Supabase reads,
  no browser model credentials, no unchecked streaming output.
