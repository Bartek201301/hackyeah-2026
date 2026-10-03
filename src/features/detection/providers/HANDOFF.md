# T04 first provider-adapter slice — Bartosz handoff

Historical first-slice evidence. The approved local G2 scope and new public factories are documented
in [the G2 factory handoff](../G2-HANDOFF.md), which supersedes the bridge prerequisite below for G2.
Current factory environment contract: `createDetectionPort()` and `createGenerationPort()` read
only `LAYA_API_KEY` from the server process environment at construction. Both return `null` when
it is missing, empty or blank. Detection captures that bearer for its Laya requests; neither factory
reads an Ollama environment variable. Laya and Ollama destinations are fixed loopback addresses.

Owner: Maciej / Builder B. Prepared 3 October 2026 on Julian's Mac in the isolated
`codex/maciej-detection-research` worktree. Main `3f883db` was merged as `27bf0a3`.
This implementation changes only detection. The branch also contains the previously
committed `Maciej/` research and plan; those documents were not edited in this slice.

The raw provider clients now validate actual Laya and Qwen responses, preserve usage,
withhold incomplete generation output, and bound local requests. They do not implement
a protected gateway operation. At the historical first-slice commit, public detection `index.ts`
exported nothing; the later G2 factory PR added the two exports.
No app route, tunnel, shared contract, dependency manifest, database or evaluation
fixture was changed. Julian's original checkout was not switched.

## Exact feature-private handoff

| Module           | Exports intended for the next owned bridge slice                                                       | Input → output                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `laya.ts`        | `serializeLaya`, `parseLaya`, `validateLayaHealth`; `LAYA_QUESTIONS`, `LAYA_REVISION`, `LAYA_REPO`     | Shared `DetectionPort.assess` input + schema-derived semantic limits → fixed raw request; unknown provider response + verified revision → one window's observation |
| `ollama.ts`      | `serializeOllama`, `parseOllama`, `validateOllamaTags`, `registeredTools`; `QWEN_MODEL`, `QWEN_DIGEST` | Shared `GenerationPort.generate` input → fixed raw request; unknown response + trusted tags digest → shared `GenerationResult`                                     |
| `clients.ts`     | `assessLocalWindow`, `generateLocal`                                                                   | Private loopback calls, metadata checked before and after inference within one deadline                                                                            |
| `transport.ts`   | `createLoopbackTransport`; types `LocalEndpoint`, `LocalTransport`                                     | Four code-fixed endpoints; bearer only to Laya; bounded complete JSON response                                                                                     |
| `validation.ts`  | `ProviderFailure` and private validation helpers                                                       | Safe category, dispatch evidence, nullable input/output usage; no raw error/cause/body                                                                             |
| `smoke-cases.ts` | `runSyntheticSmoke` (manual smoke runner only)                                                         | Synthetic inputs; safe metadata output; missing credentials or failed capability exits nonzero                                                                     |

At the historical first-slice commit no factories existed. Do not deep-import these clients
from app/shared code. They have no durable acceptance, replay, budget reservation or cancellation
ledger. `usable` means that one Laya wire response passed validation; it is not complete text
coverage, a permission, or an `Assessment`. Incomplete observations retain scores/usage but cannot
satisfy the complete-assessment boundary. Provider failures never fabricate zero usage.

Transport: fixed `127.0.0.1:8000` health/systemone and `127.0.0.1:11434` tags/chat; no redirects,
retries or arbitrary URLs. Requests have a 256 KiB wire ceiling; health/tags responses 32 KiB;
inference responses 64 KiB. Laya state has a 128 KiB wire ceiling and the policy's 1024-token
context ceiling; this is **not** a tokenizer-window implementation. Generation accounts for full
serialized messages and registered schemas against `max_input_utf8_bytes`, passes policy
`num_ctx`/`num_predict`, and bounds returned text as well as the full response. The provider's
actual counts remain authoritative; byte limits do not invent token measurements.

