# Product requirements — AI Control Gateway

Status: accepted design baseline 1.0; implementation pending. Four people have a **single 19-hour delivery envelope including documentation preparation**. [Implementation plan](../team/implementation-plan.md) owns sequencing. [Architecture](architecture.md) owns topology; [policy](../contracts/policy.example.json) owns defaults.

## 1. Product in plain language

The gateway is a checkpoint between an AI application and company information, tools and model services. It checks who is asking, which information they may use, whether content contains suspicious instructions, and how much compute the operation can consume. Code makes the final decision using a central policy. Laya supplies additional risk signals.

Our small company-chat application makes these decisions visible. Users can ask about the fictional AsterCloud deal, import a file, inspect their activity and request a public PDF. An administrator can review uncertain extracts and inspect organisation activity. This is a demonstrable control layer, not a production banking platform or a replica of Goldman Sachs systems.

### Problems and outcomes

- Useful documents can also contain secrets, hostile instructions or conflicting numbers. Preserve safe, attributable facts without turning untrusted instructions into tool commands.
- Different users have different access. Access must survive direct API calls, guessed IDs and prompt manipulation.
- Repeated AI/tool calls waste time and compute. Stop them before further work, show measured usage, and distinguish estimates from bills.
- A blocked answer alone is hard to audit. Show policy version, reason, stage, usage and completion status without leaking the protected text.

## 2. Users and role matrix

One fictional organisation. Four prepared password accounts; no public signup. Every account has its own dashboard. An administrator additionally has organisation-wide reporting and administration. Roles and assigned deals are trusted server records.

| Capability                               | Administrator                        | Assigned deal analyst                           | General employee | External reviewer |
| ---------------------------------------- | ------------------------------------ | ----------------------------------------------- | ---------------- | ----------------- |
| Public approved excerpts/chat            | Yes                                  | Yes                                             | Yes              | Yes               |
| Ordinary internal approved excerpts/chat | Yes                                  | Yes                                             | Yes              | No                |
| Restricted deal excerpts/chat            | Only if assigned to deal             | Assigned deals only                             | No               | No                |
| Original/candidate security review       | Organisation review, audited purpose | No raw download                                 | No               | No                |
| Upload                                   | Any configured demo deal             | Assigned deal; restricted classification forced | No               | No                |
| Configure dataset connector              | Yes                                  | No                                              | No               | No                |
| Resolve review, change policy/feed       | Yes                                  | No                                              | No               | No                |
| Generate/download public summary         | Yes                                  | Yes                                             | Yes              | Yes               |
| Personal activity and usage              | Own                                  | Own                                             | Own              | Own               |
| Organisation activity/audit export       | Yes                                  | No                                              | No               | No                |

Administrator review is a distinct privileged operation. It does not confer automatic unrestricted chat access. External MCP tokens further restrict access to public-approved content, even if the issuing actor has broader rights.

## 3. End-to-end workflows

1. **Import:** authorised actor uploads CSV/text PDF or selects an allowlisted Supabase dataset batch. Raw data enters private quarantine. Bounded parsing, deterministic checks and complete Laya assessment classify units; blocked/reviewed units remain private candidates, never approved text. The user sees the outcome and reason. No raw input is directly returned.
2. **Chat:** authenticated user asks a question. Gateway validates scope and budgets, resolves an explicitly named permitted file before content ranking, and projects safe facts from permitted approved or private candidate units at request time. Credentials, personal details and embedded instructions are withheld before answer generation. Citations identify exact sources and versions; the complete answer is checked before release. Restricted matches are excluded unless the trusted actor is assigned to that deal.
3. **Review:** administrator reads a candidate, edits only the proposed extract, chooses an allowed audience and supplies a reason. The edited version is scanned again. Approval publishes only that version; raw originals remain private. Unresolved findings cannot be clicked away.
4. **Export:** request a fresh summary using only public-approved excerpts. Generate and check the text, then produce a new PDF containing the approved text and citations. Original PDFs, analyst answers and hidden original text are not attached.
5. **Investigate and change controls:** a personal dashboard shows own sanitised traces. Administrator sees organisation aggregates and review cases, can update a validated policy/feed version, and demonstrates its effect on the next operation.

## 4. Stable requirements and success conditions

