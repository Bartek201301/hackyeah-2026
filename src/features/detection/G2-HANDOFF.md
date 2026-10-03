# G2 local factories — Bartosz handoff

Owner: Maciej / Builder B. Initial implementation commit: `03e8664`; the PR records the final reviewed head. Started from main `c4a15b0`
after provider PR #20 merged as `085dc1e`. Only detection files change. This is the approved
Mac-only G2 scope: the app, Laya and Ollama run on the same host; the gateway owns durable
Postgres reservation/usage/audit and deterministic content/feed/permission checks.

## Public contract and composition

The server-only `src/features/detection/index.ts` exports exactly:

```ts
import { createDetectionPort, createGenerationPort } from "@/features/detection";

const detection = createDetectionPort(); // DetectionPort | null
const generation = createGenerationPort(); // GenerationPort | null
```

Bartosz injects these into the gateway from server-only app composition. Neither factory changes
shared types, connects a route, accesses Supabase, handles login/cookies, or grants permissions.
The existing `/api/v1` seam is unchanged by this PR. Accepted pins remain enforced by the
underlying adapters; Bartosz owns copying them into the runtime manifest.

Before constructing either port on this Mac, supply `LAYA_API_KEY` privately in the app's server
process environment. Both factories read only that environment variable. Missing, empty or blank
configuration returns `null` before gateway budget reservation; Bartosz's composition maps `null`
to 503. Detection captures the configured bearer at construction, so later process-environment
changes do not change an already constructed port. Generation needs no separate Ollama environment
variable. A configured port can still fail safely if a model becomes unavailable.
Endpoints remain fixed at Laya `127.0.0.1:8000` and Ollama `127.0.0.1:11434`. No model ports
or bridge tunnel are published. Vercel deployment does not establish model connectivity.

## Exact behavior and limits

- `detection.parse()` explicitly throws `unavailable` for CSV/PDF. Upload parsing is not implemented.
- `detection.assess()` snapshots the input and semantic policy before asynchronous work, rejects
  empty/malformed or over-wire-limit input, then submits the entire original text once with the
  fixed three questions. No splitting, shortening, retry or model-selected questions.
- Success requires valid named scores, the accepted loaded checkpoint, complete provider state,
  no dropped tokens/truncated questions, and measured whole serialized state at or below
  `policy.semantic.window_tokens`. This whole-state check is deliberately conservative because
  the state includes the wrapper, not just content.
- Success returns shared-schema-validated `Assessment`: `status: complete`, actual scores/revision,
  one planned/completed window, SHA-256 of the original UTF-8 text, and one range `[0, Unicode
code-point length)`. It returns genuine aggregate Laya usage in both `semantic_input_tokens`
  and the single range's `input_tokens`; usage is never divided or clamped.
- The shared coverage-range ceiling is 1,024 aggregate input tokens. A larger genuine aggregate
  causes `incomplete` even if the provider state fit. The consumed aggregate remains on the
  thrown error. This conservative G2 limit does not claim multi-window/long-text coverage.
- `findings: []` means no adapter-generated findings. Bartosz's gateway must independently run
  deterministic checks, apply score thresholds, and decide access. `complete` is not ALLOW.
- `generation.generate()` delegates to the existing fixed Qwen adapter with a snapshot of input.
  Caps, registered-tool validation, before/after digest checks and caller cancellation remain active.
  Unknown usage remains null. A length-limited or unfinished generation returns `finished:false`
  with empty text/tools and genuine usage. The gateway must withhold it.

Both ports propagate sanitized provider failures. Runtime fields are `code`, `dispatched`,
`input_tokens`, `output_tokens`; the `ProviderFailure` class stays feature-private. No raw provider
body, credential, prompt or exception cause is exposed. Known consumed usage is preserved when
assessment is rejected after inference. Missing/unknown usage is null, never invented zero.
The `dispatched` flag is local evidence, not a durable replay/cancellation guarantee.

## Required gateway accounting and enforcement

Reserve before calling either port. One assessment can consume up to **3 × 1,024 = 3,072** Laya
input tokens, including a call whose result later fails the 1,024 aggregate coverage ceiling.
Do not reserve only the expected successful result's size. Keep unknown usage/reservations
unresolved after timeout or cancellation; aborting local HTTP does not prove model compute stopped.

There is no adapter call-ID ledger, deduplication or retry. Reusing a call ID does not suppress a
second dispatch here. The gateway's durable Postgres workflow must control dispatch and prevent
replay of uncertain calls. No Python/SQLite bridge, tombstones or retry allowance is added.

## Checks actually run

- `npm test -- src/features/detection`: exit 0, **143 tests** (33 new factory cases + 110 provider tests).
- `npm run check:fast`: exit 0, **432 application tests + 12 tooling tests**; types, lint, format and
  module-boundary checks pass.
- `npm run check`: exit 0, including the production Next 16.3.8 build, in the fresh isolated worktree
  outside the sandbox. The prior worktree's Turbopack worker port-binding failure is historical;
  it did not recur in this environment. No configuration or checks were weakened.
- Changed owned files only were formatted; `git diff --check` passed. The security-review skill
  was applied to this boundary. Tests cover exact schema/hash/code-point ranges, aggregate ceiling,
  lower policy window, input snapshots, missing key, unavailable parse, malformed response,
  wrong/changing revision or digest, timeout/cancel, nullable usage and withheld generation output.

Full CI and preview deployment status are recorded on the factory PR for its exact head.
Neither unit tests nor a successful build establish the integrated G2 gate.

## Live factory evidence

Command: `node src/features/detection/providers/smoke.mjs --factories`, with the existing Laya
credential supplied privately in process memory. Exit 0; began **2026-10-03 17:18:48 UTC**.
The smoke prints only safe metadata, never prompt text, generated text, arguments or credentials.
It uses the public factories, not direct calls to the private clients.

| Operation                      | Genuine usage                                 | Returned evidence                                                   |
| ------------------------------ | --------------------------------------------- | ------------------------------------------------------------------- |
| Synthetic input assessment     | Laya aggregate 217; wall 158.293 ms           | Complete single range `[0,57)`, range tokens 217, revision verified |
| Short Qwen generation          | Input 23 / output 5; provider 2749.101875 ms  | Finished, 16 returned text bytes, no tools                          |
| Assessment of generated output | Laya aggregate 196; wall 269.667417 ms        | Complete single range `[0,16)`, range tokens 196, revision verified |
| Output-cap generation          | Input 36 / output 64; provider 1447.888584 ms | Unfinished, zero returned text bytes/tools                          |

Laya revision: `55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851`.
Qwen digest: `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`.
The input/output SHA-256 values matched the exact accepted texts; no text was shortened.
These are individual synthetic capability observations, not latency benchmarks or policy decisions.

## Remaining integration gates

Bartosz: inject ports, configure the local app environment, reserve/settle via Postgres, apply
identity/feed/threshold/output checks, retain unknown consumption, and audit outcomes. Then show
one genuinely allowed request and one blocked request through the gateway/UI. This PR does not
claim that G2 demonstration has occurred.

Deferred: parsing, multiple windows/long-text coverage, held-out evaluation, authenticated Vercel
bridge, SQLite/recovery machinery, DB/RLS/budget-race tests, preview browser acceptance and production
rehearsal. Peer review and green CI are required before merge. No prepared-account password was
used or recorded during this slice.
