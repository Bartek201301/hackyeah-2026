# Setup and recovery

Application setup instructions for future tasks. The starter commands are available now; gateway/model/account commands are explicitly marked below. No secrets belong in Git, logs, screenshots, pitch or this document.

## Available now

From repository root with Node 24 and npm 11.11.0:

```sh
npm ci
npm run dev
npm run check
npm run doctor
```

Documentation-only validation is also available now (introduced by T00): `node scripts/validate-docs.mjs`. It validates the compatible JSON Schema assertions/examples, contract references and local documentation links; it does not run the application.

`dev` serves the existing starter. `check` includes format/types/lint/module rules/tooling tests/build. `doctor` checks its existing database prerequisites; it does not prove future gateway auth/RLS/model behavior. `npm run new-feature <name>` and `npm run format -- <owned-file>` are also available now. `npm run test` runs the Vitest unit tests (`src/**/*.test.ts`, including contract validators). `npm run contracts:types` regenerates `src/shared/contracts/openapi.gen.ts` from `docs/contracts/openapi.json`; `check` runs both. Confirm existing scripts in package.json before use. No security/gateway suite exists until the named task introduces it.

## Configuration contract (T01/T02/T04)

| Name                                 | Location                   | Meaning                                                           |
| ------------------------------------ | -------------------------- | ----------------------------------------------------------------- |
| NEXT_PUBLIC_SUPABASE_URL             | web/server                 | Existing project URL                                              |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | web/server                 | Public client key; never a permission substitute                  |
| SUPABASE_SECRET_KEY                  | server only                | Privileged backend credential; never NEXT_PUBLIC                  |
| APP_ORIGIN                           | server                     | Exact deployed origin for cookie mutation checks                  |
| MODEL_BRIDGE_URL                     | server only                | Fixed HTTPS tunnel endpoint; no caller override                   |
| MODEL_BRIDGE_TOKEN                   | server + bridge            | Strong shared secret; constant-time auth; rotate privately        |
| LAYA_API_KEY                         | bridge/Laya only           | Local Laya auth secret                                            |
| LAYA_MODELS                          | Mac                        | Explicit typed-decisions                                          |
| LAYA_DEVICE                          | Mac                        | mps, or measured CPU fallback recorded in evidence                |
| LAYA_HOST / LAYA_PORT                | Mac                        | Loopback and local service port                                   |
| OLLAMA_HOST                          | Mac                        | Loopback only                                                     |
| LAYA_CHECKPOINT_REVISION             | runtime manifest/bridge    | Exact verified checkpoint commit, never mutable unrecorded latest |
| OLLAMA_MODEL_DIGEST                  | runtime manifest/bridge    | Digest verified against selected local model                      |
| `DEMO_<ROLE>_PASSWORD` (four)        | private setup process only | ADMIN/ANALYST/EMPLOYEE/REVIEWER; ≥16 chars; test:db reuses them   |
| TEST_BASE_URL / TEST_* credentials   | private test process       | Prepared test accounts and target; no screenshots of passwords    |

Retain existing env names if the installed starter uses an equivalent: T01 explicitly maps/migrates them in `.env.example` without exposing real values. Runtime manifest contains versions/digests, not secrets. Never give the model bridge a Supabase service key. Model URLs live in deployment configuration, not editable policy JSON.

## Model services — introduced and verified by T01/T04

These are upstream service commands, not repository scripts available today. Run them only during the implementation capability task; install into an isolated environment, pin and record the result.

```sh
python3 -m venv .venv-laya
.venv-laya/bin/pip install 'laya[serve]==0.3.24'
ollama pull qwen3:8b
ollama serve
```

T04 supplies a locked bridge environment and `npm run models:start` / `npm run models:check` wrappers; they are **not available until T04**. Set secrets privately before launching Laya; do not paste tokens into committed examples. Loopback Laya startup example, **introduced T04**:

```sh
LAYA_HOST=127.0.0.1 LAYA_PORT=8000 LAYA_MODELS=typed-decisions LAYA_DEVICE=mps LAYA_PRELOAD=1 .venv-laya/bin/laya-serve
```

Verify authenticated health identifies the loaded revision, then run a real assessment with named scores and coverage; a basic health 200 alone is insufficient. T01 must verify how the pinned Laya loader consumes the exact checkpoint revision/local cached snapshot; record the resolved weight hash and prevent automatic drift. Generation smoke checks thinking disabled, tools, cap adherence and reported token counts/durations. If selected model cannot satisfy the contract, report the capability blocker before changing model selection.

Bridge binds loopback (implementation default port 8787); only its authenticated fixed routes are tunneled. Prefer an existing named HTTPS tunnel. Temporary quick tunnel is permitted for rehearsal; its URL can change on restart and needs MODEL_BRIDGE_URL update and redeploy. No raw Ollama/Laya public ports; no unauthenticated bridge. T04 launch guide must include locked Python dependencies, local SQLite ledger location, readiness, shutdown and recovery. Keep Mac on power and awake; operator checks connection throughout judging.

