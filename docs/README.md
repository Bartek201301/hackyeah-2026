# Documentation map

**Specification baseline: 1.0, 3 October 2026. Language: English.** The accepted user plan is the design authority. This package specifies future implementation against the existing starter. Task completion and runtime evidence belong in PRs and release evidence, not invented status badges in specifications.

## One source for each question

| Question                                         | Authoritative document                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Why, for whom, scope and requirement IDs         | [PRD](product/requirements.md)                                                                        |
| Boundaries, deployment and ownership             | [Architecture](product/architecture.md)                                                               |
| Processing, enforcement and failure algorithms   | [Technical spec](product/technical-spec.md)                                                           |
| Public HTTP field names and shapes               | [OpenAPI](contracts/openapi.json)                                                                     |
| API semantics, adapter handoffs and example map  | [Protocols](contracts/protocols.md)                                                                   |
| Tables, constraints and RLS                      | [Data model](contracts/data-model.md)                                                                 |
| Policy shape / initial defaults                  | [Policy schema](contracts/policy.schema.json) / [initial policy](contracts/policy.example.json)       |
| Feed shape / sample indicators                   | [Feed schema](contracts/threat-feed.schema.json) / [feed example](contracts/threat-feed.example.json) |
| Fixture facts and expected exposure              | [Scenarios](demo/scenarios.md)                                                                        |
| Required verification                            | [Acceptance](testing/acceptance.md)                                                                   |
| Who builds what and when                         | [Implementation plan](team/implementation-plan.md)                                                    |
| Commands, accounts and operational configuration | [Setup](team/setup.md)                                                                                |
| MCP and restricted Claude Code release procedure | [MCP guard runbook](team/mcp-guard-runbook.md)                                                        |
| Rationale / externally supported claims          | [Decisions](team/decisions.md) / [research](product/research-decisions.md)                            |
| Product screens                                  | [Design contract](../DESIGN.md)                                                                       |
| Demo / pitch                                     | [Runbook](demo/runbook.md), [pitch](pitch/pitch.md), [slides](pitch/presentation.html)                |

The policy example owns default values. Schema maxima are hard safety ceilings; policy may lower limits. Never copy those defaults into feature logic. OpenAPI owns HTTP fields. Data-model definitions own stored fields; internal handoffs are in protocols. Examples demonstrate schemas, not additional API fields. Policy business validation is required in addition to JSON Schema.

If two active documents conflict, stop the dependent change, record the discrepancy in the PR, and have the integrator correct the authoritative file plus affected references. Do not implement a permissive compromise. New scope requires a PRD decision; breaking contracts require all affected owners to coordinate. Security invariants in AGENTS apply everywhere.

For the named four-person assignment, start with [developer handoffs and copy-paste prompts](team/developer-handoffs.md).

## Reading paths

- **Founder/judges:** PRD summary → scenarios → pitch → runbook.
- **Integrator:** AGENTS → PRD → architecture → contracts → technical spec → tasks → setup → acceptance.
- **Builder A:** AGENTS → PRD roles/workflows → DESIGN → protocols/OpenAPI → scenarios → assigned tasks → browser acceptance.
- **Builder B:** AGENTS → technical spec import/semantic sections → protocols/policy → scenarios → semantic evaluation → assigned tasks.
- **Builder C:** AGENTS → PRD reporting → accounting/audit spec → data model/protocols → scenarios → dashboard task and tests.
- **Fresh Codex/Claude session:** follow the ready-to-use prompt in the implementation plan; never rely on earlier chat.

Run available T00 documentation checks with `node scripts/validate-docs.mjs`. See the [documentation validation report](testing/documentation-validation.md) for completed checks and unresolved gates.

## Status and historical material

Active files above are **accepted design, implementation pending**. Machine-readable contracts and the HTML presentation exist now. Runtime scripts marked “introduced by Txx” do not exist yet. Credentials, model digests and measured results are release evidence to collect, not missing product decisions.

[Archive](archive/README.md) retains replaced proposals. [Original Laya report](reference/laya-report-original.md), `reports/`, `research_notes/` and vendored `docs/ai/ecc/upstream/` are supporting evidence, not overriding instructions. The Laya report is preserved in its original language. Existing agent-tool installation guides remain auxiliary; use them only for a task that requires those tools.
