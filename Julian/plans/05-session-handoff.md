# Session handoff — Builder A, 2026-10-03

Written so the next session can continue without reading any chat history. Baseline: merged main
`c4a15b0`, 2026-10-03 17:33 UTC.

## Situation

I am **Builder A — workbench**, owning `src/features/workbench/**` and this `Julian/` folder, and
nothing else. Role swap: the originally-assigned Julian took Builder B (detection) because his
machine suits local models; I took workbench.

**Clock (GitHub issue #6, immutable):** start 3 Oct 14:28 UTC · **feature freeze 4 Oct 07:00 UTC** ·
deadline 09:00 UTC. T11 must finish before the freeze, not after it.

## What is built and merged

Merged to main across PRs **#12, #16, #18, #19**. All logic sits in pure `.ts` modules under
`src/features/workbench/lib/` with `.tsx` kept thin, because `vitest.config.mts` is
`environment: "node"` and includes only `src/**/*.test.ts` — Bartosz confirmed in B1 that this stays
the architecture for now. **142 workbench tests**, 411 in the repo.

| Slice                | What exists                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **W0** core          | `envelope.ts` (status + decision + error code → one screen state), `runState.ts` (terminal set, 1 s poll control), `citations.ts`, `chatData.ts` (narrows the shared `Response.data` union), `chatFlow.ts` (lifecycle-aware chat classification), `idempotency.ts`, `forbidden.ts` (test-only exposure oracle), `views.ts`, `trace.ts`, `importForm.ts`, `importStatus.ts`, `policyForm.ts`, `feedForm.ts`, `fixtures.ts` (dev/test only) |
| **W1** chat          | `ChatPanel.tsx` — create → execute once → poll while visible → stop on terminal. No streaming; nothing renders until a releasing decision                                                                                                                                                                                                                                                                                                 |
| **W2** sources       | `SourcesPanel.tsx` — upload form, source list, import list. Status and classification as separate badges. No original-download control anywhere                                                                                                                                                                                                                                                                                           |
| **W4** policy + feed | `PolicyPanel.tsx`, `FeedPanel.tsx` — form generated from the loaded document, invariant hints only, no bypass toggle                                                                                                                                                                                                                                                                                                                      |
| **W3 / W5**          | **Deliberately not built.** Each renders a named "waiting on a contract decision" state                                                                                                                                                                                                                                                                                                                                                   |

Views live on one route, chosen by `?view=chat\|sources\|review\|policy\|export`, following the
precedent the audit feature set. `src/app/**` is integrator-owned; no route segments were needed.

## Open right now

**PR #22** on branch `codex/workbench-idempotency`: the idempotency fix plus
[03-browser-qa.md](03-browser-qa.md) and [04-judge-script.md](04-judge-script.md). **Needs merging —
it fixes a bug that breaks the second question any user asks.**

## Three real bugs found and fixed

Worth knowing because each would have surfaced live, and each was found by reading the contract
rather than by running anything.

1. **Pending run read as a service failure.** protocols.md: `run_execute` and `run_read` return
   "Run while pending/running", and a pending run carries `decision: null` by contract. The generic
   classifier correctly fails closed on 200-with-no-decision, so every normal in-progress poll
   rendered as a service error. Fixed by `lib/chatFlow.ts`. On main.
2. **Compare-and-swap version inverted.** technical-spec §5 "Version supplied must equal expected+1"
   means `expected_version` is the head you loaded and the _document's_ `version` is head + 1. I had
   sent head + 1 as `expected_version`, which compares against a version that does not exist — every
   policy save would have conflicted. Fixed; **B12 still asks Bartosz to confirm the convention.**
3. **One idempotency key per panel.** Uniqueness is `(org, actor, operation, key)` with a stored
   request hash: same key + different hash → 409. A single long-lived key meant the second, different
   question always failed. Fixed by `lib/idempotency.ts`. **In PR #22, not yet on main.**

Also found: a `datetime-local` value carries no zone, so `Date.parse` reads it as local time and
future/past checks became timezone-dependent. The feed form now prints the resolved UTC instant;
tests pin explicit `Z`.

## Blockers, by owner

**Bartosz — blocking:**

- **B8** `Review` carries no findings or locator field, but DESIGN requires showing both. **W3 cannot
  be built.**
- **B16** a completed export returns only `{download_path, expires_at}`, but DESIGN asks for the
  checked summary text and citations. **W5 cannot be built.**
- **B12** confirm the CAS convention above when `policy_update` / `feed_import` land.
- **B21** pass `role` and `dealIds` as props from `src/app/workbench/page.tsx` (still a bare
  re-export). Until then every view shows and the deal select is disabled. Harmless by design.
- **B3** a `ref`-forwarding `Input` (a file input cannot be read imperatively) and a tabs primitive.
- **B18** `<html lang="pl">` in `src/app/layout.tsx:16`, plus `"Ładowanie…"` and `"Klocki UI"` from
  shared/app files. **R20 and AT16 cannot pass while the shell renders Polish.**

**Answered already** (recorded in section 4 of [02-open-questions.md](02-open-questions.md)): B5
chat is the first live operation · B6 role and deals as props, no `deal_id` for G2 · B20 session
resolved by PR #14 · B1 keep logic in pure `.ts`. Self-answered: B2 routing, B4 multipart
(`openapi-fetch` passes `FormData` natively), B7 trace link is `/audit?trace=<trace_id>`.

## Verification state — read before claiming anything

- `npm run check` green including build; 411 tests pass.
- **Every `/api/v1/*` operation still returns 503 `STATE_UNAVAILABLE`.** No gateway route exists, so
  **no workflow has run end to end.** W1, W2 and W4 are _built_, not _working_.
- **The signed-in browser pass is outstanding.** `src/proxy.ts` redirects every page except `/login`
  and `/health`, and reading `.env.local` is blocked by a deny rule in the agent environment, so I
  could never log in. Run [03-browser-qa.md](03-browser-qa.md) in a real browser.
- Earlier anonymous render checks of the five views are **void** since PR #14 added middleware.

## Schedule risk to escalate

Two of the seven runbook steps depend on workbench screens that do not exist:

| Runbook step                       | Screen | Blocked on |
| ---------------------------------- | ------ | ---------- |
| 1:15–1:40 Admin resolves REV-01    | Review | B8         |
| 2:05–2:35 Reviewer creates S03 PDF | Export | B16        |

Each then needs the decision, the endpoint, the build and a browser pass. If the decisions do not
arrive, **rewrite the runbook to steps that exist** rather than discover it in front of judges.

## Repo workflow gotchas learned the hard way

- **PRs merge within minutes.** Work was stranded **twice** by pushing more commits to a branch whose
  PR had already merged — the commits go nowhere. **One slice, one branch, open the PR immediately,
  and check `gh pr view <n> --json state` before pushing again.**
- Commits use `type(scope): description` and **no `Co-Authored-By`** (implementation plan).
- `check:fast` runs `prettier --check .` with no ignore entry for `Julian/`, so an unformatted file
  here breaks the check for everyone. Always `npm run format -- <files>`.
- `check:rules` prints a non-blocking warning about `Julian/` being outside `src/features/`. Expected.
- `check:fast` also runs `contracts:types`, which regenerates `src/shared/contracts/openapi.gen.ts`.
  Do not commit a stray regeneration diff.
- `validate-docs.mjs` only walks `docs/`, `AGENTS.md`, `DESIGN.md`, `CLAUDE.md` — it will not catch a
  broken link in `Julian/`.
- `.claude/settings.local.json` is untracked and was unformatted, which broke `format:check` locally.

## If the next task is the pitch deck

Existing assets, **both integrator-owned** — request changes through Bartosz rather than editing:
`docs/pitch/pitch.md` and `docs/pitch/presentation.html` (six slides, already built).
[docs/demo/scenarios.md](../../docs/demo/scenarios.md) owns the exact facts.

Claims the team has explicitly **rejected** and that must not appear:

- any promised gateway overhead figure, such as "100–200 ms";
- a zero false-positive rate;
- fine-tuning or a cloud fallback as delivered features;
- a real cost saving. The comparison rate is labelled _"Illustrative commercial equivalent; not an
  invoice"_, and the local path spends tokens and time, not dollars.

Honest framing that is actually supported: deterministic enforcement with an uncalibrated model risk
signal; fail-closed on any required service failure; atomic budget reservation; durable audit before
effects; private originals; public-only export context. The S01-versus-S02 exposure contrast is the
strongest single demonstration, and it is real rather than staged.

`docs/product/research-decisions.md` lists what remains unmeasured; anything from that list stays a
placeholder in the pitch until the evidence pack replaces it.
