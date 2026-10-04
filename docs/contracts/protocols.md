# Contracts and adapter handoffs

[OpenAPI](openapi.json) owns public HTTP shapes. [Policy schema](policy.schema.json) and [sample](policy.example.json) own configuration. The [data model](data-model.md) owns persistence. All IDs use UUID; fixture aliases in scenarios map to seeded UUIDs. T01 creates runtime validators and shared TypeScript types from these definitions; generated types must not diverge.

## HTTP semantics

Base `/api/v1`. Strictly reject unknown request fields (including `role`, `actor_id`, `organisation_id`). Cookie sessions use verified Supabase identity plus server memberships; scoped bearer tokens resolve to an actor, organisation, audience, scopes and expiry. Tokens cannot exceed actor permissions. Normal web routes reject tokens lacking the exact operation scope. Admin-only routes reject MCP tokens. Errors do not reveal whether an inaccessible resource exists.

All mutation POST/PUT operations require `Idempotency-Key: <UUID>`. Uniqueness: `(organisation_id, actor_id, operation, idempotency_key)`. Store a canonical request hash; same key/hash returns the existing outcome, different hash returns 409. Keep keys for the audit retention period. Search is POST for privacy and is included. GET retrieval still creates a fresh audited access decision.

- 200: completed, inspected governed result; `ALLOW` or `REDACT`, or an existing terminal result.
- 202: created run or review, no finished answer yet. Pending run has `decision: null`, `error: null`; this is not approval.
- 400/413/415: invalid/oversized/unsupported request, no protected side effect.
- 401: missing/invalid identity. 403: deterministic access denial (`BLOCK`). Use 404 for inaccessible object IDs.
- 409: version/idempotency conflict, concurrent execution or non-pending run. No new effect.
- 429: budget/rate/loop refusal (`BLOCK`, specific reason).
- 503: required state/provider/audit unavailable; `decision: null`, service `error`, no protected result.

`REVIEW` normally holds output and returns only a review reference. The source-selection exception returns `{selection_required:true,sources:[{id,label,created_at}]}` for two to six _permitted_ same-name files; it contains no excerpt text. Raw candidate contents remain admin-only; ordinary chat/search/read may return only a request-time safe fact projection. Unknown timings/usage are null where allowed, never falsely zero. Before identity/policy lookup failure, versions may be null. Do not include the generic `data` union member for a different operation: validate operation-specific shape in tests.

### Response data by operation

| Operations                                                | `data` on success                                                                                                                   |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| source_list / import_list                                 | `{items: SourceSummary[]}` / `{items: ImportSummary[]}`                                                                             |
| metrics_read / feed_read                                  | Metrics / `{feed}`                                                                                                                  |
| audit_export                                              | Safe CSV bytes, `X-Trace-ID`; failures JSON                                                                                         |
| source_create                                             | `{source_id}`                                                                                                                       |
| import_upload, import_connector, chat_start, export_start | Run                                                                                                                                 |
| run_execute, run_read                                     | Run while pending/running; completed chat `{answer,citations}`; completed import Run; completed export `{download_path,expires_at}` |
| run_cancel                                                | Run                                                                                                                                 |
| excerpt_search / excerpt_read                             | `{items: Excerpt[]}` / Excerpt                                                                                                      |
| review_list / review_read / review_resolve                | `{items: Review[]}` / Review / Review                                                                                               |
| policy_read / policy_update / feed_import                 | `{policy}` / `{version}` / `{version}`                                                                                              |
| audit_list / audit_read                                   | `{items: AuditProjection[]}` (one item for detail in v1)                                                                            |
| export_download                                           | PDF bytes, `X-Trace-ID`; failures JSON                                                                                              |

All responses `Cache-Control: no-store`. Poll run status with server-returned run ID. Run execution is explicitly invoked once after creation; disable double-submit in UI but rely on the DB lease. Every poll verifies ownership; it must not expose stored unapproved generated text. No unbounded status polling: stop on terminal state, poll at 1-second intervals while the screen is visible.

Upload is multipart with one file, classification and optional deal ID. Stream-count bytes before parsing/storage; reject excess including chunked requests. Source metadata comes from selected trusted dataset configuration or admin review; uploaded metadata cannot declassify. No browser direct raw reads or signed read URLs. Download path is an authenticated gateway path, not a public Storage URL.

