# Developer assignments and start prompts

Named execution guide for the accepted [implementation plan](implementation-plan.md). The [PRD team table](../product/requirements.md#8-team) owns the person-to-role assignment. Task definitions, acceptance criteria and contracts remain in their existing authoritative files. No application work is completed by this assignment document.

## 1. Who owns what

| Person  | Role                  | Main delivery                                                                                      | Editable implementation scope                                                                   |
| ------- | --------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Bartosz | Integrator            | Shared foundation, authentication/database, gateway/budgets, APIs, deployment, MCP and integration | `src/shared/**`, `src/app/**`, `supabase/**`, scripts, dependencies/lockfiles, config, docs, CI |
| Julian  | Builder A — workbench | Chat, source/upload, review, policy/feed and public-export screens                                 | `src/features/workbench/**`                                                                     |
| Maciej  | Builder B — detection | Laya/Ollama adapters, model bridge, parsers, findings and semantic evaluation                      | `src/features/detection/**`                                                                     |
| Nikodem | Builder C — audit     | Personal/admin dashboard, trace details, security/usage reporting and audit-download UI            | `src/features/audit/**`                                                                         |

These are work assignments, not assumptions about experience. Each builder owns tests inside their feature too. Only Bartosz changes shared contracts, routes, database schema or dependency manifests. Maciej supplies dependency/version requirements; Bartosz commits the lockfiles, including Python dependency manifests. Runtime bridge source stays in Maciej's directory.

Julian provides access to the available Mac and coordinates its availability; Maciej owns the model-service implementation and readiness evidence. Do not assume Maciej already has remote access. Pair on the Mac or arrange a private authorised connection; never commit credentials or expose raw model ports to make collaboration easier.

## 2. Start now, then pass explicit gates

**All four can start now, but not by building four unrelated applications.** Preparation is independent; feature implementation depends on a small merged foundation. The original deadline and elapsed preparation time still apply. These gates do not start a new 19-hour clock.

### G0 — accepted specification available on main

Bartosz coordinates peer review and merge of the documentation PR using the normal workflow. A peer reviews Bartosz's own changes; he does not self-approve. Confirm the latest commit's checks, not an earlier green revision. Everyone then updates their own checkout from main. Until merge, read the documentation branch for preparation; avoid starting dependent implementation from an obsolete main.

**Each person can do immediately:**

- **Bartosz:** review contracts and repository status, collect required dependency/environment names, prepare T01 foundation scope and ask one teammate to review it. Record the actual deadline in the PR.
- **Julian:** read DESIGN, role matrix and S01/S02/S05/S06; sketch the chat/import/review states and confirm Mac availability. Review the documentation/foundation PR when ready.
- **Maciej:** inspect existing local model availability with the Mac operator, compare required inputs/outputs and prepare a dependency list and live readiness procedure. Do not change shared dependencies or publish a tunnel before the agreed secure setup is ready.
- **Nikodem:** map each dashboard field to the existing contracts/formulas; prepare labelled static test cases for actual, estimated, unknown and denied states. Review audit/budget interfaces for Bartosz.

### G1 — shared coding foundation merged (first part of T01)

Bartosz delivers one small foundation PR containing:

1. Schema-derived shared types/validators, the typed API client and the DetectionPort/GenerationPort interfaces.
2. The three feature directories and their public `index.ts` entry points; thin app route/composition placeholders.
3. Necessary pinned dependencies, test runner configuration and agreed model environment manifest.
4. A compileable seam for the gateway/repository; unavailable operations return explicit unavailable/not-implemented states, never fabricated ALLOW results.
5. A short PR handoff naming the merge SHA, exported symbols, supported client calls and scripts that actually exist.

This is the **implementation contract handoff**, not completion of all T01 live capability evidence. Maciej's independent readiness work can run while Bartosz prepares it. After peer approval, green checks and merge, all three builders update main and start owned feature code. Do not wait for every backend endpoint to exist before building UI against the frozen types. Development-only fixtures may exercise views/tests; keep them out of the judged runtime and label them as fixtures.

### G2 — real vertical slice works (T02/T03 + first T04/T06)

Bartosz provides actual sessions/memberships, initial reviewed/applied schema/RLS, policy/budget/audit primitives and minimal chat/run routes. Maciej supplies genuine Laya/Ollama adapters. Julian provides minimal question → progress → checked-result UI. Nikodem provides a minimal trace view as soon as the safe audit API is available.

**Exit:** one real allowed request and one blocked request have verified identity, policy, appropriate hybrid assessment, persistent decision/usage records and a visible result. A normal allowed generation uses real Ollama; denied actions need not waste a generation call. Fake fixtures cannot satisfy G2. This is the first demonstration checkpoint; visual polish waits.

### G3 — parallel functional coverage

- Julian: sources/import UI → review and policy/feed UI → public-summary/download UI (T05/T07/T09 UI slices).
- Maciej: complete bounded parsing/coverage → mixed-file extraction support → held-out semantic/failure tests (T04/T05 detection slices).
- Nikodem: own/admin dashboards → trace stages → metrics and audit-export interaction (T08).
- Bartosz: import/publication and retrieval services → review/policy/feed endpoints → export service → MCP adapter, while integrating each ready slice.

**Proceed screen by screen when its endpoint handoff is available.** A blocked endpoint does not block unrelated owned UI tests or parser/evaluation work. Use the handoff table below. All shared security decisions remain in Bartosz's gateway.

### G4 — release candidate

All required workflows are connected to real services: roles, imports, review, policy/feed updates, sanitized PDF, dashboards and Claude Code MCP. Every feature PR includes its tests and actual evidence. Bartosz merges one PR at a time; subsequent branches merge current main and rerun checks. Freeze new features when the final two-hour release window starts, even if optional polish remains.

### G5 — verified and rehearsed release

T11 acceptance suites and T12 production rehearsal pass. Each person fixes their owned failures. Bartosz handles cross-feature, database and deployment failures. Julian leads the judge walkthrough; Maciej watches model services; Nikodem checks displayed evidence against recorded results. Do not call a failed/missing required gate complete.

## 3. Exact implementation order by person

| Person  | First delivery after G1                                       | Next                                                                                                   | Last before release                                                     |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Bartosz | T02 auth/schema + smallest T03 engine/API sufficient for G2   | Complete T03 limits/accounting; backend T05/T06; backend T07/T09; T10 MCP                              | T11 integration harness and fixes; T12 deployment/merge/rehearsal       |
| Julian  | Minimal T06 chat/progress/checked answer/citations            | T05 import/source UI; T07 review/policy/feed UI; T09 export UI                                         | Workbench browser cases and judge script (T11/T12)                      |
| Maciej  | T04 real model readiness and adapter exports                  | T04 parsers/findings/coverage; T05 extraction; semantic development and held-out evaluation            | Outage/truncation/usage evidence, runtime reliability (T11/T12)         |
| Nikodem | T08 minimal safe trace view for G2, with empty/unknown states | Personal dashboard; admin aggregates; stage details; honest cost/context estimates; export interaction | Scope/metrics/browser checks and screenshots from actual runs (T11/T12) |

T05, T06, T07 and T09 are **split task groups**. Julian implements screens; Bartosz implements protected backend effects; Maciej supplies parsing/detection where needed. Nikodem's audit CSV button calls Bartosz's authorised export route. No builder implements a second policy engine, private API route, direct raw Supabase access or a second shared type definition.

## 4. What unblocks whom

| Producer → consumer                 | Required handoff                                                                                                        | Consumer may then connect         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Bartosz → all                       | G1 merge SHA, ports/types, feature entry points, dependency lock and available commands                                 | Owned code and isolated tests     |
| Maciej → Bartosz                    | Server-only factory exports for DetectionPort/GenerationPort, actual revisions, health procedure, failure/usage mapping | Live gateway provider calls       |
| Bartosz → Julian                    | Prepared account access privately; chat/run/excerpt routes and safe response examples                                   | Real chat/progress/citations      |
| Bartosz + Maciej → Julian           | Import/source routes, parser adapter, terminal/review states                                                            | File/dataset workflow             |
| Bartosz → Julian                    | Review/version-CAS, policy/feed and export/download routes                                                              | Administration and sharing        |
| Bartosz → Nikodem                   | `/audit`, trace details, `/metrics`, audit CSV route and safe actor-scoped payloads                                     | Real dashboard and downloads      |
| Julian + Maciej + Nikodem → Bartosz | Feature PRs with public exports, tests, required shared changes and reproducible evidence                               | Composition and integration merge |

Use this handoff message in the PR (send manually; no automatic messages to teammates):

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

## 5. Copy-paste prompts

Paste the relevant block into that developer's Codex or Claude Code session opened on this repository. Use a separate checkout/worktree per concurrent session. These prompts authorize the named owned implementation, not another person's files. GitHub usernames still need to be recorded by the humans; names below are not account handles.

### Bartosz — Integrator

```text
You are helping Bartosz, the Integrator for AI Control Gateway. Start by reading AGENTS.md, docs/README.md, docs/team/developer-handoffs.md, docs/team/implementation-plan.md, docs/product/requirements.md, docs/product/architecture.md, docs/product/technical-spec.md and docs/contracts/.

First verify repository/PR state. The documentation must be peer-reviewed and merged before dependent implementation. Work in an isolated checkout on a short codex/ branch from current origin/main. Preserve other people's changes. Do not merge without the required peer approval and green checks. Record the real submission deadline; do not restart the original 19-hour clock.

Your first implementation deliverable is G1: shared schema types/validators, typed client, DetectionPort/GenerationPort, feature entry points for workbench/detection/audit, required pinned dependencies/test runners and thin composition seams. Merge this small foundation after review so Julian, Maciej and Nikodem can code. Publish its exact merge SHA and exported interfaces. Complete T01 live capability evidence with Maciej separately; do not make all builders wait for the whole backend.

Next implement T02 authentication, prepared accounts, additive reviewed migrations/RLS/private storage; then the smallest real T03/T06 gateway/chat path needed for G2. Continue with persistent atomic budgets, intent/completion audit, idempotency/cancellation, import/retrieval, review/policy/feed, public PDF service, T10 MCP, T11 integration and T12 release in the documented order.

You own shared/app/supabase/scripts/dependencies/config/docs/CI/deployment. Julian owns workbench, Maciej detection, Nikodem audit. Compose their public exports; do not edit their feature internals concurrently. You own HTTP routes and backend authorization for their screens. Only you commit dependency manifests and execute reviewed migrations. Never reset the shared database without team coordination.

Keep the core invariants: trusted identity; deterministic enforcement; real Laya for the demo; bounded calls and complete scans; private originals; public-only export context; audit before effects; atomic reservations and honest unknown usage; fail closed. Read installed Next.js documentation before code.

Run each task's acceptance tests and repository checks. Report actual evidence and missing gates in each PR. Give a clear handoff when G1 and each endpoint group is ready. Do not claim a mocked UI, green build or health endpoint proves live security. Start with G0 verification and G1 now; do not implement the whole frontend yourself.
```

### Julian — Builder A / workbench

```text
You are helping Julian, Builder A for AI Control Gateway. Own only src/features/workbench/** and its feature tests. Read AGENTS.md, docs/README.md, docs/team/developer-handoffs.md, the T05/T06/T07/T09 UI slices in docs/team/implementation-plan.md, docs/product/requirements.md, DESIGN.md, docs/contracts/openapi.json, docs/contracts/protocols.md, docs/demo/scenarios.md and docs/testing/acceptance.md.

Check G0/G1 first: accepted docs and Bartosz's shared types/client plus workbench/index.ts must be merged. Before G1, prepare the screen/state plan and review contracts; do not invent shared types or create app routes. After G1, update your isolated checkout from main and start a short codex/ branch for your owned slice. You are not alone; never revert others' work.

Build in this order: (1) minimal T06 question input, run progress, buffered checked answer, citations and trace link; (2) T05 allowlisted source/CSV/text-PDF upload screens and import outcomes; (3) T07 administrator review with exact extract version/audience/reason and conflict/rescan errors, then policy/feed forms; (4) T09 public summary and authenticated PDF-download interaction. Use existing shared UI and English copy with loading, empty, error, denied and incomplete states.

Connect through Bartosz's typed gateway client. He owns sessions, routes, database, permissions, security decisions and PDF generation. UI role visibility is not authorization. No direct raw/excerpt Supabase reads, browser model credentials or unchecked streaming output. Clearly labelled fixtures may be used only in development/tests until endpoints exist; never substitute fake success in the judged app.

Test your slices of AT03/AT05/AT06/AT07/AT09/AT11/AT16, particularly analyst versus employee exposure, version conflicts and safe export. Use the project browser-QA skill. Do not modify shared components, dependencies, app routes or database files; send Bartosz a precise interface/change request and continue independent work.

Deliver small feature PRs with public index exports, checks actually run, screenshots and a handoff listing available/unavailable endpoints. Continue to the next owned slice when its prerequisites are ready. Stop dependent work at an unmet gate, not all useful preparation. Your first goal is the real minimal chat for G2, not visual polish across every screen.
```

### Maciej — Builder B / detection and model services

```text
You are helping Maciej, Builder B for AI Control Gateway. Own only src/features/detection/**, including parser/adapter/runtime bridge source and feature tests. Read AGENTS.md, docs/README.md, docs/team/developer-handoffs.md, T04 and your T05 slice in docs/team/implementation-plan.md, docs/product/technical-spec.md, docs/contracts/protocols.md, docs/contracts/semantic-protocol.md, policy schema/example, docs/team/setup.md and docs/testing/acceptance.md.

Start with independent capability preparation and coordinate access to the available Mac with Julian. Do not assume remote access exists. Bartosz owns dependency manifests/locks and deployment configuration; give him exact dependency/version requirements. Before G1, inspect existing services and prepare readiness evidence without editing shared contracts. After G1, update your isolated checkout from main and implement against its fixed DetectionPort/GenerationPort interfaces on a short codex/ branch.

Priority order: (1) real qwen3:8b generation with thinking disabled and bounded output, plus laya[serve]==0.3.24 typed-decisions assessment; record actual model digest/revision; (2) authenticated fixed-route bridge, call-ID ledger, usage reporting and cancellation/unknown states; (3) bounded CSV/text-PDF parsing with provenance, deterministic findings and complete tokenizer-window assessment; (4) mixed-file safe-unit support without declassification; (5) development-only threshold tuning and separate frozen held-out evaluation.

Return named risk scores and findings; deterministic gateway code makes enforcement decisions. Never manufacture scores, silently truncate accepted text, expose raw local model ports, accept arbitrary URLs/tools or return automatic approval on timeout/incomplete coverage. Record genuine token/timing data; timeout does not prove zero consumption. Export factories only through the feature index for Bartosz to inject.

Cover AT03/AT04/AT14 and provider failure cases in AT13. Preserve held-out separation and report false positives/missed attacks with sample counts. Do not edit the canonical evaluation dataset or contracts unilaterally; propose necessary corrections for Bartosz to review/version before calibration. Do not implement database authorization, budget RPCs or Next app routes.

First handoff: real adapter exports, safe environment/health procedure, runtime revisions and unavailable capabilities so Bartosz can finish G2. Later handoffs: parsers/coverage and evaluation report. Include actual commands/results in small PRs; no secret values. If a shared dependency is missing, request it precisely and continue independent work rather than building a duplicate interface.
```

### Nikodem — Builder C / dashboards and audit

```text
You are helping Nikodem, Builder C for AI Control Gateway. Own only src/features/audit/** and feature tests. Read AGENTS.md, docs/README.md, docs/team/developer-handoffs.md, T08 in docs/team/implementation-plan.md, docs/product/requirements.md, DESIGN.md, accounting/audit sections of docs/product/technical-spec.md, docs/contracts/openapi.json, protocols/data-model, docs/demo/scenarios.md and docs/testing/acceptance.md.

Check G0/G1 first. Before the shared foundation is merged, map each visual to its authoritative API field and prepare clearly labelled test-state examples. After Bartosz merges types/client and audit/index.ts, update your isolated checkout from main and start a short codex/ branch. You are not alone in the codebase; do not revert or edit others' work.

Build in this order: (1) minimal safe trace details and empty/loading/unknown/error states for G2; (2) each user's personal activity/security/usage dashboard; (3) administrator organisation aggregates and expandable stages; (4) context-reduction and illustrative commercial-equivalent displays; (5) authorised audit-CSV download interaction. Use shared UI and English copy; give security and resource controls equal visibility.

Consume Bartosz's typed /audit, trace, /metrics and audit-export routes. He owns scoped queries, aggregation, accounting and CSV authorization/sanitization. Do not query private source/audit tables directly or calculate organisation totals from one paginated page. Ask for missing API fields rather than adding a parallel data model.

Display actual generation usage separately from Laya usage/latency, estimates and unresolved reservations. Unknown is not zero. Blocked attempts are not confirmed breaches. Context reduction uses only permitted source material. Commercial equivalents are illustrative, not invoices. Development fixtures cannot become live dashboard evidence.

Cover AT10/AT15/AT16: own-user versus admin scope, no denied text/secret leakage, root versus subcall counts, N/A/unknown states, values matching persisted evidence and responsive keyboard use. Use the browser-QA skill; repository checks and screenshots belong in your PR.

First handoff is the minimal trace view. Then add dashboard sections as real endpoint groups arrive. Expose the feature through index.ts and send Bartosz precise shared-change requests. Stay within audit; do not implement authentication, gateway decisions, migrations, app routes, shared components or dependencies.
```
