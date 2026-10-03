# 11 — P3 delivered: organisation scope and stage expansion

Phase P3 of [07-build-order.md](07-build-order.md). Branch `codex/audit-admin-dashboard`, stacked on
`codex/audit-personal-dashboard`; the PRs merge in order P2 → P3.

This is the phase that owns the demo slot `2:35–3:00 Admin dashboard and Claude Code trace`
(`docs/demo/runbook.md:25`) and the judging category `Security/management reporting (20%)`.

## What exists now

| File                          | Role                                                                        |
| ----------------------------- | --------------------------------------------------------------------------- |
| `scope.ts`                    | strict parsing of `?scope=`, falling back to the narrower scope             |
| `components/ScopeControl.tsx` | two links, offered to everyone, with the refusal handled as a state         |
| `trace.ts`                    | `isToolSubcall`, `StageRow.isSubcall`, `groupStages`                        |
| `components/StageList.tsx`    | root stages at the top level, consecutive subcalls folded into a disclosure |
| `components/Dashboard.tsx`    | a refused organisation scope now shows nothing from that scope              |
| `safety.test.ts`              | the AT10-4 leak assertions, run against the view models                     |
| `scope.test.ts`               | AT10-2: refusal, and no organisation figure derived from it                 |

The feature now holds **91** assertions; the repository **172**.

## Decisions taken, and why

**The organisation option is offered to everyone.** Hiding it from a non-admin would turn a rendering
choice into an access decision, and `AGENTS.md` is explicit that UI role visibility is not authorization.
The gateway refuses the request, and the refusal is a state this screen renders. That also means the
feature needs no role in the browser at all, which is why item 6 no longer blocks P3.

**An unrecognised `?scope=` falls back to `own`, never to `organisation`.** The fallback is the narrower
scope, so a typo or a crafted URL cannot widen what is requested.

**A refused organisation scope shows nothing from that scope — including the activity list.** This is
the subtlest decision in the phase. `GET /audit` takes no scope parameter, so after a denied `/metrics`
the list would still return whatever rows the actor may see; rendering those under the heading
"Organisation activity" would be a false label on true data. The screen shows the refusal and says in
one line that the list is withheld too.

**A figure that arrives beside a refusal is ignored.** If a server ever sent organisation counters
together with `ACCESS_DENIED`, the error still decides and no number reaches the model. Asserted in
`scope.test.ts`, because 200 is not approval and neither is a populated payload.

**Tool subcalls are recognised by stage name, and this is a documented guess.** `events[]` carries no
parent reference and no subcall flag, while `data-model.md:58` requires root traces to be counted
separately from subcall decisions. The two names in `RegisteredTool` — `search_excerpts` and
`read_excerpt` — are the only signal available. A wrong heuristic mislabels a group; it cannot corrupt a
figure, because stages are never summed into a request count and the header stays `root request`. Raised
as item 18 in [06-integrator-requests.md](06-integrator-requests.md).

**The disclosure is native `<details>`.** No shared disclosure block exists; [04 §3](04-component-plan.md)
recorded that gap and this is the recorded fallback.

## The AT10-4 assertions, without a DOM runner

There is still no browser or DOM runner, so the leak test attacks the layer directly below the DOM. A
projection is built carrying exactly the strings a leaking screen would show — a prompt, a document
title, an API key, a contact canary and a valuation sentence — as fields the contract does not define.
The payload passes shape validation on purpose, because `readProjections` tolerates unknown fields; that
is what makes the test meaningful instead of circular. The view models are then built and serialised,
and the whole structure is searched for those strings. A component can only render what the model
carries.

The same file asserts the other half of AT10-4: the blocked trace still shows `ACCESS_DENIED` and
`RESTRICTED_SOURCE` and the `Blocked` label, and a `Finding` has exactly six keys with no `value` among
them. A screen that leaked nothing because it showed nothing would be useless.

AT10-3 is covered structurally: the activity read exposes `rows`, `pageCapped` and `nextCursor` and
nothing else, so no screen can present one page as a total; and a case with seven rows on the page beside
`root_requests: 3` asserts that the displayed count is three, taken from `/metrics`.

## Evidence

| Check                                   | Result                                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run`                        | **172 passed** (14 files); 91 in this feature                                                                                                   |
| `npx tsc --noEmit` after `next typegen` | 0 errors                                                                                                                                        |
| `npx eslint src/features/audit`         | 0 problems                                                                                                                                      |
| `npx prettier --check .`                | clean                                                                                                                                           |
| `node scripts/check-rules.mjs`          | `✅ struktura OK`                                                                                                                               |
| `npx next build`                        | success                                                                                                                                         |
| Live on `localhost:3000`                | `/audit` marks Own current; `?scope=organisation` marks Organisation current; `?scope=everyone` and `?scope=ORGANISATION` both fall back to Own |

**Not verified.** No browser pass: the disclosure was never opened with a pointer or a keyboard, no
screenshots exist, and the 375 px / 1440 px check is outstanding. The organisation figures themselves
have never been seen, because `/api/v1/metrics` is still the 503 seam — the refusal path is asserted, the
success path is only typed. AT10-2's end-to-end half (a real non-admin JWT receiving a real 403) needs
T03 and a session.

## What P3 still needs from the integrator

Item 18 would replace the subcall heuristic with a fact. Item 13 would replace actor UUIDs with a safe
display label, which matters most in exactly this view, since organisation rows are the only place an
actor other than the viewer appears. Everything else is the same wall as before: real routes, a session,
and a DOM runner.