## G2 runtime on the Mac

For stopped-service, authentication or model-pin failures, run `node scripts/model-doctor.mjs` from the project directory (or pass the private environment file path). It prints no credentials and distinguishes Laya on port 8000 from Ollama on port 11434. An already-running Ollama needs no second `ollama serve`. Public Laya `status: ok` alone is not authenticated readiness. Classifier accuracy and the optional contextual verification policy are covered in the [control assessment report](../testing/control-assessment/REPORT.md).

G2 runs the app, Laya and Ollama on Julian's Mac. `createDetectionPort()` and `createGenerationPort()` call fixed loopback endpoints (Laya `127.0.0.1:8000`, Ollama `127.0.0.1:11434`) and read only `LAYA_API_KEY` from the server process environment. Without it both return `null` and the gateway answers 503 `SEMANTIC_UNAVAILABLE` before any reservation; never a fake. Durable reservation, usage and audit stay in the gateway's Postgres records; there is no Python ledger. The engine enforces the revisions in `src/shared/contracts/runtime-manifest.json`; any other value is a 503.

The Mac's `.env.local` holds `LAYA_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`. Bartosz types the Supabase values in person; never in chat, never committed, never printed. No model variable is `NEXT_PUBLIC_`.

1. `git switch main && git pull --ff-only && npm ci`.
2. Start Laya and Ollama with the verified procedure in `src/features/detection/providers/HANDOFF.md`; confirm authenticated health and that the revision/digest match the runtime manifest.
3. `npm run dev`, then sign in at `http://localhost:3000` (Bartosz types passwords). For curl, `read -s DEMO_EMPLOYEE_PASSWORD; export DEMO_EMPLOYEE_PASSWORD` and `npm run -s dev:session -- employee`.
4. Ask a benign question (ALLOW) and a known injection (BLOCK); record run ids, statuses and usage only, never answer text.
5. Outage check with the **analyst** account: stop Laya, ask → "Request withheld" (503); restart Laya, ask again → answer. Never retry an unknown call to make it look clean.

## Bridge runtime (P8)

Vercel production and preview run the gateway; the models stay on Julian's Mac behind the relay in `src/features/detection/bridge/` (see [Model bridge](../contracts/protocols.md#model-bridge-t04) and `HANDOFF.md` there). There is no call ledger: an unknown outcome stays an unresolved reservation in Postgres.

| Side               | Env                                               | Notes                                                                 |
| ------------------ | ------------------------------------------------- | --------------------------------------------------------------------- |
| Vercel prod + prev | `MODEL_BRIDGE_URL`, `MODEL_BRIDGE_TOKEN`          | Server only; `https://` origin, no path. No `LAYA_API_KEY` on Vercel. |
| Mac relay          | `LAYA_API_KEY`, `MODEL_BRIDGE_TOKEN` (same value) | Private file, mode `0600`, outside the repo. No Supabase key.         |

Julian generates the token into the relay file; Bartosz types the same value into Vercel. Never in chat, logs, commits or screenshots.

