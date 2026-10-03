# Implementation plan — four people, one delivery clock

Status: ready for task assignment; application tasks pending. Documentation preparation is **T00 inside the original 19 hours**, not extra time. Start from [AGENTS](../../AGENTS.md) and [documentation authority](../README.md).

## Clock and critical path

T00 execution evidence: this documentation branch was created **3 October 2026, 13:38:17 UTC (15:38:17 Warsaw)**. This is a lower bound on preparation start, not a new 19-hour start. The handoff report records verification time. Subtract that elapsed preparation plus any earlier planning time from the original allowance; retain the original submission deadline.

At kickoff record the original 19-hour start timestamp and immutable deadline in the release issue/PR. If that timestamp is unavailable, record the actual remaining time with the team; do not claim another 19 hours. Log documentation elapsed time as T00. Planned checkpoints below are measured from the original start, not the end of this document.

| Deadline      | Work / exit evidence                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| H+00:45       | T00 documents and contracts frozen; active decisions consistent                                       |
| H+02:00       | T01/T02 foundations, account/schema/RLS; T04 model connectivity/revisions verified                    |
| H+05:00       | T03/T04/T06 one real allowed and one blocked request through auth, policy, Laya, Ollama, audit and UI |
| H+10:00       | T05 imports, retrieval, budget/loop controls, T08 initial dashboards                                  |
| H+14:00       | T07 review/config/feed, T09 export, T10 Claude Code MCP integrated                                    |
| H+17:00       | T11 security/DB/browser/live semantic/performance gates; failures corrected                           |
| Final 2 hours | T12 freeze, production verification and rehearsal; measured evidence replaces placeholders            |

The integrator is the bottleneck: freeze shared types and database RPCs first, reuse one engine for all routes and adapters, and avoid secondary frameworks. If behind schedule, remove animations, extra charts and bonus formats. Do not remove hybrid assessment, access control, durable audit, atomic budgets, review or positive/negative tests. Unfinished required work is reported as such.

## Ownership and handoff rules

Integrator owns shared contracts, persistence/auth/engine/budget, routes, dependencies, deployment, MCP and integration tests. A owns only `src/features/workbench/**`; B only `src/features/detection/**`; C only `src/features/audit/**`. Each feature exposes `index.ts`. Integrator creates these entry points and merges shared foundation before dependent branches start. Assign actual humans in PR metadata; role labels below are final directory ownership, not GitHub usernames.

Each person works in an isolated checkout/worktree and short branch from current origin/main. One owner edits a scope at a time. Update branch with merge, not shared rebase. Builders request shared changes as a typed interface/diff proposal in the PR, never copy shared code into features. No direct main pushes. Peer approval and team-check are required, including integrator PRs. Commit format `type(scope): description`, no Co-Authored-By.

## T00 — documentation baseline (Integrator)

Purpose: eliminate conflicting implementation choices. Requirements: R01–R20. Prerequisite: accepted user plan. Owned files: docs, README, AGENTS, CLAUDE, DESIGN and local skill language clarifications. Inputs: challenge, chat decisions, existing starter, Laya report. Outputs: this package and static pitch. Steps: contracts → PRD/spec → tasks/fixtures/tests → pitch → validate schemas/links/traceability/browser → checks and PR. Evidence: documentation validation report and known runtime gaps. Handoff: read paths and task contracts usable without chat; no runtime completion claims.

## T01 — shared foundation and capability spike (Integrator; B supplies model evidence)

Purpose: establish one buildable contract before parallel coding. Requirements: R01,R05,R15,R19,R20. Prerequisites: T00. Owned: shared/contracts, shared HTTP client, app composition skeleton, feature entry points, dependencies/lockfiles, scripts. Inputs: OpenAPI/policy/feed/semantic protocols. Outputs: schema validators/types, injectable ports, typed client, empty workbench/detection/audit index exports, versioned runtime manifest.

