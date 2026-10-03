# Research decisions and evidence limits

Checked 3 October 2026. This file explains source support and design choices. It does not override the PRD or contracts. Research is primarily official documentation; historical forum/research notes are background, not proof of correctness. Agent Reach was considered for research; where its network search was unavailable, official web sources were used directly.

## Coding-agent documentation

[Codex project guidance](https://developers.openai.com/codex/guides/agents-md) describes scoped project instructions. [Claude Code memory guidance](https://code.claude.com/docs/en/memory) supports imported files and recommends concise, consistent instructions. Our application: short AGENTS, CLAUDE imports it, task-specific context through docs/README and named tasks. Long technical details are not duplicated into both always-loaded files.

[GitHub Spec Kit's specification workflow](https://github.com/github/spec-kit/blob/main/spec-driven.md) connects specifications, plans and tasks. We use stable requirements, contracts, dependency-ordered tasks and acceptance evidence without installing another planning framework. No document can guarantee an AI agent writes correct code; runnable checks and reviewed interfaces supply the feedback loop.

## Laya: verified capabilities versus reported results

The [typed-decisions model card](https://huggingface.co/convaiinnovations/laya-typed-decisions) identifies a 1,024-token context, English specialization and synthetic training workflows including security incidents. It warns that confidence remains uncalibrated. Therefore the original report's general “not trained on security” explanation is too broad, and scores must not be treated as reliable probabilities. Our narrow questions, bounded coverage and held-out evaluation are design choices, not established safety guarantees.

[PyPI](https://pypi.org/project/laya/) lists 0.3.24; [HTTP API documentation](https://github.com/NandhaKishorM/laya/blob/main/docs/http-api.md) describes explicit model selection, authentication, named answers and usage/truncation indicators. The adapter must inspect those indicators and independently verify coverage. T01/T04 pin actual checkpoint revision and runtime versions; this documentation has not run live Laya.

[Original user report](../reference/laya-report-original.md), measured on an Apple M4/16 GB, reports median 112 ms for three questions on MPS (n=12), 191 ms CPU (n=10), and approximately 124 ms for four questions. Eight security examples yielded 7/8 at a common threshold, with 8/8 obtainable after threshold selection. These are **reported preliminary measurements**, not reproduced here, not held-out product accuracy, and not predicted deployed M5/network latency. The report's claims of universally negligible cold start, hardware-independent scores and sufficient demo quality cannot be generalized from these small samples.

We reject fine-tuning, a promised zero false-positive rate and a required 100–200 ms gateway overhead in this delivery. Separate thresholds and dataset splits are retained; a measured demo gate is defined in acceptance. Laya supplies risk scores; deterministic access/budget controls remain binding.

## Generation and integrations

[Ollama chat API](https://docs.ollama.com/api/chat) documents tool calls, thinking controls and response token/timing fields. We select [qwen3:8b](https://ollama.com/library/qwen3:8b) as the initial local generation model, then verify digest, tool behavior and caps in T01. Actual prompt/output counts support usage reporting; local hosting does not produce a commercial API invoice.

[Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) and [Claude Code MCP guide](https://code.claude.com/docs/en/mcp) inform the adapter. Exact package/transport APIs are checked when dependencies are pinned. A public-scoped token governs our tools/data; it does not control every model call in Claude Code. ChatGPT setup is a later integration, not evidence already achieved.

## Data and hosting

[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) supports database access policies; privileged keys still require disciplined server checks. [Postgres full-text search in Supabase](https://supabase.com/docs/guides/database/full-text-search) supports the small approved corpus without embeddings. Private original/excerpt tables are unavailable to browser clients to prevent gateway bypass.

[Vercel function limits](https://vercel.com/docs/functions/limitations) motivate bounded server requests and small uploads. The report's blanket “Vercel cannot run Python” is inaccurate: our Mac topology is selected for resident local model weights/hardware and delivery time, not a claim Python is unsupported. Deployment limits must be rechecked against the actual plan in T01.

[Cloudflare quick tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) are a temporary development option with changing URLs and availability limitations. We prefer an existing named tunnel; the bridge uses bounded non-streaming requests. Mac/tunnel loss stops protected operations. No high-availability claim.

## Parsing and threat categories

[CSV Parse](https://csv.js.org/parse/), [PDF.js](https://mozilla.github.io/pdf.js/) and [pdf-lib](https://pdf-lib.js.org/) support the chosen parsing/new-PDF approach. Their presence does not guarantee malicious-file safety; bounded formats, parser limits and independent output inspection are required. OCR and extra formats are deferred.

[OWASP unbounded consumption](https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/) motivates explicit call/token/time budgets and loop controls. Prompt injection, sensitive disclosure and excessive agency are related categories for test labeling. Our implemented fixtures cover selected cases only; no claim of full historical attack or OWASP coverage.

## Evidence still required

Live model revisions and M5 behavior, tunnel latency, full semantic held-out results, actual database/RLS enforcement, independent PDF inspection, Claude Code connection, production walkthrough and measured dashboard values are collected by T01–T12. Until then all architecture and performance descriptions remain design intent. [Acceptance](../testing/acceptance.md) defines release gates.
