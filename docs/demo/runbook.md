# Judge runbook

InterLock is the gateway; the fictional AsterCloud company chat is its reference app. This runbook lists only what this build does live. Use [scenarios](scenarios.md) for exact facts, [acceptance](../testing/acceptance.md) for gates and [release evidence](../testing/release-evidence.md) for measured results and trace IDs. Prepared accounts are handed over privately; never project credentials or access tokens.

## Before judges arrive (T12)

- Record deployment URL, Git commit, original delivery deadline, operator and actual remaining time.
- Run `npm run verify:release` on the judged runtime. It checks env names, Supabase (`health_check`), the control head and feed expiry, authenticated model readiness at the pinned Laya revision and Qwen digest, and that the app answers. A missing service fails it; nothing is skipped. It is a preflight, not the test suite.
- Check Mac power/awake/Wi-Fi and tunnel stability, then ask one live analyst question on the judged runtime.
- Prepare four separate browser profiles/sessions, labelled Admin, Analyst, Employee, Reviewer. Never rely on a client-side role selector to change permissions.
- The corpus is already imported through the real pipeline. Never re-import it. Keep MIX-01 ready for upload.
- Freeze shared-database test writes. Do not reset demo data during judging.

### Runtime: path A (judged) and path B (fallback)

- **Path A:** `https://hackyeah-2026.vercel.app`. Laya and Qwen run on Julian's Mac behind the authenticated bridge (Cloudflare quick tunnel). Run `verify:release` with `MODEL_BRIDGE_URL` and `MODEL_BRIDGE_TOKEN` set to the same values as Vercel Production. A tunnel restart changes the hostname: update `MODEL_BRIDGE_URL` in Vercel Production and Preview, redeploy (~2 min) and ask one analyst question. Until then every model path fails closed with 503 (see `docs/team/setup.md`, "Bridge runtime").
- **Path B:** Julian's Mac runs a production build of the release commit (`npm run build && npm start`, port 3000) against loopback Laya and Ollama and the same Supabase. Check it with `RELEASE_URL=http://localhost:3000 npm run verify:release` on the Mac (needs `LAYA_API_KEY`). Switch to B at any moment A fails, including mid-judging. No code change: use the four browser profiles on the Mac.

## Three-minute live demonstration

| Time      | Who      | Action                                                     | Explain / show                                                                                                                                                                                                                                                                                                            |
| --------- | -------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:25 | Analyst  | S01                                                        | "The gateway checks identity, data and budget." Cited answer with the public/internal FY2025 revenue figures (120/125/122) and the permitted bid; it may not call out the disagreement (S02 and S07 do). The 164 forecast is absent because RES-01 is held in review. Open the trace: the `tool:search_excerpts` finding. |
| 0:25–0:45 | Employee | Same question (S02)                                        | No forecast or bid, no hint that one exists; the conflict is still useful. A different authenticated session.                                                                                                                                                                                                             |
| 0:45–1:15 | Analyst  | Upload MIX-01 (S05)                                        | Honest REVIEW: the contact, secret and injected-instruction lines are removed and the 176 pipeline line is held as a restricted candidate. The UI does not show the removed count; say "the locators are in the audit record" and open the trace page.                                                                    |
| 1:15–1:40 | Analyst  | S04: open the Boreal (OTH-01) excerpt by ID                | Generic 404 with the same body as a random ID; no Boreal value or title; no provider call; the denied ID is not in the personal log.                                                                                                                                                                                      |
| 1:40–2:05 | Analyst  | Injection attempt ("ignore previous instructions …")       | BLOCK `input_signature:SIG-001` before any model call. Paraphrased attempts are blocked by Laya or the Qwen verification (policy v3).                                                                                                                                                                                     |
| 2:05–2:35 | Reviewer | S03: "Give me a public AsterCloud summary and a PDF."      | Public-only fresh PDF: 120 FY2025 revenue and the webinar with citations; no internal, restricted or Boreal value. Download is owner-only; a guessed ID is an audited 404.                                                                                                                                                |
| 2:35–3:00 | Admin    | Dashboard, active policy version, labelled replayed traces | Security decisions beside actual usage; unknown is not zero; estimates are labelled. Policy v3 is active (instruction-manipulation block 0.70, Qwen contextual verification of the semantic REVIEW band; a policy BLOCK is final).                                                                                        |

**Replay rule.** If generation is slow or a live run ends in REVIEW, say so, show the notice, then open an already completed real trace and label it "replayed trace from <UTC timestamp>" while one live request runs. Never fake live progress, never re-run a question to cherry-pick a better answer and never tune a threshold for a judge prompt. Keep S07 (conflicting FY2025 numbers) and the attack traces available for follow-up.

**Not in this build** (say so if asked): ChatGPT/MCP integration (planned, not shown), the S08 model tool loop, S06 review approval (REV-01 stays pending), S09 active-run and per-minute limits and budget race, S10 feed push (policy updates exist only as the admin `PUT /policy` used to activate v3), PDF import and multi-window texts (one Laya window; longer text is an honest 503).

**Known rehearsal leftovers** (not cleaned; no deletes on the shared database): MIX-01 appears three times in Sources, audit CSV exports uploaded as sources (`audit-own-2026-10-03.csv` Public and Internal, `audit-own-2026-10-04.csv` Public and Internal), and `db_test` BOREAL documents from database tests.

## Evidence pack

The dated report ([release evidence](../testing/release-evidence.md)) contains commit/deployment, policy/feed/model/protocol versions, command exit codes, test counts, semantic FP/misses with denominators, representative trace IDs, safe screenshots and the public PDF check with independent text extraction. No passwords, raw malicious originals, tokens or real personal data. Pitch placeholders remain unmeasured until replaced from this report.

## Troubleshooting during demo

| Symptom                    | Response                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Laya or bridge offline     | Show the fail-closed message; restore the service (path A: tunnel URL, Vercel env, redeploy) or switch to path B. Never substitute a mock.                           |
| Model timeout              | Show the incomplete run and its unresolved reservation. Unknown usage is charged conservatively after judging with `scripts/reconcile.mjs` (integrator), never zero. |
| Wrong role view            | Log out and use correct prepared session; inspect trusted membership, not browser role fields.                                                                       |
| REVIEW instead of ALLOW    | Show the notice honestly, then the labelled replayed ALLOW trace (replay rule). Don't bypass a scan for the demo.                                                    |
| Feed expired               | Do not continue: feed v1 is valid until 2026-10-10; `verify:release` checks it. No silent empty feed.                                                                |
| Database/audit unavailable | Stop protected operations; explain trace may be unavailable. Preserve existing evidence and restore service.                                                         |
| Question outside corpus    | State evidence is insufficient; no fabricated facts.                                                                                                                 |

## Operator handoff

Assign one of the four people to Mac/tunnel health and one to judging/login support. Record actual names privately at rehearsal. Keep services available for the agreed judging period. The ChatGPT/MCP connection remains described as a planned integration.
