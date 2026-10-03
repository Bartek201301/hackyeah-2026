# Complete semantic coverage and correct token accounting

Researched 3 October 2026. T04; R05/R10/R16; AT04 and AT13. Outcome: the gateway can distinguish a fully inspected input from an incomplete assessment and can reserve the actual unit consumed by the provider. No scores or thresholds were measured here.

## Version-specific facts

The checksum-verified Laya 0.3.24 wheel was statically inspected. Published source links below use its PyPI provenance commit `fa9a2a7070b1789912a49ae24603bbfb1a78b001`; the [readiness brief](../model-readiness/laya-ollama.md) records the wheel hash and remote checkpoint candidate.

- [common.py, build_sequence/build_head/state_room](https://github.com/NandhaKishorM/laya/blob/fa9a2a7070b1789912a49ae24603bbfb1a78b001/laya/common.py) constructs a separate question head and state sequence for each question. State room depends on the actual head, with a closing separator. The state is sliced to fit. Instruction/option heads also have their own truncation behavior.
- [agent.py, usage construction](https://github.com/NandhaKishorM/laya/blob/fa9a2a7070b1789912a49ae24603bbfb1a78b001/laya/agent.py) sums the attention mask over all question rows. Thus `usage.input_tokens` is aggregate non-padding input across questions, not a single window length. The code reports maximum dropped-state tokens and affected question IDs.
- The inspected candidate checkpoint config uses 1024 total sequence tokens and a 256-token head budget. Its tokenizer/encoder advertise 8192, which does not raise our 1024 limit.
- The provider replaces literal tokenizer mask tokens in state before tokenization. Its serialization/preprocessing therefore needs to be reproduced and accounted for; unchanged original text/hash alone does not prove that identical characters reached inference.

## Confirmed accounting discrepancy — D01

The [technical spec](../../../docs/product/technical-spec.md) reserves `max_windows × context_tokens`. With three fixed questions, an upper bound on the provider's reported input unit is `max_windows × 3 × context_tokens`, before any additional inference/retry allowance. At the current limits, those formulas give 65,536 versus 196,608 tokens. These are calculated ceilings, not actual consumption. The aggregate may be lower, but reserving one row for three rows is not a safe maximum.

OpenAPI additionally caps each `coverage_ranges[].input_tokens` at 1024 without defining whether it means sequence length or aggregate usage. Do not fit the schema by clamping provider totals, dividing by three and discarding the remainder, or redefining actual usage as a unique-content count.

Recommendation for Bartosz: distinguish per-window maximum encoded sequence length from aggregate provider token usage, document the units, and correct the reservation bound. Retain genuine aggregate usage in `semantic_input_tokens`; if coverage uses the maximum per-question sequence length, explicitly define and calculate it. Any schema change is Bartosz-owned. Review the 200,000-token actor daily default: one maximum-sized assessment could reserve almost all of it, before candidate/output rescans. That is a usability implication, not permission to weaken the bound. Account separately for any upstream retry/CPU fallback policy.

## Serialization and coverage recommendation

Keep exactly the three named questions and order in the [semantic protocol](../../../docs/contracts/semantic-protocol.md). Serialize `operation`, `audience`, `content` in that order using compact JSON; send that serialized string as state rather than letting another serializer choose object spacing/order. Freeze escaping behavior with cross-language examples covering non-ASCII, quotes, newlines and backslashes. Never include transport credentials or actor identifiers in wrapper fields.

Recommend explicit bridge-controlled windows over exact source spans. Each window receives its own complete operation/audience wrapper and the fixed question heads. Determine the longest head's remaining state room using the pinned tokenizer, then verify the actual serialized window fits for every question. A nominal 700-content-token window is only a policy ceiling; escaping and wrapper overhead can require a smaller one. Never silently shrink accepted text itself.

Use Unicode code-point, end-exclusive source offsets. JavaScript UTF-16 offsets differ for astral characters; Python and TypeScript must share reconstruction tests. Tokenizer offset mapping can help, but whitespace, special tokens and normalization may omit spans. Require source-character coverage including leading/trailing whitespace and the final tail, with every range tied to the exact content submitted. Preserve source slices instead of decode/re-encode guesses that alter text. Track token spans internally even though OpenAPI currently exposes character ranges only.

The gateway independently validates hash, bounds, ordering, gap-free union, expected end, window count and complete status. It cannot independently prove a model attended to text from metadata alone: the trusted bridge must verify every submitted sequence and provider receipt. If mapping/preprocessing cannot establish the protocol's claim, return incomplete and record a contract question rather than asserting coverage. Literal mask-token handling requires a frozen transformed-view/source mapping or an explicit conservative unsupported case; do not change the protocol unilaterally.

## Why not simply use predict_long?

The pinned source provides long-input inference and per-risk maxima, but it windows serialized state rather than automatically rebuilding our wrapper per content window. It also aggregates `usage.truncated` as a count, and may expose only the last window's truncated-question list. It is useful comparative evidence, not a drop-in coverage certificate. Explicit per-window HTTP requests have more overhead but make hashes, deadlines, ranges and each failure observable. Batch calls can be evaluated later only if each window retains its evidence and total work remains bounded.

## Output validation and failure semantics

Require all named risk values to be finite numbers in [0,1], matching checkpoint/routing and expected revision. Read `noul`, not confidence, as the risk scalar. Reject missing answers, malformed JSON, wrong answer types, abstention/unevaluated confidence gates, state truncation, missing truncation metadata, collapsed options or incomplete windows. Upstream `truncated_questions` identifies affected state rows; independently establish that the fixed question wording/options fit the head as well. Don't assume that field detects every possible head truncation.

Complete assessments aggregate the maximum for each risk. Partial results can retain safe usage/window progress but cannot provide an approving score set. Whole-text deterministic scanning remains separate. Timeout/window exhaustion is incomplete; provider unavailability is unavailable. Import candidates remain private/held; retrieval/chat/export withhold protected results. Unknown tokens stay null with unresolved reservations; locally measured elapsed time can still be known.

Clarify whether `semantic.timeout_ms` covers the complete assessment or each provider call. Recommend an overall assessment deadline including queueing and tokenization, with smaller remaining-time windows. Per-window multiplication could exceed run/import limits; see D04. Overlap does not prove detection of attacks requiring distant context or unsupported languages.

## Verification still required

Test exact boundaries and one-token overflow, escaped content, long unbroken strings, multilingual/astral/combining text, special-token strings, repeated substrings, whitespace, malicious final tails and max-window exhaustion. Independently recompute coverage and original UTF-8 hashes. Inject false/missing truncation flags, NaN/null/wrong scores, wrong revision, missing middle/tail windows and cancellation.

Compare one-question and three-question genuine usage on the same synthetic state to validate units; compare bridge counts to provider totals without assuming score equality. Verify partial failures preserve consumed/unknown work and cause no publication or output exposure. These tests and live timings have not run. Bartosz must resolve D01 before token-accounting implementation; Maciej can continue parser and failure-fixture research independently.