Examples: [search](examples/search.request.json), [chat](examples/chat.request.json), [export](examples/export.request.json), [source](examples/source.request.json), [review](examples/review.request.json), [policy](examples/policy.request.json), [feed](examples/feed.request.json), [blocked response](examples/blocked.response.json). Blocked-response timings are **illustrative schema values**, not a measurement.

## Shared internal interfaces (T01)

Keep these types in `src/shared/contracts/`; public envelope members reuse OpenAPI schemas. No provider-specific imports.

```ts
type ActorContext = {
  actor_id: string;
  organisation_id: string;
  role: "admin" | "analyst" | "employee" | "external";
  deal_ids: readonly string[];
  audience: "actor" | "public";
  scopes: readonly string[];
}; // Constructed only by trusted server authentication.
type ParsedUnit = {
  text: string;
  locator: string;
  start_char: number;
  end_char: number;
};
type ParsedDocument = {
  units: ParsedUnit[];
  text_sha256: string;
  text_chars: number;
  complete: boolean;
  format: "csv" | "pdf" | "dataset";
};
interface DetectionPort {
  parse(
    input: { bytes: Uint8Array; format: "csv" | "pdf" },
    limits: GatewayPolicy["imports"],
    signal: AbortSignal,
  ): Promise<ParsedDocument>;
  assess(
    input: { call_id: string; text: string; operation: string; audience: "actor" | "public" },
    policy: GatewayPolicy,
    signal: AbortSignal,
  ): Promise<{
    findings: Finding[];
    semantic: Assessment;
    semantic_input_tokens: number | null;
    semantic_ms: number;
  }>;
}
interface GenerationPort {
  generate(
    input: {
      call_id: string;
      messages: readonly ModelMessage[];
      tools: readonly RegisteredTool[];
      limits: GatewayPolicy["execution"];
      purpose?: "security_verification_v1"; // internal fixed rubric/schema; never public request input
    },
    signal: AbortSignal,
  ): Promise<GenerationResult>;
}
```

`GatewayPolicy`, `Finding`, `Assessment` are schema-derived. T01 defines provider-neutral `ModelMessage` as `{role:'system'|'user'|'assistant'|'tool',content:string,tool_calls?:ToolCall[],tool_call_id?:string}`; `ToolCall` is `{id:string,name:'search_excerpts'|'read_excerpt',arguments:Record<string,unknown>}`. Validate arguments against SearchRequest or `{id:UUID}` before any execution. `RegisteredTool` is `{name:ToolCall['name'],description:string,input_schema:object}`; registry is code-owned. `GenerationResult` is `{text:string,tool_calls:ToolCall[],input_tokens:number|null,output_tokens:number|null,duration_ms:number|null,model_digest:string,finished:boolean}`. Reject text/tool mixing that fails the schema. Provider wrappers map into these fields; tools never receive an ActorContext supplied by a model.

Gateway constructor receives detection, generation and repository ports. Repository port operations are named `loadActor`, `loadActivePolicyAndFeed`, `beginOperation`, `reserveCall`, `finishCall`, `finalizeRun`, `searchPermittedExcerpts`, `loadPermittedExcerpt`, `resolveReview`, `updatePolicy`, `updateFeed`. The atomic responsibilities are specified in the data model, not left to client-side read-then-write logic. ActorContext is never serialized back as a permission grant.

`updatePolicy` takes the trusted actor, idempotency key, expected version, validated full policy and canonical request/document SHA-256 hashes. Its service-only RPC rechecks active admin membership and atomically commits the next snapshot, control head and configuration audit/activity. It returns `{trace_id,policy_version,feed_version}`; identical retries return the original result even after later updates. A stale version or changed request under the same key conflicts. Schema/business validation runs before the transaction. No historical policy row is rewritten.

## Model bridge (T04)

