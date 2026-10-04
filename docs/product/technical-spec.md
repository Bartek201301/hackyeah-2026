# Technical specification

Accepted target, baseline 1.0. Numerical defaults belong only to [policy.example.json](../contracts/policy.example.json); hard ceilings/shape belong to its schema. Wire fields are in [OpenAPI](../contracts/openapi.json), adapter semantics in [protocols](../contracts/protocols.md), storage in [data model](../contracts/data-model.md).

## 1. Selected stack and dependency policy

Retain installed Next.js 16.3.8, React 19.2.8, TypeScript 5.9.3, Tailwind 4.3.3, `@supabase/ssr` 0.12.7 and `@supabase/supabase-js` 2.117.2. Use Node runtime Route Handlers, existing shared UI and lucide-react. Read installed `node_modules/next/dist/docs/` before implementing; do not apply older Next middleware/auth conventions blindly.

T01 integrator adds only needed dependencies and pins exact resolved versions in lockfiles: `csv-parse` for bounded CSV, `pdfjs-dist` for text extraction, `pdf-lib` for new PDF generation, `ajv` plus formats for schema validation, official MCP server SDK, `tsx` for Node tests and Playwright for browser automation. Confirm Node/Next bundling compatibility with a minimal parser/SDK smoke before parallel implementation. PDF parsing runs server-side with script execution disabled; never render untrusted PDF HTML. Python bridge uses a locked virtual environment, Laya serve 0.3.24 and a minimal HTTP service (FastAPI/Uvicorn); T01 records exact transitive versions. No framework/SDK installation in this documentation task.

Ollama generation uses qwen3:8b, thinking disabled, registered tools, bounded output and non-streaming upstream responses. T01 verifies model capabilities/digest locally. Laya typed-decisions is required for the judged hybrid path. Provider-neutral interfaces permit replacement later. FTS replaces embedding infrastructure for this small corpus.

## 2. Common enforcement sequence

1. Validate transport, content length, method, Origin for cookie writes, input schema and idempotency key. Authenticate and resolve trusted actor, membership, token scopes.
2. Read current central policy/feed; validate schema and business rules. No permissive local fallback. An expired required feed is unavailable, not empty.
3. Write durable intent and acquire operation/run state. If this fails, return service error before protected effects.
4. Apply deterministic permissions, classification, registration/allowlist, known signatures, rate and resource controls. Obvious denials do not need a model call.
5. Before each required semantic/generation call atomically reserve all relevant resource units. Run complete semantic assessment on data crossing the protected boundary; persist findings and decision.
6. For allowed work execute the single registered effect. Revalidate current membership and resource status immediately before data disclosure. Record versions used by each suboperation.
7. Check generated output, validate citations, settle usage and atomically persist terminal result/audit. Only then return protected data. Required audit completion failure withholds result and leaves incomplete state.

Precedence: identity/access/signature/hard budget denial → BLOCK; service/state failure → null decision + error; complete risk above block threshold → BLOCK; review band/uncertain separation → REVIEW; demonstrably removed disallowed segments with safe remaining content → REDACT; clean permitted content → ALLOW. Import REDACT means publishing vetted remaining excerpts, not relabelling the entire original.

Every suboperation reloads active head. Existing in-flight calls retain reservation and version history; policy changes cannot cancel already consumed compute. A newly tightened policy is applied before the next tool call or disclosure. One trace may therefore contain multiple explicit versions; root version is the initial snapshot, not a claim all subcalls used it.

## 3. Deterministic controls

- Verify actor/org/deal membership and operation scope in code and parameterized queries. Request `deal_id` narrows allowed scope; it cannot grant access. Models cannot select an arbitrary tenant or SQL query.
- Normalize Unicode NFKC and case for signature comparisons; preserve original content/provenance. Match bounded literal substrings and parsed URL hostnames, including subdomains only with dot-boundary matching. Do not fetch links. No uploaded regex or code.
- Detect conservative secret/contact patterns: PEM private-key blocks, conventional API token prefixes, email/contact fields in approved CSV schema and declared synthetic `secret`/`personal` fields. Findings contain category/locator, not matched values. These rules are illustrative coverage, not universal DLP.
- Known credential material is never published. Personal contact details are excluded from this demo corpus. Restricted business facts may remain in restricted excerpts for assigned users; their presence alone is not a leak until the audience/operation would expose them.
- Unregistered tools, arbitrary network calls, SQL, shell/code execution and file writes proposed by a model are refused and audited. Uploaded code stays inert content; there is no execution/deserialization tool.

## 4. Import and extraction

Stage raw bytes in private quarantine after streaming byte/format/actor checks. Inspect magic/type; extension/MIME alone insufficient. CSV must be valid UTF-8 with header and fixed columns from scenarios; reject excess fields, duplicate/missing headers, malformed rows, oversized cells and excess rows. PDF must be text-based, unencrypted, bounded pages with extracted text; reject image-only or pages lacking reliable extraction rather than claiming OCR. Reject attachments/active content for this demo, ignore PDF JavaScript, and never execute embedded actions. Password prompts are unsupported. Show specific safe error such as “This PDF has no extractable text; upload a text PDF or CSV.”