Steps: (1) inspect installed Next guides and existing patterns; (2) create feature entry points with available `npm run new-feature`; (3) pin only selected dependencies and generate/validate contract types; (4) smoke test PDF parsing/generation and MCP transport APIs; (5) verify live Mac Laya/Ollama with B, record digest/checkpoint revision, package locks, question format and safe context bound; (6) establish scripts for unit/browser runners; (7) translate starter-visible labels to English in owned shared/app files. Tests: AT01, contract example validation, build and parser/SDK smoke. Evidence: versions and successful live readiness or named blocker. Handoff: merged contracts and ports; no builder invents shared fields.

## T02 — persistence and prepared identities (Integrator)

Purpose: make permissions and durable state real. Requirements: R02,R03,R10,R13,R19. Prerequisite: T01. Owned: supabase migrations, shared/server/auth and repository, setup scripts. Inputs: data-model/RLS matrix and fixtures. Outputs: additive migration, prepared accounts, idempotent synthetic seed, user/service client separation, real DB test command.

Steps: (1) schema/enums/FKs/indexes/RLS/private buckets; (2) RPC grants and atomic operation/reservation skeleton; (3) verified Supabase sessions and trusted memberships; (4) disable public signup, create four password accounts privately; (5) seed source metadata and raw fixtures; (6) implement `test:db` and credential-safe setup; (7) apply only reviewed committed migration and record APPLIED result before dependent code merges. Tests: AT02, AT08 database foundations, AT17 direct role JWT reads/writes/Storage/RPC. Evidence: migration SHA, database test results and account registry without passwords. Handoff: stable repository methods; no browser raw/excerpt access.

## T03 — gateway, audit and atomic accounting (Integrator)

Purpose: one protected execution path. Requirements: R01,R09,R10,R13,R16. Prerequisites: T01/T02; can use controlled provider fakes until T04 integration. Owned: shared/gateway, repository RPC implementations, app routes/composition, scripts/tests integration. Inputs: adapter ports and policy/feed snapshots. Outputs: intent→checks→reservation→effect→completion engine, run leases/idempotency, safe envelope/errors, reconciliation.

Steps: (1) deterministic identity/policy/scope enforcement; (2) central limit checks and atomic multi-unit reservation; (3) durable intent/completion and unknown states; (4) cancellation/timeouts/idempotent bridge call IDs; (5) safe result buffering/final disclosure checks; (6) wire minimal routes and detection injection; (7) test races and failures. Tests: AT01, AT07, AT08, AT13. Evidence: exactly one accepted reservation in concurrent exhaustion; no effect without intent; unknown usage retained. Handoff: A/C can consume fixed responses; B adapter errors map fail closed.

## T04 — bounded detection, bridge and semantic evaluation (Builder B)

Purpose: actual hybrid assessment with honest coverage. Requirements: R04,R05,R16,R17. Prerequisite: T01 interfaces; start Mac capability work during T01. Owned: detection feature including runtime Python/SQLite bridge, parsers, fixtures/tests. Inputs: semantic protocol, policy subset and frozen cases. Outputs: DetectionPort and GenerationPort factory exports, live authenticated bridge, evidence report.

Steps: (1) lock Laya environment and pin checkpoint revision; (2) start loopback Laya/Ollama and authenticated fixed-route bridge; (3) implement call ledger/cancellation/usage; (4) bounded CSV/PDF parsers with provenance; (5) deterministic scan and tokenizer windows, full coverage proof; (6) stable named risk questions, validated outputs; (7) review labels, tune development only, run held-out; (8) give integrator env/launch contract. Tests: AT03/AT04/AT14; malformed/truncated/tail/window cap, actual provider token/timing fields. Evidence: live revision, dataset hash, FP/miss counts; no invented confidence calibration. Handoff: integrator injects ports; B never imports app/shared server composition or edits dependencies.