1. Start Laya and Ollama as in [G2 runtime on the Mac](#g2-runtime-on-the-mac) step 2.
2. Relay, from the repository root: `node --env-file=<private file> src/features/detection/bridge/bridge.mjs`.
3. Tunnel: `cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8787`. Expose only 8787, never 8000 or 11434.

**Tunnel restart.** It is a Cloudflare quick tunnel: the hostname changes on every restart. Then update `MODEL_BRIDGE_URL` in Vercel Production and Preview, redeploy production, and ask one analyst question before handing the URL back to judges. Until the redeploy, production model paths fail closed with 503.

**Switch to path B** (no code change): the Mac serves the release commit with `npm run build && npm start` on port 3000 and holds the four browser profiles. Move the demo to those profiles and finish there; production stays deployed (BLOCK still works, model paths 503 while the bridge is down). Do not retry an unknown call on the other path.

## Supabase and accounts — T02

Integrator commits additive migration on branch, gets review, applies it once to shared Supabase and records migration SHA/time/result in supabase/APPLIED.md. Dependent app merges follow successful application. Never alter an applied file. Preview/local/prod share data; coordinate reset explicitly with the team.

Disable public signup in Supabase Auth. Create four password users from fixture emails via admin setup process and verified memberships; choose synthetic emails as labels, no email delivery requirement. Supabase-generated UUIDs map to fixture roles. Admin is not automatically assigned to restricted deals. Store login handout privately for judges. Test login/logout for each account and verify raw data denies with their actual JWTs.

Public signup is disabled in the dashboard (Authentication → Sign In / Providers → "Allow new users to sign up" off), not through config push. Passwords come from `DEMO_ADMIN_PASSWORD`, `DEMO_ANALYST_PASSWORD`, `DEMO_EMPLOYEE_PASSWORD` and `DEMO_REVIEWER_PASSWORD` in the integrator's private `.env.local`, next to `SUPABASE_SECRET_KEY`; scripts never print them. `npm run demo:seed` seeds identities and controls (organisation, deals, the four accounts with memberships, policy v1, feed v1, control head) plus the seven dataset sources (PUB-01, PUB-02, INT-01, INT-02, RES-01, RES-02, OTH-01) with one raw synthetic row each; it creates no documents or excerpts, since ingestion runs through the gateway in T05/T11, and prints an alias → source_id table. Existing users are never reset or deleted. `npm run test:db` runs real-JWT identity and RLS probes for all four roles and anon against the shared project, plus private Storage probes on the `quarantine` and `generated-exports` buckets (it keeps a synthetic `db-test/canary.txt` in each); it is manual and never runs in CI. Missing env exits nonzero and names the variable.

T02 introduces `npm run demo:seed`; it inserts source metadata and raw synthetic fixtures idempotently and must not approve content by bypassing the gateway. T11 runs genuine ingestion to prepare approved fixtures. Demo resets are a separate explicit coordinated action, never a side effect of dev/build/test. No real financial or personal data.

## Connector import (T05)

`POST /api/v1/imports/connector` (`{source_id, batch_id}`) is admin-only: any other role gets 403 before any write; an unknown, foreign or empty batch gets one 404. It answers 202 with an `import` run; `POST /runs/{id}/execute` assesses every non-blank line of every row as one unit (feed signatures, then one Laya call, then policy) and publishes atomically through `finalize_import`: all clean → `approved`/ALLOW, clean plus removed units → `partial`/REDACT, any held unit → `review`/REVIEW (candidate excerpt plus review request), nothing publishable → `blocked`/BLOCK (200, not 403). Unverified audience evidence below restricted always goes to review. Any service failure publishes nothing. A source with an approved or partial document refuses re-import with 409.

## Hosting and first vertical slice

1. T01/T02 configure server secrets on preview and production; no browser bundling.
2. T04 Mac and bridge ready; confirm HTTPS authenticated request from deployed Next server, not just local curl.
3. T03 writes a test intent/reservation/completion to durable storage.
4. T06 performs one real allowed answer and one blocked attempt; inspect audit and text.
5. T11 verifies live/DB/browser gates. T12 records deployment commit, current policy/feed/model versions and account handout.

## Claude Code — introduced T10

Use official SDK/Claude instructions and verify installed CLI syntax during T10. Prepared connection uses HTTP `/api/mcp` and a short-lived token with public search/read/summary/download scopes. Store token in user-local secret configuration, never repository MCP configuration or shell history. Record a redacted setup command and actual successful tool calls in the runbook evidence. Feed publisher uses a separate token with only feed:write.

ChatGPT is a later integration path requiring supported app/MCP setup and suitable authentication. Do not use ChatGPT subscription credentials as an API key or claim subscription messages fund embedded generation. Internal generation uses local Ollama; no paid API account required for the required demo.

## External feed push — introduced T07

A runnable [external push example](../contracts/examples/push-feed.mjs) is available now: `node docs/contracts/examples/push-feed.mjs docs/contracts/examples/feed.request.json`. It requires the endpoint introduced by T07 and private environment values; do not execute it against an unprepared service. T07 adds the operational wrapper `scripts/push-threat-feed.mjs`: reads FEED_TOKEN and GATEWAY_URL from private environment, reads a specified validated JSON update file, POSTs to `/api/v1/feeds` with Idempotency-Key and bearer auth, prints version/trace only, exits nonzero on conflict/error. It must not print the token. Its example input is [feed.request.json](../contracts/examples/feed.request.json). The source program runs outside the gateway process, demonstrating externally managed declarative signatures. No arbitrary URL fetching by the gateway.

## Recovery

- **Mac/tunnel down:** fail closed. Restore service/tunnel, update fixed URL if changed, check revision and a genuine assessment, reconcile incomplete calls, retry only with original idempotency key. Do not enable a fake Laya mode.
- **Model timeout:** preserve reservation until bridge status proves usage or non-start; stop further run actions. UI explains incomplete operation.
- **Database/audit down:** protected calls stop. Restore access, inspect incomplete operations; do not bypass persistence.
- **Bad policy/feed update:** reject before activation; old valid head unchanged. An expired feed still needs an authenticated new valid version.
- **Code regression:** new branch from origin/main, reviewed revert of exact merge commit; no blind HEAD revert. Database repair is additive and separately reviewed.
- **Unexpected cost/exposure:** stop new protected runs, retain evidence without secrets, correct cause and rerun acceptance before reopening demo.

All future commands are listed in [acceptance](../testing/acceptance.md). `verify:release` must fail when required services are absent.