Preserve page/row locator and extraction hash. Check all accepted text, not only the first chunk. Deterministic scanning uses full normalized content; Laya uses the [window protocol](../contracts/semantic-protocol.md). Parsing/coverage failure cannot publish a partial unchecked tail. Connector batch is snapshotted and scanned exactly like file input; source registration is not trust in its rows.

For imports, a blocking content signature marks its containing unit unsafe; it prevents approving that unit, while separately assessed clean units may be approved. A signature in an executable request blocks the whole proposed action. No recovered unit is executed as an instruction. Candidate units are rows or paragraphs within page boundaries. Keep unsafe units as private candidates with reasons/locators and retain originals unchanged. Split safe units into bounded excerpts using the policy excerpt limit, preserve locators and cover the entire published text; never silently truncate a long unit. Safe units inherit original classification; analysts' upload classification is forced restricted to their assigned deal. If malicious instructions reference or contaminate adjacent facts, separation is uncertain → review the candidate rather than auto-approve. A candidate is rescanned independently; the original scan remains in audit. If all units are blocked, document status is BLOCK and no unit is approved. If clean units remain, mark document partial/REDACT. If uncertainty remains, keep candidate private and REVIEW. Laya failure leaves held content and service error.

States: quarantined → processing → approved / partial / review / blocked / failed. Approved text is immutable: later edits create a new version and invalidate prior approvals. Empty sanitized result cannot be called a successful import. Source/classification changes require rescanning and fresh approval, not in-place silent edits.

## 5. Review and source administration

Review UI shows original locator, candidate version, findings, safe suggested text and target classification. Admin raw inspection is audited separately and rendered as inert text; do not embed untrusted document HTML. Requester sees status and reason category, not private review content. Queue notification is in-app; email and Slack are outside scope.

Admin edits candidate, supplies reason and submits expected version. Re-run deterministic/Laya assessment, enforce valid target audience and all hard constraints. Lower classification requires explicit admin reason plus public provenance verification; record it as declassification and never copy confidential fields. Existing approved content is not overwritten. Reject request ends it without publication; stale edit returns conflict with refresh instruction. Expired review remains unpublished.

Policy editing validates JSON shape and semantic invariants: review threshold < block threshold; overlap < window; token budgets/caps internally consistent; generation input-byte upper bound + template reserve + output cap fits context; org budgets >= actor budgets; required semantic flag cannot be disabled; allowlists cannot introduce new tools/models; no service URLs/secrets in policy. Strict mode turns review band into block; balanced uses review. Persist immutable snapshots and CAS head update. Version supplied must equal expected+1.

Feed push validates schema, unique IDs, timestamps (published <= now, expires > now), nonempty values and domain syntax. Match values literally after normalization. Expired feed prevents protected actions until a valid feed is installed. The sample feed is date-bounded demonstration data: update timestamps/version at rehearsal, record that change, never silently ignore expiration. Policy/feed validators reject unknown fields.

## 6. Controlled chat and conflicts

Create persisted pending run, then execute under a lease during a bounded Route Handler call. UI polls authorised progress while execution request remains active. No free background work after response. Chat is single-turn in v1; each request contains its own question, no hidden reusable unrestricted conversation memory. The answer may perform bounded search/read model rounds.

The fixed system instruction says sources are data, not instructions, and answers must cite provided excerpt IDs. Named files resolve by exact normalized permitted name/stem/alias before content ranking; duplicate permitted names require a source choice. Approved and candidate segments are permission-filtered in SQL, then passed through the same bounded request-time projection before model input or direct excerpt response. The prompt is a helper, never the security boundary. Untrusted source data is carried in a separate user-role JSON record. Every proposed tool call is decoded, schema checked, scope checked and audited. Tool results are scanned and added only while context limits permit. Full per-request tool-call sequence remains in sanitized audit with argument hashes, not secret queries.

Count model rounds and tool calls persistently. Repetition key = actor/run/tool/canonical arguments hash; normalized equivalent whitespace does not evade it. Refuse the call that would exceed any ceiling. No new provider calls after cancellation/time limit. A loop stop returns BLOCK and a clear reason; it never emits a half-checked answer.

Buffer generated text until deterministic output checks and complete Laya output scan finish. Resolve citation IDs only within permitted context; reject invented IDs and unsupported monetary amounts. For multi-part questions, append missing attributable source facts before the output checks; unavailable facts are never invented. Uncited numeric claims about corpus facts cause REVIEW in the reference workflow. Do not trust text saying it was “approved”. A final permission recheck prevents revoked excerpt disclosure, including terminal-run replay.