## T05 — sources and ingestion (A UI; B parsing; Integrator routes/persistence)

Purpose: connect the demo dataset and quarantine new files. Requirements: R03,R04,R05,R06. Prerequisites: T02/T03/T04. Owned slices remain separate: A workbench source/upload screens; B detection parser/extraction; Integrator shared ingestion and routes. Inputs: source/upload/connector API, fixtures, parser output. Outputs: real import lifecycle and safe excerpt publication.

Steps: Integrator creates allowlisted connector and staging/run routes; B produces bounded units/coverage and candidate findings; Integrator publishes only approved inherited-classification excerpts or creates review; A implements file/source selection, limits, progress, errors and outcome. Tests: AT03, S05, AT17; all formats/limits, partial extraction, complete tail scan, direct bypass. Evidence: raw private, approved text safe, role filtering verified. Handoff: run and review IDs plus safe status for workbench/audit. No blanket original download.

## T06 — controlled chat and retrieval (A UI; Integrator engine/tools)

Purpose: show useful permitted answers. Requirements: R03,R07,R08,R09. Prerequisites: T03/T04; T05 for uploaded material. Owned: A workbench chat; Integrator shared search/read loop + routes. Inputs: chat/run/excerpt API and fixtures. Outputs: buffered answer, citations, progress and loop stop.

Steps: implement FTS permission filters and registered tools; enforce persistent round/repetition/context/output/time counts; validate citations/conflicts; output assessment and final access recheck; A displays safe progress then checked answer, sources and trace link. Single-turn scope avoids unsafe conversation memory. Tests: AT06/AT07, S01/S02/S07/S08; malicious tool names/args, restricted citation and cancellation. Evidence: real allowed + blocked vertical slice by H+05; later imported corpus flow. Handoff: same functions callable by export/MCP, no workbench-specific security logic.

## T07 — review and policy/feed administration (A UI; Integrator enforcement)

Purpose: central controls and accountable human review. Requirements: R06,R11,R12. Prerequisites: T03/T05. Owned: A workbench administration; Integrator repository/routes/validators. Inputs: review/policy/feed schemas. Outputs: edit/rescan/approve, version CAS and authenticated feed push.

Steps: implement safe review details and immutable candidate edits; enforce audience/provenance and rescan; expose validated policy form and feed upload; implement scoped feed token/push sample; notify pending review in-app; test stale edits and next-request version. Tests: AT05/AT09, S06/S10, non-admin API denial and invalid/expired feed. Evidence: before/after version and decision traces. Handoff: public approved excerpt for T09; no soft bypass switch.

## T08 — audit and usage dashboards (Builder C; Integrator data routes)

Purpose: visible security and cost evidence for each role. Requirements: R13,R18,R20. Prerequisites: T01 contracts; real data T03. Owned: C audit feature; Integrator safe queries/routes. Inputs: audit/metrics contracts, accounting formulas, fixture traces. Outputs: own/admin views, trace stages, version/status/usage breakdown, safe CSV download.

Steps: build reusable feature views with shared UI; add own/admin role-aware routes; separate root/subcall counts, actual/unknown/estimated values; display review/blocked/loop/test counts; implement permitted-corpus context comparison; neutralize CSV formulas; add empty/loading/error states. Tests: AT10/AT15/AT16; cross-user projection, dashboard totals equal persisted records, N/A denominator and unknown usage. Evidence: screenshots of two roles and actual trace arithmetic. Handoff: judge walkthrough can inspect one request end to end without exposing original content.

## T09 — public summary/PDF (A UI; Integrator service)

Purpose: share approved facts safely. Requirements: R03,R14. Prerequisites: T06/T07. Owned: A export interaction; Integrator shared export service/routes. Inputs: public-summary API, public excerpts. Outputs: fresh checked PDF and authenticated expiring download.