Only `search_excerpts` and `read_excerpt` are registered, using canonical request/ID schemas.
Provider-supplied tool IDs are preserved. Omitted IDs become `<call_id>_<tool-index>` deterministically.
Tool results must follow the original call order before mapping to Ollama `tool_name`, including
repeated names. Unknown tools, malformed arguments, mixed answer/tool text and incomplete histories
are rejected. Proposed tools are never executed here. Valid `length`/unfinished output returns
`finished:false`, empty text/tools, and genuine nullable usage.

## Verification actually run

- Baseline `npm run check:fast`: exit 0, 228 application tests + 12 tooling tests.
- `npm test -- src/features/detection/providers`: exit 0, 110 owned tests across three files.
- Final `npm run check:fast`: 362 application tests + 12 tooling tests; final status also recorded in PR.
- Owned files only were formatted with `npm run format -- <owned files>`; `git diff --check` passed.
- `npm run check`: fast checks passed, build failed first because the pre-existing worktree
  `node_modules` symlink escaped Turbopack's filesystem root. The symlink was preserved at
  `/private/tmp/maciej-node_modules-original-link-20261003`; `npm ci` installed the unchanged lockfile
  locally (exit 0). Julian's dependencies were not modified.
- With local dependencies, `npm run check` reached CSS compilation but exited 1:
  `creating new process → binding to a port → Operation not permitted (os error 1)`.
  An escalated full-check retry returned the same Turbopack failure. Stopped that local build path
  after two attempts; no checks/configuration were weakened. CI build is a separate required gate.
- Tests use in-process fake HTTP providers for malformed responses, absent/invalid credentials,
  abort/deadline, oversized/chunked responses, zero dispatch for invalid requests, metadata mismatch,
  nullable usage, output limits, safe errors and no logging. They do not prove upstream compute stops
  after disconnect or bridge crash/replay behavior. `hackyeah-security-review` was applied to this scope.

## Live evidence (synthetic only)

Command: `node src/features/detection/providers/smoke.mjs`, with `LAYA_API_KEY` supplied privately
in the process environment. The runner uses installed Node 24/TypeScript to load feature-private
modules; it is not part of CI. It deliberately never prints prompts, text responses, tool arguments,
credentials or raw errors. No environment file was found: the existing Laya process held its key in
environment memory; it was reused in memory without writing a credential file. Julian coordinates
future Mac uptime/awake/access arrangements. Raw ports remain loopback-only.

Both bounded runs exited 0. Latest began **2026-10-03 16:59:10 UTC / 18:59:10 Warsaw**.
These are individual local observations, not a benchmark or cold/warm evaluation.

- Python 3.13.14; Laya 0.3.24; torch 2.14.1; transformers 5.18.0;
  tokenizers 0.23.2; huggingface-hub 1.33.0 (installed package metadata).
- Authenticated Laya health: loaded `typed-decisions`, actual MPS device, preference flag false,
  CPU fallback count 0, checkpoint revision `55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851`.
  Running process pin matched, and `LAYA_JEV_STRICT=0` was set.
- Actual response routing: model `typed-decisions`, repository
  `convaiinnovations/laya/typed-decisions`, reason `explicit model='typed-decisions'`.
- Laya aggregate `usage.input_tokens=217`, output 0, state tokens 24, dropped 0,
  `truncated=false`, `truncated_questions=[]`; wall time 311.545 ms including pre-health/call.
  Named scalars: instruction manipulation 0.1546, sensitive exposure 0.2953,
  resource abuse 0.1352. These were not mapped to a policy decision or threshold calibration.
  The prior 199-token sample is separately preserved as a regression fixture, without division by three.
- Actual Ollama `/api/version`: **0.35.1** (the earlier research's installed 0.20.5 is not the current
  server version). No service upgrade was performed in this slice.
- Tags before/after generation matched Qwen digest
  `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`.

| Synthetic Qwen call              | Input / output tokens | Provider duration ms | Finish / effect                                      |
| -------------------------------- | --------------------- | -------------------- | ---------------------------------------------------- |
| Short response, output cap 64    | 23 / 5                | 132.825417           | `stop`, finished                                     |
| Long-list request, output cap 64 | 36 / 64               | 1394.143             | `length`, unfinished; text withheld                  |
| Registered tool request, cap 128 | 207 / 23              | 582.9275             | `stop`, one `search_excerpts`; provider ID preserved |
| Synthetic tool-result follow-up  | 267 / 11              | 324.856083           | `stop`, final text; no further tool proposal         |

