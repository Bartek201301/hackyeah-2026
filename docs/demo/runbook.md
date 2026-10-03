# Judge runbook

Target walkthrough, not proof the app already runs. Use [scenarios](scenarios.md) for exact facts and [acceptance](../testing/acceptance.md) for gates. Prepared accounts are handed over privately; never project credentials or access tokens.

## Before judges arrive (T12)

- Record deployment URL, Git commit, original delivery deadline, operator and actual remaining time.
- Run **introduced T12** `npm run verify:release`. Required services missing must fail, not skip.
- Check authenticated bridge readiness, pinned Laya revision, Ollama digest, Mac power/awake/Wi-Fi, tunnel stability and deployed connectivity.
- Check Supabase Auth/RLS, active policy/feed versions and feed expiry. Confirm original files are private and external account cannot read raw/excerpts directly.
- Prepare four separate browser profiles/sessions, labelled Admin, Analyst, Employee, Reviewer. Never rely on a client-side role selector to change permissions.
- Ingest seed sources via the real pipeline; keep MIX-01 and REV-01 ready for upload/review. Preserve one allowed and one blocked actual trace with measured usage.
- Freeze shared-database test writes. Do not reset demo data during judging. Rehearse normal, uncertain and service-down behavior honestly.

## Three-minute live demonstration

| Time      | Action                                | Explain / show                                                                                                                                      |
| --------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:25 | Analyst runs S01                      | “The gateway checks identity, data, tools and budget.” Cite permitted restricted forecast; show trace link.                                         |
| 0:25–0:45 | Switch to Employee, same question     | Restricted forecast/bid absent; public/internal conflict still useful. This is a different authenticated session.                                   |
| 0:45–1:15 | Import MIX-01 and inspect outcome     | Safe candidate or honest review; malicious/personal/secret content withheld; useful remainder stays restricted.                                     |
| 1:15–1:40 | Admin resolves prepared REV-01        | Exact edited extract and audience, reason, rescan and version; no original release.                                                                 |
| 1:40–2:05 | Run prepared S08 loop case            | Limit stops actual further tool calls; show blocked count and retained accounting. Test fixture driver is labelled; no hardcoded production prompt. |
| 2:05–2:35 | Reviewer creates S03 summary/PDF      | Only public sources; fresh document. No private analyst context reused.                                                                             |
| 2:35–3:00 | Admin dashboard and Claude Code trace | Security decisions beside actual usage; estimates labelled. Show preverified MCP tool trace and change-of-policy/feed evidence.                     |

If generation is slow, use already completed actual traces with timestamps while one live request runs. Say which is replayed evidence; do not fake live progress. Keep full S01–S12 results available for follow-up, including S04 cross-deal, S07 conflicting numbers, S09 budget race, S10 policy/feed update, S11 outage and S12 direct API checks.

## Evidence pack

Dated report contains commit/deployment, policy/feed/model/protocol versions, command exit codes, test counts, semantic FP/misses with denominators, timing n/cold/warm, representative trace IDs, safe screenshots and a generated public PDF with independent text extraction. No passwords, raw malicious originals, tokens or real personal data. Pitch placeholders remain unmeasured until replaced from this report.

## Troubleshooting during demo

| Symptom                    | Response                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Laya or bridge offline     | Show fail-closed message; restore service, authenticated real assessment, then retry existing idempotency key. Never substitute a mock. |
| Model timeout              | Show incomplete/reserved usage; query call ledger before retry.                                                                         |
| Wrong role view            | Log out and use correct prepared session; inspect trusted membership, not browser role fields.                                          |
| Pending review             | Admin reviews exact candidate; don't bypass scan for the demo.                                                                          |
| Feed expired               | Authorized validated new version, then repeat decision. No silent empty feed.                                                           |
| Database/audit unavailable | Stop protected operations; explain trace may be unavailable. Preserve existing evidence and restore service.                            |
| Question outside corpus    | State evidence is insufficient; no fabricated facts.                                                                                    |

## Operator handoff

Assign one of the four people to Mac/tunnel health and one to judging/login support. Record actual names privately at rehearsal. Keep services available for the agreed judging period. Prepared scoped MCP credentials expire/revoke after testing. Future ChatGPT connection remains described as planned integration.