| ID  | Requirement                          | Acceptance condition                                                                                                                     |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| R01 | Generic gateway and thin adapters    | Web and MCP use the same engine; no feature-to-feature imports or bypass paths.                                                          |
| R02 | Trusted identity and roles           | Four prepared accounts; forged roles, missing identity and cross-org IDs denied.                                                         |
| R03 | Data access and classification       | Role/deal filters precede retrieval; status separate from classification; direct browser reads denied.                                   |
| R04 | Bounded imports and connector        | Only allowlisted local dataset, CSV and text PDF; limits enforced before publication; private originals.                                 |
| R05 | Hybrid assessment                    | Deterministic controls plus live Laya on permitted content; all accepted text covered; failures cannot approve.                          |
| R06 | Safe extraction and human review     | Exact edited version/audience/reason recorded; no original release or silent declassification.                                           |
| R07 | Controlled chat and tools            | Registered search/read tools only; each invocation authorised/audited; checked output before display.                                    |
| R08 | Source attribution and conflicts     | Answer cites versions, dates, periods and units; comparable conflicting figures remain explicit.                                         |
| R09 | Loop and resource limits             | Model/tool/context/output/time/repetition ceilings stop further effects; cancellation accounted honestly.                                |
| R10 | Atomic budgets and accounting        | Concurrent reservations cannot overspend; actual vs estimated vs unresolved usage distinguished; local and commercial-unit paths tested. |
| R11 | Central versioned policy             | Validated admin update with optimistic version check; next decision uses active version; hard invariants cannot be disabled.             |
| R12 | Externally managed signatures        | Authenticated bounded feed push updates next decision; stale/invalid feed cannot silently clear checks.                                  |
| R13 | Durable audit and dashboards         | Audit before effects, completion/incomplete records, personal/admin reporting, protected text excluded.                                  |
| R14 | Public sanitized PDF                 | Built from public-approved material; no forbidden strings in response, extracted PDF text, metadata or attachments.                      |
| R15 | Verified MCP integration             | Claude Code search/read/public-summary tools with scoped token; no raw Supabase or model access.                                         |
| R16 | Fail-closed operations               | Missing policy, required semantics or durable state prevents operation; service errors distinct from policy verdicts.                    |
| R17 | Automated positive/negative evidence | Deterministic, DB/RLS, browser and live semantic suites; assertions check effects and exposure.                                          |
| R18 | Honest performance and savings       | Measured tokens/latency and sample sizes; permitted baseline only; money explicitly illustrative.                                        |
| R19 | Deployable judge demonstration       | Prepared accounts, live Mac services, verified production walkthrough and recovery plan.                                                 |
| R20 | English accessible interface         | Shared UI, readable states, keyboard operation, responsive screens; implementation/presentation claims labelled accurately.              |

## 5. Scope and non-goals

**Required for this delivery:** all R01–R20 within this narrow reference workflow. Real authentication, policy, Laya, Ollama, persistence, budgets and tests remain required if presentation polish is cut.

**Deferred:** OCR/image PDFs, PPTX, Parquet, spreadsheets beyond CSV, arbitrary SQL/database connectors, email sending/outbox, live ChatGPT OAuth, paid generation providers, vector search/embeddings, fine-tuning, autonomous write tools, real financial data, enterprise SSO, multi-tenant onboarding and high-availability hosting. A commercial adapter simulator tests budget units; it is not a real paid-provider integration.

## 6. Quality and completion

Security acceptance checks deterministic exposure rules exactly. Live Laya evaluation reports false positives and misses separately on a frozen held-out set; it cannot establish production-grade security. No promised 100–200 ms gateway latency or savings percentage. Record cold/warm measurements before stating results. Work is complete only after acceptance gates, CI, peer review, preview and production walkthroughs.

Threats addressed include direct/indirect instruction manipulation, unauthorized disclosure, tool misuse and unbounded consumption. The demo does not establish full malware detection, universal prompt-injection resistance or complete OWASP coverage.

## 7. Challenge traceability

Official brief: HackYeah / Goldman Sachs “AI Control Layer”, supplied to the team on 3 October 2026; [event task page](https://hackyeah.pl/tasks-prizes). The user-supplied challenge text requires centralized security/privacy/resource configuration, hybrid non-AI and AI controls, reporting, local/commercial budgets, external attack signatures and automated allowed/blocked/redacted tests.

| Challenge area                         | Requirement IDs    | Evidence                                             |
| -------------------------------------- | ------------------ | ---------------------------------------------------- |
| Lightweight gateway; flexibility       | R01, R15, R19      | Architecture, HTTP/MCP contracts, live client        |
| Hybrid defense; privacy/security (30%) | R02–R09, R16       | Real Laya, role/exposure tests, review               |
| Architecture/performance (20%)         | R01, R10, R18      | Boundary diagram, atomic accounting, timing report   |
| Security/management reporting (20%)    | R13, R18, R20      | Personal/admin traces, usage, audit export           |
| Automated tests (15%)                  | R17                | Positive, negative, configuration and failure suites |
| Practicality/scalability (15%)         | R11, R12, R15, R19 | Central policy/feed, setup, replaceable adapters     |

## 8. Team

| Person  | Assigned role         | Implementation ownership                                                          |
| ------- | --------------------- | --------------------------------------------------------------------------------- |
| Bartosz | Integrator            | Shared/platform/database/routes/dependencies/deployment/MCP and integration tests |
| Julian  | Builder A — workbench | `src/features/workbench/**`                                                       |
| Maciej  | Builder B — detection | `src/features/detection/**`                                                       |
| Nikodem | Builder C — audit     | `src/features/audit/**`                                                           |

The [developer handoffs](../team/developer-handoffs.md) provide each person's copy-paste prompt, immediate preparation and explicit start gates. Exact task scopes remain in the [implementation plan](../team/implementation-plan.md). GitHub usernames are operational assignments to record in the PR; do not infer account handles from these names or invent CODEOWNERS entries.