The tool result was an explicit synthetic fixture, not a database search or authorized gateway tool
execution. Missing-ID determinism is unit-tested; the live server supplied an ID. Stable durable
replay has not been implemented or tested.

Provider references used: installed Laya 0.3.24 `serve.py`, `agent.py`, `router.py`;
[Ollama chat](https://docs.ollama.com/api/chat),
[tool calls](https://docs.ollama.com/capabilities/tool-calling),
[model digests](https://docs.ollama.com/api/tags).

## Concrete requests for Bartosz (proposals, not new shared contracts)

| Decision                       | Proposed shared input/output or configuration                                                                                                                                                                                                                                                                                                                             | Required follow-up evidence                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| D01: aggregate Laya accounting | Define `semantic_input_tokens` as the genuine sum across all question rows/windows. Reserve at least `3 × semantic.context_tokens × planned_windows` before inference, with an explicitly agreed allowance or prohibition for provider retries. Specify separately what `coverage_ranges[].input_tokens` means under its 1024 cap; never squeeze aggregate usage into it. | AT04/08: worst-case reservation, aggregate settlement, overlap/retry accounting, unknown retained after timeout.             |
| D04: queue/deadline/retention  | Supply a trusted server `BridgeRuntimeConfig` (proposed) carrying `max_queue_depth`, `max_active_calls`, `queue_timeout_ms`, total deadline, audit/result retention and ledger byte ceiling. Define semantic timeout as a whole assessment deadline including admission/tokenization/windows, inside the parent run/import deadline.                                      | AT07/13: full queue, slow request body, many windows, expiry and cancellation stay bounded.                                  |
| D05: failure/recovery          | Add canonical server-only failure/status/cancel handoffs with safe code, call ID, durable dispatch evidence and nullable genuine usage. Agree rejected-before-dispatch, accepted/running, completed, cancelled-before-dispatch and unknown states plus tombstone expiry. Private `ProviderFailure.dispatched=false` alone is not durable proof.                           | AT13: disk failure, lost response, restart at dispatch boundaries, no duplicate inference, no uncertain reservation release. |
| D06: pins/launcher             | Lock Python dependencies; map `LAYA_CHECKPOINT_REVISION` to upstream `LAYA_REVISION` for the bundled SHA above; set `LAYA_JEV_STRICT=0`; record loaded revision, artifacts/tokenizer, actual Ollama 0.35.1 and Qwen digest in the runtime manifest.                                                                                                                       | Authenticated startup and before/after metadata checks; pin mismatch blocks inference; launcher/restart readiness evidence.  |
| D11: finish/tools              | Adopt `stop → finished:true`, `length`/unfinished → withheld text/tools with `finished:false`; invalid reasons fail. Agree an additive typed finish reason and persisted provider/fallback tool IDs. Validate/order tool-result association and authorize every execution centrally.                                                                                      | AT07: output-cap withheld, multi-tool/repeated-name round trip, stable replay IDs with zero duplicate tool execution.        |

No teammate message was sent automatically. This handoff unblocks review of private mapping and the
next bridge slice, not direct app wiring. Bartosz owns schema/manifest/launcher/dependency changes;
Julian owns coordinating access to the live Mac. No shared write or dependency change was requested
through a hidden feature-local replacement.

## Unperformed gates

No full DetectionPort/GenerationPort factory; Python authenticated durable bridge; SQLite recovery,
queue/admission and ledger retention; tokenizer windows/complete long-text/tail coverage; CSV/PDF
parsing/provenance; deterministic findings/feed input; calibration or held-out evaluation; G2 real
allowed/blocked requests; gateway identity, reservation, audit and reconciliation integration;
DB/RLS/bypass, browser/preview, production rehearsal or performance workload.

Full AT03/04/07/08/13/14 and release gates remain open. No G2, ALLOW, complete coverage, held-out
quality, savings or production readiness claim follows from the provider smokes. Peer approval and
green CI are still required before integration; no merge is authorized by this handoff.
