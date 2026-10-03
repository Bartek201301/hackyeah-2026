# AI Control Gateway

## One-page explanation

**AI Control Gateway governs how AI uses company data and compute. It checks access, detects malicious instructions, stops excessive tool loops, and produces approved answers or sanitized exports. Security teams can inspect each decision, while managers can see usage and estimated avoided spend.**

Companies want AI to work with useful information, but that information can contain confidential facts, conflicting numbers and malicious instructions. An agent can also keep calling tools and models after useful work has stopped. A prompt alone cannot enforce who may see data or how much compute may be spent.

Our gateway combines deterministic access, signature and budget checks with Laya's semantic risk assessment. It is placed between the application, company data, tools and model services. The policy is centralized and versioned. Uncertain extracts go to an administrator; missing required controls stop protected work.

The demonstration uses a fictional finance organisation and four prepared roles. An analyst can use assigned deal information; an employee sees ordinary internal information; an external reviewer receives only approved public facts. Imported CSVs and text PDFs enter private quarantine before useful approved excerpts become searchable. Public PDF summaries are freshly generated from public-approved sources.

The dashboard shows decision reasons, policy/feed versions, review cases and stopped loops beside real model token counts and timing. Context reduction and commercial cost equivalents are labelled estimates. The product's value must be demonstrated by tests and measured traces, not claimed percentages.

First integration: our internal web application and a verified Claude Code MCP connection. Local Ollama and Laya run on a Mac through an authenticated bridge. The provider interfaces can later point to other services. This is a bounded demo, not a production banking system or a claim of universal attack prevention.

**Current status:** specification complete; app implementation and measured release evidence pending. No performance or savings result is claimed by this pitch.

## Approximately 60-second spoken pitch

“AI can help a company work faster, but it can also expose information or waste compute in repeated tool calls.

AI Control Gateway checks what an AI system is allowed to do before it uses company data, tools or models. It combines deterministic rules with Laya's semantic risk assessment. Permissions come from trusted account records, and budgets are reserved before model calls.

Our demo uses a fictional deal. An analyst can see assigned confidential facts, an employee sees ordinary internal information, and an external reviewer gets only approved public answers. A malicious file can yield a safe extract or go to human review. Excessive loops are stopped.

Every operation leaves evidence: its policy version, decision, usage and completion state. Security teams investigate the trace; managers see actual consumption and clearly labelled cost estimates.

We will demonstrate the same gateway through our web app and Claude Code MCP, using real local model services and automated positive and negative tests.”

After implementation, change “will demonstrate” only when live evidence supports it.

## Three-minute demo outline

1. 0:00–0:45 — analyst versus employee answer to the same request.
2. 0:45–1:40 — mixed malicious file and exact-extract human review.
3. 1:40–2:05 — excessive loop stopped with persistent accounting.
4. 2:05–2:35 — external public answer and fresh PDF.
5. 2:35–3:00 — dashboard evidence and verified MCP trace.

Use the [runbook](../demo/runbook.md) for operational steps and [presentation](presentation.html) for six slides. All examples and financial figures are fictional; all performance numbers must come from the release evidence pack.