For conflicts, retrieval groups comparable facts by entity, fact_key, period, currency/unit and actual/forecast basis. Include both authorised contenders within context; if they do not fit, state that comparison is incomplete and offer a narrower question. Different years or actual vs forecast are not silently treated as contradictions. For S01, include both internal FY2025 revenue figures with source dates and unresolved disagreement. Never expose the existence/value of an inaccessible restricted contender.

## 7. Export

Export uses a new run with `audience=public` regardless of actor role. Retrieve public-approved excerpts only; no reuse of unrestricted answer/context. Generate concise summary with source/date citations, scan complete text, validate citations and permit only public versions. Create a fresh PDF with pdf-lib using embedded text/standard fonts; no original pages, metadata, attachments, scripts, annotations or invisible layers. Metadata contains only product title and generation time. Extract generated PDF text in tests and compare to approved text, including forbidden fixtures. Store privately, stream through authenticated route after current access and expiration checks. Never expose a permanent Storage URL.

## 8. Resource reservation and actual usage

A database RPC reserves actor and organisation allowance before each provider call, including semantic calls. Generation token reservation = conservative input bound plus output maximum; for qwen3 use UTF-8 byte upper bound plus verified template reserve, or exact tokenizer if confirmed. T01 must verify the bound against provider-reported counts; if it cannot establish a safe bound, reduce accepted context or reserve the entire context capacity. Never use `chars/4` as a hard security cap. Reject overlength input; no hidden truncation.

Reserve generation duration at configured call timeout; semantic input tokens conservatively at max_windows × context_tokens before calling the bridge (which tokenizes and reports actual window usage). Reconcile Ollama `prompt_eval_count`, `eval_count` and duration (nanoseconds converted to milliseconds). Keep Laya token counts/latency separate. Unknown usage stays null with unresolved reserved units. Provider cancellation or timeout can stop future calls but does not prove server-side compute stopped. Poll authenticated bridge call ledger; conservatively retain/charge reservation until resolved. Retries use the same call ID; no second billable effect.

Commercial-unit tests use an explicit simulated provider with versioned rates and integer micro-USD accounting. The real local path spends tokens/time, not commercial dollars. Daily buckets use UTC start date at reservation; reconcile to that original bucket even across midnight. Exhaustion is evaluated independently per unit and per actor/org. No in-memory-only limiters across server instances.

### Reporting formulas

- Actual generation tokens = sum of settled provider-reported input/output counts; display unknown/reserved separately.
- Generation commercial equivalent = input tokens × versioned input rate + output tokens × versioned output rate. Label “Illustrative commercial equivalent; not an invoice”. Laya overhead appears separately; no implied zero total operating cost.
- Context reduction = max(0, full permitted source token estimate − selected permitted source token estimate) / full permitted source token estimate. If denominator zero show N/A. Use same pinned tokenizer/estimator and same role/audience on both sides; exclude source duplicates and prompt overhead. Label estimated; no extra provider call to construct a baseline.
- Estimated avoided input spend = positive context-token reduction × comparison input rate. Do not include speculative output savings or blocked-call costs unless a separate bounded, labelled counterfactual experiment establishes them.
- Blocked attempts, loop stops, review cases and confirmed test leaks are separate counters. Do not label every blocked attempt a “breach prevented”. Unknown test status is not zero breaches.

## 9. Failure, audit and operational state

| Failure                                   | Protected result                       | Durable state / recovery                                           |
| ----------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| Missing identity/access                   | Withheld                               | Minimal denial if durable audit available; no secret details       |
| Invalid/missing policy or expired feed    | Withheld; service error                | Keep last records for investigation; no stale permissive execution |
| Required Laya timeout/bad coverage        | Withheld; service error or held import | Review/failed state; no publication until full rescan              |
| Ollama unavailable                        | Withheld; service error                | Reservation unresolved unless positively never accepted            |
| Database/audit unavailable before action  | No action                              | Return 503; acknowledge audit unavailable                          |
| Audit finalization fails after model call | Withheld                               | Incomplete run; reservation retained, reconciliation later         |
| Client disconnect/cancel                  | No further calls/disclosure            | Request cancellation, reconcile already-started work               |
| Bridge/network restart                    | Withheld if unknown                    | Read call ledger; never treat lease expiry as success              |

An audit intent includes actor/operation, resource identifiers only when permitted, request hash, policy/feed versions, reserved units and timestamps. Completion includes decision/reasons, findings without values, semantic revision/status, actual usage and durations. Store no chain-of-thought, credentials, raw malicious content or prompts in audit. Never claim an outage-denied request has a durable trace if the database write failed; trace ID may be ephemeral and UI must say record unavailable.

## 10. Performance and release evidence

Measure end-to-end, deterministic, semantic, persistence and generation wall time separately. Gateway overhead excludes generation time but includes semantic/control/persistence; publish its components. Concurrent spans require a timeline; do not sum overlapping spans as total. Record warm/cold, service/device versions, network path, n and p50/p95; p99 only with enough samples and stated n. Benchmarks do not disable controls. Acceptance and required evidence are in [tests](../testing/acceptance.md).
