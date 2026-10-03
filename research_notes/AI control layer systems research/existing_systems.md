> HISTORICAL EVIDENCE — this research predates the accepted gateway specification. Recommendations here are not implementation instructions. Read [the active documentation](../../docs/README.md).

# Existing AI control layer systems and reference architectures

## How do existing systems intercept and govern model and agent interactions?

### Takeaway

No single reviewed system is a documented, independently validated leader across model traffic, MCP tools, arbitrary agent actions, budgets, semantic detection, and audit. The useful reference architecture combines an enforced gateway or action boundary with a central policy decision and optional content classifiers.

### Cited Findings

- **Cloudflare AI Gateway:** A hosted proxy between application and model providers inspects prompts and model responses; Guardrails can flag or block selected categories, including prompt injection. Gateway also documents authentication, caching, rate limiting, spend limits, routing, analytics, and logging. These are vendor capabilities, not a comparative performance result. — [AI Gateway Guardrails](https://developers.cloudflare.com/ai-gateway/features/guardrails/); [features](https://developers.cloudflare.com/ai-gateway/features/)
- **Cloudflare MCP server portals:** A separate Cloudflare One product authenticates a user, exposes allowed upstream tools, namespaces calls to the upstream server, attaches credentials, and logs tool requests. Optional Cloudflare Gateway routing adds HTTP logging and DLP inspection. This is a useful reference for a **tool gateway**, distinct from AI Gateway's model proxy. — [MCP server portals](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/)
- **LiteLLM Proxy:** An OpenAI-compatible, self-hostable model gateway supports virtual keys with model access, token/request rate limits and budgets. Its MCP gateway offers a fixed endpoint with access by key, team, or organization, and `/mcp-rest/tools/call` for direct calls. Guardrails can run before and after a model call; beta guardrail policies attach at global, team, key, tag, or model scope. — [virtual keys](https://docs.litellm.ai/docs/proxy/virtual_keys); [MCP overview](https://docs.litellm.ai/docs/mcp); [guardrail quick start](https://docs.litellm.ai/docs/proxy/guardrails/quick_start); [guardrail policies](https://docs.litellm.ai/docs/proxy/guardrails/guardrail_policies)
- **Amazon Bedrock Guardrails:** During Bedrock inference, configured policies assess input before model invocation and output afterward; AWS says input policy checks run in parallel. Its separate `ApplyGuardrail` API can screen arbitrary text without invoking a foundation model, but remains an AWS service. — [how it works](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-how.html); [independent API](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-use-independent-api.html)
- **Azure Prompt Shields:** Microsoft Foundry can inspect direct user attacks at user input and document attacks at user input and tool response points. Its standalone Content Safety API takes a user prompt and up to five documents and returns per-item `attackDetected` flags. It is a semantic detector or managed enforcement option, not an authorization engine for tool execution. — [Prompt Shields concepts](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/concepts/jailbreak-detection); [API quickstart](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/quickstart-jailbreak)
- **NVIDIA NeMo Guardrails:** The open-source library places input, retrieval, dialog, execution, and output rails at separate points. Execution rails validate tool/action inputs and outputs; this is closer to agent action control than prompt-only screening, but the host application still has to route action execution through the rails. — [rail types](https://docs.nvidia.com/nemo/guardrails/about-nemo-guardrails-library/rail-types); [architecture overview](https://docs.nvidia.com/nemo/guardrails/about-nemo-guardrails-library/how-it-works)
- **Check Point AI Guardrails (formerly Lakera Guard):** The versioned `/guard` API screens user/LLM messages and agent interactions; documentation explicitly includes tool responses/descriptions, tool-call data leakage, dangerous actions outside an agent mandate, and denied tool calls. Enterprise customers can manage policies with a separate API. This documents scope, not measured detection quality. — [API overview](https://docs.lakera.ai/docs/api); [prompt defense](https://docs.lakera.ai/docs/prompt-defense)
- **Open Policy Agent (OPA):** OPA is a general policy decision engine that can run adjacent to services with policy/data in memory. Bundle and decision-log APIs provide central distribution and visibility; OPA explicitly does not supply a complete control-plane service out of the box. It does not itself perform semantic prompt analysis or intercept traffic. — [management architecture](https://www.openpolicyagent.org/docs/management-introduction); [bundles](https://www.openpolicyagent.org/docs/management-bundles)

### Inferences

- For this challenge, the durable abstraction is an interaction/action envelope passed through **normalize → deterministic facts → optional semantic signal → policy verdict → guarded execution → audit**. The brief explicitly asks for app↔agent, agent↔agent, agent↔MCP and agent↔model coverage, so a model API proxy alone is insufficient.
- With the present Next.js/Supabase skeleton, a small application middleware or wrapper around a single model call and one MCP/action executor is the clearest vertical slice. A full external proxy only helps if every demo path actually uses it. Keep the core independent of the demo domain and of a particular detector.

### Gaps

- No reviewed vendor provides a credible, directly comparable latency or attack-blocking benchmark across the same workload, thresholds, and hardware. Vendor performance claims must not be ranked as “best performance.”
- Protect AI/Prompt Security marketing material did not yield sufficiently precise, current primary implementation documentation in this pass; exclude from architectural claims until a product/API document can be verified.

## What do the strongest designs do for policy, identity, budgets, and audit?

### Takeaway

The strongest documented designs separate signal production from the final enforcement decision, bind tool access to a real identity, update central policy without rebuilding applications, and record enough context to replay why a request was allowed or denied.

### Cited Findings

- OPA bundle updates load new policy and data without restart and become active after load. Bundles can carry revisions, be signed, and be distributed by HTTP polling; the decision log can include queried policy, input, bundle metadata, and decision ID. — [bundles](https://www.openpolicyagent.org/docs/management-bundles); [decision logs](https://www.openpolicyagent.org/docs/management-decision-logs)
- LiteLLM virtual-key rules distinguish model permissions, MCP permissions, management route permissions, and inherited budgets/rate limits. Its MCP documentation makes access decisions by key/team/organization. This is a concrete example of identity-scoped entitlements rather than trusting model-selected tool names. — [virtual keys](https://docs.litellm.ai/docs/proxy/virtual_keys); [MCP overview](https://docs.litellm.ai/docs/mcp)
- Cloudflare AI Gateway spend limits scope cumulative dollar spend by model/provider or metadata such as user/team/application and can automatically block excess requests; rate limits can use fixed or sliding windows. Its logs can include prompt, response, provider, timestamp, status, token use, cost, and duration, so logging policy must consider sensitive content. — [features](https://developers.cloudflare.com/ai-gateway/features/); [rate limiting](https://developers.cloudflare.com/ai-gateway/features/rate-limiting/); [logging](https://developers.cloudflare.com/ai-gateway/observability/logging/)
- AWS `ApplyGuardrail` separates its configured content policy from model inference; its response can return full detected and non-detected assessments for debugging, when configured with `outputScope=FULL`. — [ApplyGuardrail](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-use-independent-api.html)
- Azure distinguishes `detected` from `filtered` in prompt-shield annotations; detection need not automatically imply blocking. — [Prompt Shields](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/concepts/jailbreak-detection)
- MCP authorization security considerations require servers to validate that an access token was issued for that server, prohibit passing the inbound token unchanged to an upstream API, and require user consent for dynamically registered clients when a proxy uses a static client ID. — [MCP authorization security considerations](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/authorization/security-considerations.mdx)
- MCP maintainers warn that tool annotations such as read-only hints are untrusted metadata, cannot enforce safety, and cannot prevent prompt injection. Hard guarantees require authorization, transport restrictions, runtime limits, or sandboxing. — [MCP tool annotations security note](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/)

### Inferences

- The challenge's “single configuration source” is compatible with a small versioned JSON/YAML policy for the demo; OPA's bundle approach is a useful future distribution pattern but adopting OPA/Rego now would add a separate service and language. Log the effective policy/feed version for every decision.
- A semantic detector should return category, confidence and evidence. Deterministic policy should then map this alongside identity, allowed model/tool/resource, budget state and operation risk into ALLOW/WARN/REDACT/BLOCK/ESCALATE/ROUTE. This follows the project architecture's core invariant and mirrors Azure's detected-versus-filtered split.
- Budget enforcement should reserve capacity **before** a model or tool call and settle actual usage afterward. Atomic reservation matters once calls are concurrent; reading a dashboard total after a call is only reporting, not enforcement. This is a design inference, not a documented feature of any one vendor above.
- The brief's offline/no-paid-API requirement favors local deterministic checks, a mock semantic provider for reproducible tests, and an optional local classifier for interactive demonstration. Cloud hosted guardrail APIs can be comparative references, not runtime dependencies.

### Gaps

- The reviewed documentation does not establish exact failure defaults for this project's policy store, semantic provider, or audit sink; the team must specify fail-closed/fail-open behavior by action risk and test outage cases.
- The brief calls for local compute-time/resource budgets as well as token/API cost. No reviewed gateway documentation demonstrates a complete, portable local model compute quota mechanism; the project will need explicit metering of wall time, invocations, and available local resource counters.

## Which references are practical for a small, testable challenge implementation?

### Takeaway

Use product patterns as references, not as an all-in-one dependency. A bounded self-hosted slice with central configuration, a real tool-action gate, a replaceable semantic assessor, and traceable decisions best fits the supplied brief's offline testing and performance-evidence requirements.

### Cited Findings

- LiteLLM's OSS documentation states virtual keys, spend tracking, budgets, fallbacks and request/response logging are fundamentals, while SSO, audit logs and fine-grained access controls belong to Enterprise; its license file marks repository content outside `enterprise/` as MIT. Check the exact feature and pinned version before reuse. — [enterprise feature split](https://docs.litellm.ai/docs/enterprise); [license](https://github.com/BerriAI/litellm/blob/main/LICENSE)
- NeMo Guardrails is Apache 2.0 and provides programmable rail stages plus an evaluation CLI. It is a Python toolkit and therefore not a trivial drop-in to this project's TypeScript server path. — [repository](https://github.com/NVIDIA-NeMo/Guardrails); [rail types](https://docs.nvidia.com/nemo/guardrails/about-nemo-guardrails-library/rail-types)
- OPA is Apache 2.0 and can run next to services with in-memory decisions, but its central control plane must be supplied/configured separately. — [repository](https://github.com/open-policy-agent/opa); [management architecture](https://www.openpolicyagent.org/docs/management-introduction)
- Cloudflare AI Gateway's managed service provides model-provider routing and log/export features; Cloudflare MCP portals and Cloudflare One Gateway cover a different integration surface for tool access and DLP. This split is evidence that one model gateway is not automatically a complete action firewall. — [AI Gateway features](https://developers.cloudflare.com/ai-gateway/features/); [MCP portals](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/)
- Azure Spotlighting marks third-party document content as lower trust via transformation, but Microsoft warns it increases token count and is limited to Chat Completions. Treat it as defense-in-depth, not a hard authorization boundary. — [Prompt Shields](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/concepts/jailbreak-detection)

### Inferences

- Suggested demo integration: one TypeScript control-layer entry point takes a typed actor/action/resource/data context; deterministic checks run first; a swappable local semantic assessor runs only when relevant; policy resolves the final verdict; guarded adapters alone invoke the model/MCP/action; an immutable, redacted audit record and stage timings feed Supabase/dashboard. This is a recommendation derived from the brief and patterns above, not a claim of implemented code.
- A useful benchmark compares the same workload with layer bypassed, deterministic-only, and hybrid modes; report measured P50/P95/P99 of total and added control latency, throughput, and classification tradeoffs. Avoid vendor “up to” latency savings as a proxy for this implementation's performance.
- For a three-minute demo, show a permitted action, denied tool or data transfer, policy/feed edit that changes the verdict, budget exhaustion, then trace and timing in the dashboard. The full executable test suite should also cover benign inputs and fail-mode behavior.

### Gaps

- No evidence yet that LiteLLM, NeMo, OPA, or a managed service is deployed in this repository; the project docs describe a skeleton and open decisions. These are references, not current stack components.
- No verified independent head-to-head result establishes which commercial system has the best detection accuracy, speed, or false-positive rate for the challenge's specific threat mix. A local benchmark and red-team corpus are required to make that claim.