**Implemented (P8):** `src/features/detection/bridge/bridge.mjs` is a `node:*`-only relay bound to `127.0.0.1:8787` behind an HTTPS tunnel. It accepts exactly four fixed JSON routes (`GET /laya/health`, `POST /laya/v1/systemone`, `GET /ollama/api/tags`, `POST /ollama/api/chat`) and forwards them to fixed loopback upstreams; any other route is 404 and a wrong bearer is 401 with no detail. The bearer (`MODEL_BRIDGE_TOKEN`) is compared in constant time and replaced with `LAYA_API_KEY` for Laya only. It pins `typed-decisions` and `qwen3:8b` with `stream: false` and `think: false` (400 otherwise), caps requests at 256 KiB and responses at 32/64 KiB, disables redirects and retries, times out at 60 s, runs at most two calls, and logs method, route, status and ms only. The gateway-side detection and generation clients use the bridge transport when `MODEL_BRIDGE_URL` (an `https://` origin) and `MODEL_BRIDGE_TOKEN` are both set, and keep every serialization, validation, coverage, revision and digest check. **The call ledger is deferred:** the relay keeps no state, so the `call_id` deduplication and `/v1/calls/*` below do not exist. An unknown outcome stays an unresolved reservation in the gateway's Postgres records and counts as unresolved, never zero; charging it conservatively is operator reconciliation (P07). The route names and ledger in the next two paragraphs are the original target design.

Private protocol, not an open proxy. HTTPS bearer auth with constant-time secret comparison. Loopback bind; tunnel terminates at bridge port. POST `/v1/generate` takes GenerationPort input; POST `/v1/assess` takes `{call_id,text,operation,audience,semantic_policy}` and returns the assess result. GET `/health` requires auth and returns readiness, package/checkpoint revisions and generation digest; no secrets. Bridge validates policy subset against ceilings and enforces queue/concurrency limits from central policy. It accepts no base URL, file path, shell, arbitrary model, or question list from clients.

`call_id` deduplicates at the bridge with a local SQLite job ledger. Same call returns stored status/result while retained; different payload hash rejects. Mark accepted/running/completed/unknown and retain for the configured audit window. GET `/v1/calls/{call_id}` returns usage/status for reconciliation. POST `/v1/calls/{call_id}/cancel` signals cancellation, not proof of zero usage. If restart loses model outcome, mark unknown and preserve reservation. No unattended retry of an unknown generation.

Laya request format/question wording is pinned in `semantic-protocol.md`. Python bridge enforces tokenizer windows and publishes coverage. Shared engine checks the returned coverage instead of trusting a boolean alone: expected ranges/hash, nonempty windows and end coverage must agree.

## MCP (T10)

Expose only `search_excerpts(query)`, `read_excerpt(id)`, `public_summary(topic)`. Last returns checked text/citations and an authenticated download path; the token holder retrieves PDF through the same gateway. No raw attachments or public signed URL. Gateway scope is public-approved for the judge connection. OAuth/ChatGPT is deferred.

Use official MCP SDK with HTTP transport in the Next Node route `/api/mcp`; check exact installed SDK API during T01. Token scopes: `excerpt:search`, `excerpt:read`, `summary:create`, `export:download`. Feed publisher token has only `feed:write`; no tool or excerpt permissions. Persist token hash, never plaintext. Claude Code adapter performs real gateway calls; tests inspect text and effects, not only MCP success flags.

## Dashboard projections

Metrics and audit CSV accept from/to within one UTC day in v1; omitted dates mean current UTC day. Reject longer/invalid ranges. Default scope is own; organisation requires admin. Source/import lists have fixed maximum 50 items and actor/deal filtering before serialization. Metrics sum persisted settled usage and unresolved reservations, never just the first page of activity. Context reduction uses the last completed applicable chat within the selected scope/day and is labelled with its trace in the UI; if there is none, estimates are null. Confirmed test failures are null until a dated test report exists; T11 stores safe result counts as configuration audit events. Audit CSV is capped at 1,000 rows; larger requests return a clear narrowing instruction rather than silently incomplete export.

For text-PDF upload, source_date/period/unit/fact_key/basis multipart fields are required by business validation; CSV derives these from each validated row. No date/period is invented. Source registration defaults audience_evidence to unverified. Review approval requires evidence_excerpt_ids when lowering classification; every cited evidence excerpt must be current, public-approved and independently support the proposed public text. A reason alone cannot authorize secret publication. Empty evidence array is valid for unchanged classification or rejection. Audit detail includes safe events; list rows may omit events. Refuse a trace exceeding the response event cap with a clear narrowing instruction rather than silently omitting relevant stages.
