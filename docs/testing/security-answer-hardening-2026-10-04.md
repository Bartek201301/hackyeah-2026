# Request-time source and answer hardening: implementation evidence

**Scope:** branch `codex/security-answer-hardening`. This report covers the local implementation only. The two additive migrations have not been applied to the shared Supabase project.

## Implemented path

The gateway resolves explicit source names and selected source IDs using actor, organisation, role and deal membership before reading excerpts. A duplicate permitted name returns a typed selection result; an inaccessible or missing name has the same not-found response. Candidate excerpts from blocked or review imports stay private in storage. The request-time projection removes recognized credentials, contact details, instruction-shaped clauses and unsafe metadata, then passes only bounded, cited segments to generation. Chat, direct search/read and public export share that projection. A stored chat answer is rechecked against current excerpt access before replay.

For a multi-part answer, the gateway appends a missing cited bid or forecast found in the permitted context before output screening, or states that a citable figure was unavailable. Monetary claims without a supporting cited source are held for review. Originals are unchanged.

## Local evidence

| Check                              | Result                                                                                                                                                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                    | Passed: formatting, types, lint, module rules, 24 tooling tests, 984 Vitest tests, production build. Localhost bridge tests required approved sandbox escalation.                                                                                                 |
| PGlite migration tests             | Passed: duplicate and normalized names, cross-deal invisibility, candidate search, public audience denial, direct `anon` RPC denial, blocked import candidate retention and refusal of approved text. These are SQL behavior tests, not a real Supabase RLS test. |
| Gateway tests                      | Passed: mixed safe fact plus secret/instruction, same-sentence secret, metadata screening, source selection, analyst forecast plus bid, unsupported amount, replay revocation and public export. Provider inputs are asserted free of test canaries.              |
| Live bounded Laya/Qwen smoke       | 6 passed; uses the configured local models and active policy evidence. It does not exercise the new database RPCs.                                                                                                                                                |
| Live classifier development corpus | 28/31 benign allowed (3/31 false positives); 0/15 attacks allowed (0/15 attack-pass rate). These are development cases, not fresh held-out release evidence.                                                                                                      |

The three remaining benign refusals are `regression-held_out-hard_benign-04` (Qwen verifier marks resource abuse), `security_quote` (Laya manipulation score 0.7149), and `output_training` (0.7199). The active manipulation block threshold and verification ceiling are both 0.70. No threshold or verifier security control was broadened in this branch.

## Remaining release gates

Integrator and database owner review both migrations and the source-name aliases, then apply them once to the shared Supabase project and record the result in `supabase/APPLIED.md`. After that, run real role/JWT RLS tests, an import-to-chat rehearsal with the sample database, live Laya/Ollama hybrid tests, browser checks, and a 20-warm-run gateway p95 comparison. The 20% gateway-overhead target is **unmeasured**, not passed. MCP remains a separate adapter task; it must call the same gateway search/read path before any MCP result is served. Peer review, preview walkthrough and production rehearsal remain required.

Pattern and fact extraction are conservative but cannot guarantee detection of every secret or prompt injection. Keep uncertain candidate segments private and expand canary/attack evaluation against representative sources before release.