Steps: create new public-audience run; generation and output scan; validate public citations; create fresh PDF; private Storage persistence; authorization on download and expiry/revocation; A renders download and decision. Tests: AT11/S03 and guessed IDs; independent PDF text/metadata/attachment inspection. Evidence: saved synthetic PDF, extracted text assertion and trace. Handoff: public_summary MCP calls same service.

## T10 — Claude Code MCP (Integrator)

Purpose: prove external integration. Requirements: R01,R15. Prerequisites: T06/T09, token store from T02. Owned: app MCP adapter, shared integration, scripts/docs. Inputs: same protected search/read/export services. Outputs: authenticated MCP tools and tested Claude setup.

Steps: implement official SDK transport with fixed tool schemas; scoped revocable public token; same actor/engine checks; run real Claude Code tool calls; test wrong scopes/revocation; document later ChatGPT/OAuth path without claiming it works. Tests: AT12/S12; inspect tool text/PDF and actor audit. Evidence: client version, redacted configuration, actual trace IDs. Handoff: judge can connect using prepared scope without app admin credentials.

## T11 — integrated evidence and fixes (all owners; Integrator coordinates)

Purpose: prove required outcomes. Requirements: R01–R20. Prerequisites: T02–T10. Owned fixes remain within existing slices; integrator owns cross-feature/DB/browser harness. Inputs: AT01–AT17, S01–S12. Outputs: runnable `test:security`, `test:hybrid`, benchmark, browser evidence and dated report.

Steps: validate positive/negative/effect tests; real RLS and budget race; live semantic held-out; actual hybrid allowed/blocked; inspect PDFs and leaked text; browser role workflows and failure states; deployed cold/warm timing; fix failures and rerun affected tests. Use project DB/security/browser skills. Tests: every acceptance row. Evidence: commands/exit codes, revisions, hashes, n/percentiles, failures and not-run items. Handoff: no critical exposure/budget/audit failure; missing required services fail loudly.

## T12 — release and rehearsal (Integrator + all four)

Purpose: stable judge demonstration within remaining time. Requirements: R19,R20 and all release gates. Prerequisite: T11. Owned: deployment/setup/runbook/evidence; feature owners fix only assigned issues. Inputs: passing reports and prepared accounts. Outputs: reviewed merged deployment, `verify:release`, run IDs and rehearsed pitch.

Steps: freeze features; coordinate shared data writes; verify production services/versions/active feed expiry; run release command; rehearse 3-minute runbook and account switch; collect measured screenshots; replace illustrative evidence only where measured; keep Mac/tunnel alive; assign operator and fallback explanation. Tests: AT16 and production hybrid smoke. Evidence: commit/deployment URL/time, operator, gate report, peer approval. Handoff: no green release claim if any required check missing.

## Ready-to-use agent task prompt

Use for **either Codex or Claude Code**, replacing bracketed fields. Multi-owner task groups require a separate prompt per owned slice.

> Implement [Txx, exact title], as [Integrator / Builder A / Builder B / Builder C], only in [owned paths]. Read AGENTS.md, docs/README.md, the task in docs/team/implementation-plan.md, its requirement IDs in docs/product/requirements.md, relevant technical-spec sections, and referenced contracts/tests. You are not alone in this codebase: do not revert other work or edit another owner's scope. Check prerequisites and current main before changes. Use fixed contracts; request shared changes through the integrator rather than creating parallel types. Implement the listed inputs/outputs and ordered steps. Run the task's acceptance tests and required repository checks. Record actual evidence, incomplete checks and handoff conditions in the PR. Do not mark planned commands or mocked tests as live results. Commit verified changes and prepare a PR; never push directly to main.

For T04 add: “Run actual Laya/Ollama capability checks before claiming readiness; preserve held-out separation.” For T08 add: “Do not invent numbers or label blocked attempts as confirmed breaches.” For T11 add: “Inspect stored/returned/provider/PDF text and effects; verdict-only tests are insufficient.”
