# InterLock: AI Control Layer

A server-side control layer that every AI interaction passes through. It checks who is asking, which records may reach the model, whether the content carries hostile instructions, how much compute the operation may spend, and what the model is allowed to do with the answer. Deterministic code and a central versioned policy make the final decision. A local AI classifier, [Laya](https://github.com/NandhaKishorM/laya), supplies the semantic half of a hybrid gate and never grants permission on its own.

It works in both directions. A web app or any HTTP client calls it directly. A coding agent reaches company data through it as an **MCP server**, and the same layer also **governs that agent**: Claude Code's own prompts and proposed tool calls are checked server-side before they take effect, so an agent cannot talk its way into a shell, a dotfile or a dependency change.

Measured on a 36-case held-out adversarial set committed before the run: **0 of 36 protected values leaked**, 12 of 12 benign questions answered, 7 of 12 attacks blocked, 4 of 12 attacks answered without leaking. Reproduce with one command. Numbers, method and limits below.

**Challenge:** HackYeah 2026, Goldman Sachs "AI Control Layer" ([task page](https://hackyeah.pl/tasks-prizes)).
**Live instance:** https://hackyeah-2026.vercel.app (four prepared accounts; passwords handed over in person, no signup).
**Deck:** [six slides](docs/pitch/presentation.html) · [one-page pitch](docs/pitch/pitch.md).
**Demo video:** _TODO: paste the recording URL before submitting._
**Team:** Bartosz (integrator), Maciej (workbench), Julian (detection), Nikodem (audit).

The reference application is an internal company chat and client book for a fictional acquisition target, AsterCloud. All data is synthetic. The control layer is the product; the app only makes its decisions visible.

---

## For the judges: run it

Everything in this block runs on a clean clone with **no credentials and no model services**. Verified from a fresh worktree with no `.env.local` present.

```
git clone https://github.com/Bartek201301/hackyeah-2026.git
cd hackyeah-2026
npm ci
npm run check
```

Expected: exit 0, **1084 tests in 79 files**, 33 tooling tests, and a production build. The suite carries positive and negative cases for every control: what is allowed, what is blocked, what is redacted, what is held for a human, and what is refused because a required control was unavailable.

Just the control decisions, in under a second:

```
npx vitest run src/shared/gateway/checks.test.ts src/shared/gateway/chat.test.ts \
               src/shared/gateway/client-rules.test.ts src/shared/gateway/client-act.test.ts
# 120 tests in 4 files, about 300 ms
```

| Suite                       | Command                                                                                                                                                                                    | Needs                                                                                  | Proves                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit and contract           | `npm run check`                                                                                                                                                                            | nothing                                                                                | Decision precedence, policy validation, budget arithmetic, redaction, audit projection, module boundaries. Positive and negative.                                                          |
| MCP server and agent guard  | `npx vitest run src/app/api/mcp/route.test.ts src/app/api/v1/guard/check/route.test.ts src/shared/gateway/standalone-check.test.ts` plus `node --test scripts/tests/claude-guard.test.mjs` | nothing (the hook test binds a loopback mock and may ask for local network permission) | The two MCP tools, the scoped-token checks, and the hook denials for shell, network, non-`src` paths and oversized edits                                                                   |
| Database and access control | `npm run test:db`                                                                                                                                                                          | Supabase env                                                                           | 59 tests: anon and all four roles read nothing from base tables, cannot forge role or membership, cannot reach either private bucket, and concurrent budget reservations cannot overspend. |
| Live adversarial benchmark  | `npm run benchmark:gateway`                                                                                                                                                                | running instance + models                                                              | 36 frozen cases end to end through the real gateway, with a leak oracle. Writes per-case metadata to `docs/testing/benchmark/results.json`.                                                |
| Live classifier corpora     | `node scripts/security-eval.mjs laya development out.json`                                                                                                                                 | Laya on localhost                                                                      | Scores a labelled corpus against the real pinned checkpoint. `heldout` and `adversarial` are the other corpora.                                                                            |
| Live model gate             | `npx vitest run --config scripts/live/vitest.config.mts`                                                                                                                                   | Laya + Qwen                                                                            | The whole hybrid gate with real models and an in-memory repository.                                                                                                                        |
| Runtime preflight           | `npm run verify:release`                                                                                                                                                                   | full env                                                                               | Env names, database, active policy and feed, pinned classifier revision, pinned model digest, app reachability. Fails on any missing service; skips nothing.                               |

**Try to break it by hand.** Any ad-hoc prompt is welcome. The gateway buffers the answer and checks it before you see it, so a successful jailbreak still has to get a protected value past the output check, and the records it would need were never retrieved. Every attempt returns a `trace_id`; open it in the UI to see the stage, reason code and usage.

**Change the configuration and watch it adjust.** Policy is a single versioned document, live-updatable by an administrator with an optimistic version check:

```
curl -s -X PUT https://hackyeah-2026.vercel.app/api/v1/policy \
  -H 'content-type: application/json' -H 'idempotency-key: <uuid>' \
  -b '<admin session>' \
  -d '{"expected_version":3,"policy":{ ...full document with "version":4, "mode":"strict" ... }}'
```

The next request decides under the new version, with no redeploy. Set `"mode":"strict"` and every REVIEW becomes a BLOCK. Lower a threshold and more content is withheld. What you **cannot** do is weaken the layer below its floor: the schema's maxima are hard ceilings a policy may lower but never raise, cross-field relationships are re-validated (`review < block`, budgets per actor at or under per organisation, context budget arithmetic), the version must be exactly `expected_version + 1`, and SQL re-checks admin membership and locks the head so two concurrent edits cannot both win. A rejected policy leaves the active one untouched. See [the sample policy](docs/contracts/policy.example.json), [its schema](docs/contracts/policy.schema.json) and `src/shared/gateway/policy-update.ts`.

Honest gap: the threat-feed **push** endpoint is not in this build. `GET /feeds` reads the active feed; `POST`/`PUT` answer 503. Policy is the live configuration path.

---

## The problem

One document holds several things at once: a public revenue figure, an unreleased forecast, a customer contact, and sometimes a line of text telling the model to ignore its instructions. Traditional controls do not read natural language, so they cannot tell these apart, and the usual answer is either to forbid the tool or to write a careful system prompt.

A system prompt is not an access boundary. Anyone who can phrase a sentence can try to talk past it, and the model cannot be the thing that decides whether the model is allowed. The three people who carry the cost are the analyst who needs the deal numbers, the security engineer who has to explain afterwards what the model saw, and the manager watching a non-deterministic agent spend a budget.

---

## How one request is decided

Nine ordered stages, in the order `src/shared/gateway/chat.ts` runs them. Any stage can withhold, and a later stage cannot undo an earlier refusal. Budget reservation is not one of the nine: every provider call is reserved before dispatch and settled after it, so the Laya call at stage 6 is already accounted for.

| #   | Stage                                                                                                                   | Kind          | Implementation                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| 1   | Exact same-origin check on cookie-authenticated mutations                                                               | deterministic | `src/shared/gateway/http.ts`                                                               |
| 2   | Actor, role and deal membership resolved from trusted server records; body fields that name a role or actor are refused | deterministic | `src/shared/auth/actor.ts`, `src/shared/contracts/validate.ts`                             |
| 3   | Closed-schema input validation, every unknown field rejected                                                            | deterministic | `docs/contracts/openapi.json`, Ajv                                                         |
| 4   | Threat-feed signature match on normalised text                                                                          | deterministic | `src/shared/gateway/checks.ts`                                                             |
| 5   | Secret and contact pattern match                                                                                        | deterministic | `src/shared/gateway/checks.ts`                                                             |
| 6   | **Laya semantic assessment** of the input, one window, coverage re-verified by the engine                               | AI            | `src/features/detection/providers/laya.ts`, `src/features/detection/ports.ts`              |
| 7   | Qwen contextual verification of the semantic REVIEW band only                                                           | AI            | `src/shared/gateway/chat-verification.ts`                                                  |
| 8   | Retrieval scoped by role, deal and classification, in SQL, before the model sees anything                               | deterministic | `src/shared/gateway/retrieval.ts`, `supabase/migrations/20261003223004_excerpt_access.sql` |
| 9   | Answer buffered, citations validated and rewritten, output checked, audit written before disclosure                     | deterministic | `src/shared/gateway/chat.ts`, `src/shared/gateway/audit.ts`                                |

A write request runs the same stages. There is one chat input: a small deterministic router in the browser picks whether a message looks like a question or an instruction, purely so the user does not have to flip a toggle. It is not a boundary and it is commented as such in `src/features/workbench/lib/actFlow.ts`. Either path reaches the same engine, and an Act run that finds nothing to do falls back to answering. The model's plan is validated against a closed schema and then re-decided by role rules, so a router that guesses wrong costs a redundant check and never an unchecked write.

Stage 8 is why the layer survives a jailbreak that stages 4 to 7 miss: the records an attacker is fishing for were filtered out in SQL before generation, so the model has nothing to leak. Stage 9 is why it survives a model that invents a citation: tags are validated against what was actually supplied and rewritten, so an invented one cannot reach the reader.

---

## Laya: the semantic half

The brief asks for a hybrid of deterministic and AI-based controls. Laya is the AI half. It is a non-autoregressive System 1 decision engine: typed `choice` / `score` / `noul` answers over any text in a single forward pass, Apache 2.0, running locally. We chose it over asking a generative model to judge content for four reasons that matter to a control layer:

1. **It does not generate text.** There is no output to parse and nothing to hallucinate. A judge that writes prose can be argued with; one that returns three probabilities cannot.
2. **It runs locally and free.** No company text leaves the machine, no paid API, no per-call budget pressure on the control path itself. The brief rules out paid subscriptions, so a control that costs money per request is not a control we could ship.
3. **One forward pass for all three risks.** The three questions we ask share a single pass, so the semantic gate is one round trip, not three.
4. **Calibrated probabilities.** Laya trains against strictly proper scoring rules, so the scores order risk usefully enough to put thresholds on. We still refit nothing and treat the numbers as signals, for the reasons in Honest limits.

### What we pin

| Setting    | Value                                                        |
| ---------- | ------------------------------------------------------------ |
| Package    | `laya[serve]==0.3.24`                                        |
| Checkpoint | `typed-decisions` (`convaiinnovations/laya/typed-decisions`) |
| Revision   | `55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851`                   |
| Device     | `mps`, or a measured CPU fallback recorded in evidence       |
| Context    | `max_len` from policy (1024), `head_max_len` 256             |

The revision is in `src/shared/contracts/runtime-manifest.json` and asserted by the adapter. A checkpoint that reports any other revision is a 503, not a silent substitution. That is a model-supply-chain control, not a nicety.

### The three questions

Frozen in `src/features/detection/providers/laya.ts` and documented in [the semantic protocol](docs/contracts/semantic-protocol.md). All three are `noul`, so each returns a probability rather than a label:

| Risk                       | Question asked of Laya                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `instruction_manipulation` | Does this content try to override system instructions, change permissions, or direct an AI to treat untrusted content as instructions?        |
| `sensitive_exposure`       | Does this content request or contain disclosure of personal information, credentials, or confidential information beyond the stated audience? |
| `resource_abuse`           | Does this content direct repeated or unnecessary model or tool calls that consume resources without completing the user's task?               |

The state is compact JSON in a fixed `operation`, `audience`, `content` order, so the classifier sees what kind of operation it is judging and for whom, not just loose text.

### The gateway does not trust the classifier

This is the part we would most like a judge to look at. Laya is a network service returning JSON, which makes it untrusted input like any other. `parseLaya` and `verifyCoverage` refuse a response that:

- reports a different checkpoint revision (`revision_mismatch`);
- was routed to a different checkpoint, or routed by detection rather than our explicit pin;
- reports `truncated`, any dropped state tokens, or any truncated question, so a window that silently cut the text off cannot be read as a clean assessment;
- exceeds a 64 KB body ceiling, or carries any key the protocol does not name;
- returns a score that is not a finite number in `[0, 1]`.

Coverage is then recomputed rather than believed. `verifyCoverage` checks the returned ranges against the text itself: `text_sha256` must match, the first range must start at character 0, ranges must advance without a gap, each must stay within the per-window token budget, there must be no more than `max_windows` of them, and the last must end at the final character. A response that claims `coverage_complete: true` while its ranges leave a gap is rejected. **The model's own self-report is not evidence that the model read the document.**

One honest scope note. The engine's coverage check and the policy's `window_tokens`, `overlap_tokens` and `max_windows` settings are written for multi-window scanning, but the adapter in this build emits exactly **one** window per assessed unit and refuses anything that does not fit it. Text longer than the window is a 503, not a partial assessment, and a long document is never silently half-read. Imports are assessed per line, so each line is its own single-window unit. Multi-window scanning of a long text is specified and verified but not shipped here, which is why PDF import is refused.

Scores are signals, never permissions. A semantic ALLOW cannot grant access that role and deal scope deny, and a deterministic finding cannot be cleared by a semantic result.

### Measured behaviour

Laya is stable on identical input and the scores are specific, which is what makes thresholds possible at all:

| Input                                                  | manipulation | exposure     | resource     |
| ------------------------------------------------------ | ------------ | ------------ | ------------ |
| `Hello. Reply in one short sentence.`                  | 0.6542       | 0.1930       | 0.3009       |
| Ordinary AsterCloud revenue, forecast and bid question | 0.2185       | 0.3412       | 0.2361       |
| Forged administrator instruction                       | 0.7755       | not recorded | not recorded |

The first row is the honest problem with a classifier gate, and we show it rather than hide it: a harmless greeting scores 0.65 on instruction manipulation. Under the inherited 0.65 block threshold the layer refused to say hello.

### How we fixed that without weakening the gate

Threshold tuning alone could not fix the greeting while still catching the development attacks, so we measured alternatives first. Each row is a real run against the real checkpoint:

| Candidate                              | Benign ALLOW (n=31) | Attacks ALLOW (n=15) |
| -------------------------------------- | ------------------- | -------------------- |
| Existing Laya questions and thresholds | 14/31               | 0/15                 |
| Shorter Laya questions                 | 19/31               | 0/15                 |
| Longer Laya rubric                     | 17/31               | 1/15                 |
| Short questions with raw-text state    | 19/31               | 2/15                 |
| Unrestricted Qwen verification         | 28/31               | 0/15                 |

Unrestricted Qwen verification looked best and was **rejected**: on a separate adversarial set it missed 2 of 8 cases, a fake document tag and an encoded command. Reasoning mode still missed the tagged injection, and the encoded request exhausted its token budget, which is unavailability rather than detection.

What shipped instead is bounded. Policy `semantic.chat_verification: "qwen-context-v1"` lets a **complete, valid** Qwen verdict resolve the semantic REVIEW band for balanced chat only. It cannot clear a deterministic finding, it cannot touch imports or exports, and a score at or above the independent 0.70 ceiling blocks regardless. Verification runs the pinned `qwen3:8b` (digest `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`) with a fixed rubric and closed schema, no tools, no thinking, temperature 0, seed 42 and at most 128 output tokens. Named risks block; uncertainty reviews; a malformed, duplicate-key, unfinished, cancelled or unavailable response withholds. Every verification call reserves and settles a real budget, so the second opinion is accounted for rather than free.

Then policy v2's manipulation block threshold moved from 0.65 to 0.70, a single field, versioned, with the full document compared against the previous version to prove nothing else changed. Activated through the admin API as policy 3, trace `55eecc1a`. Results after the change, with the candidate frozen before the fresh corpus ran:

| Corpus                              | Benign allowed | Attacks withheld |
| ----------------------------------- | -------------- | ---------------- |
| Existing development                | 28/31          | 15/15            |
| Adversarial development             | 4/4            | 8/8              |
| Previously exposed joint validation | 12/12          | 12/12            |
| Fresh calibration validation        | 12/12          | 12/12            |

Full method, the exact diff and the production traces: [calibration report](docs/testing/control-assessment/calibration/REPORT.md) and [control assessment](docs/testing/control-assessment/REPORT.md).

### When Laya is unavailable

Stop the service and the gateway answers **503 `SEMANTIC_UNAVAILABLE` before it reserves a single token**. Not a fallback, not a mock, not a cached verdict, not an answer with a warning. `createDetectionPort()` returns `null` without `LAYA_API_KEY` and the engine withholds every protected operation. This is the behaviour we would most like a judge to try: it is one `pkill` away and it is the difference between a control layer and a decoration.

### Laya's honest limits, measured on our own data

Written in Laya's own spirit, because a control layer that overstates its classifier is worse than one that does not have it.

- **The held-out gate did not pass.** On a frozen 24-case set (SHA-256 `09c323bc…`), policy v1 gave ordinary benign 4/4 ALLOW, difficult benign 1/4 ALLOW, and attacks 0/4 ALLOW but **4/4 REVIEW and 0/4 BLOCK**. Benign ALLOW was 5/8 against a 6/8 target, so the small-set gate **failed**. Every attack was withheld, but by review rather than by detection. Source: `src/features/detection/J2-CALIBRATION.md`. That set is now exposed and was not re-scored under v3.
- **The semantic gate misses paraphrases.** On the 36-case benchmark, 4 of 12 attacks were answered: an auditor authority claim, a paraphrased override, a yes/no threshold probe, and an acrostic exfiltration attempt. None leaked a listed value, because retrieval scope had already excluded the records, but Laya and the verifier did not flag the phrasing. The yes/no probe is the weakest point: an oracle cannot detect an answer that narrows a hidden number, so 0 leaks there is not proof of no disclosure.
- **Three benign false positives remain**, all educational text: an explanation of excessive tool calls, a quoted injection lesson, and an output explaining prompt injection. A control layer that cannot discuss security is a real cost, and it is still withheld.
- **Difficult-benign friction is 6 of 12**, held by citation validation rather than by the classifier: a general question with no answer in the corpus is withheld instead of answered from the model's own memory. We prefer that trade and we report it as friction, not as a win.
- **Laya's own model card warns about limited synthetic training workflows and overconfidence**, and the base checkpoints score near chance zero-shot on typed decisions. We use the fine-tuned `typed-decisions` checkpoint for that reason, and we do not claim its accuracy transfers to an unseen attacker.
- **We did not measure Laya in isolation.** The latency figures below are whole-gateway, dominated by Qwen generation. A per-call classifier timing was not run.
- **Finite tests do not prove universal detection.** Every corpus here is small, ours, and now public. Further tuning needs newly written held-out cases.

---

## MCP: the layer works in both directions

The brief asks for a control layer that governs agent-to-MCP and agent-to-model traffic. We built both directions, because serving an agent and governing an agent are different problems.

**Outbound: the gateway is an MCP server.** `/api/mcp` exposes exactly two tools through the official MCP SDK, so Claude Code reaches company data through the same engine the web app uses.

| Tool              | Does                                                                      |
| ----------------- | ------------------------------------------------------------------------- |
| `search_excerpts` | Searches public-approved excerpts and returns citations plus audit traces |
| `read_excerpt`    | Reads one public-approved excerpt by UUID                                 |

Every call is governed, not proxied:

- **A scoped integration bearer token, never a session.** 43-character token, stored only as a SHA-256 hash, bound to an active actor and organisation, with an `audience` of `public`, an expiry and a revocation column. Scopes are per tool (`excerpt:search`, `excerpt:read`). The SQL retrieval audience stays `public` even when the token belongs to an administrator, so connecting an agent cannot widen what that person can reach.
- **Input and output are both assessed.** The search text goes through the gate at stage `mcp_input`; the complete returned JSON, including excerpt text, citation and source label, goes through again at `mcp_output` before the MCP callback releases anything.
- **The control head is re-checked after the call.** The token is re-resolved and the active policy and feed versions are compared with the versions the assessment ran under. A mismatch is `STATE_CHANGED` and the content is withheld, so a policy change mid-call cannot be outrun.
- **Refusals are legible to the agent.** A blocked call returns `InterLock blocked this action (CODE)` with the trace id, so the model is told it was refused instead of silently receiving nothing.
- **Bounded surface.** Origin pinned to `INTERLOCK_PUBLIC_ORIGIN`, 8 KB maximum request body, stateless, `Cache-Control: no-store`, and closed input schemas with `additionalProperties: false`.

Every successful response carries `trace_id`, `retrieval_trace_id`, `policy_version` and `feed_version`, so an answer an agent gives in a chat window can be traced back to the decision that allowed it.

**Inbound: the gateway governs the agent.** `/api/v1/guard/check` sits behind Claude Code hooks and checks the agent's own prompts and proposed tool calls before they take effect. This is the part a prompt cannot talk its way past, because the decision is made by a server the agent cannot reach with text.

| Event    | Checked                                                                              | Hard denial                                              |
| -------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `prompt` | The user prompt, 6 KB ceiling, assessed at stage `claude_prompt`                     | Over the ceiling, or the gate withholds                  |
| `tool`   | The proposed tool name, path and up to 2 KB of proposed text, at stage `claude_tool` | `TOOL_NOT_ALLOWED`, `PATH_NOT_ALLOWED`, `EDIT_TOO_LARGE` |

The deny rules in `src/shared/gateway/guard-request.ts` are deterministic and they refuse before any semantic step:

- **Tools are a closed set in code, which policy may narrow but never widen.** The effective set is `Read`, `Edit`, `Write` and the two InterLock MCP tools. Shell and network tools are not in it, so no policy edit can enable `Bash`. The policy schema additionally lists `Glob` and `Grep`, but the code ceiling does not include them, so a policy naming them still gets `TOOL_NOT_ALLOWED`. The demo session is launched with `--tools Read,Edit,Write` and never offers them, so this is a schema that is wider than the enforcement rather than a hole; it fails in the safe direction and is worth narrowing.
- **Paths must start with `src/`**, with no backslash, no NUL byte, no empty or `.` or `..` segment, and no segment beginning with a dot. That refuses `.env`, `.git/`, traversal and symlink tricks in one rule rather than by blocklist.
- **Named files are denied outright:** `package.json`, the three lockfiles, `AGENTS.md` and `CLAUDE.md`. An agent cannot edit its own instructions or add a dependency.
- **Extensions are an allow-list** of seven, intersected with the policy's list.
- **An `Edit` or `Write` whose proposed text did not arrive is denied**, so an edit too large to inspect is refused rather than waved through.

The hook runner fails closed. A supervisor spawns the worker with a 25-second watchdog; on timeout it kills the worker, writes `InterLock watchdog blocked this action.` and exits 2, which is Claude Code's deny code. Hook input is capped at 12 KB and worker output at 1 KB. The idempotency key is derived as a stable hash of token, stage and event id, so a replayed hook event cannot double-charge a budget or produce a second audit record.

**What the guard is not.** Stated plainly, because overclaiming here would be the worst kind. Command hooks can be skipped or killed by the host, so this is not an unbypassable admission controller; the exit-2 denials, the HTTP deadline, the independent supervisor and the host timeout reduce that risk rather than remove it. The installed Claude binary, the operator and the hook installation are trusted. A differently configured session is outside the boundary. The restricted Claude profile and the server-side permissions are independent limits, so **the gateway still protects company data even with no hooks at all**, which is the property that matters. The guard does not control the agent's total token bill, its final answer text, other applications, other MCP servers, or every code vulnerability.

**Release status, honestly.** The code is merged and unit-tested, and migration `supabase/migrations/20261004034000_guard_finalization.sql` is applied and recorded. It is not released: both endpoints read `policy.client_guard` and return `POLICY_UNAVAILABLE` when it is absent, so until policy v4 is activated they refuse everything. The frozen [ten-question MCP set](docs/testing/mcp-evaluation.json) is marked `frozen-before-live-run` and has not been run. The full release order, the four-minute judge path and every gate are in the [MCP guard runbook](docs/team/mcp-guard-runbook.md). If the gates are not passed by demo time, we present the web runbook and describe this as built but not activated.

## Hybrid defence: what is deterministic and what is AI

| Control                               | Deterministic | AI  | Notes                                                                                                              |
| ------------------------------------- | :-----------: | :-: | ------------------------------------------------------------------------------------------------------------------ |
| Identity, role, deal membership       |      ✅       |     | Trusted server records only; never a caller or model claim                                                         |
| Signature match from an external feed |      ✅       |     | Literal substrings and dot-boundary hostnames                                                                      |
| Secret and PII patterns               |      ✅       |     | PEM private keys, `sk-`, `sk_live_`, `ghp_`, `AKIA…`, `sb_secret_`, `xox[abp]-`, email addresses                   |
| Evasion normalisation                 |      ✅       |     | NFKC, zero-width characters stripped, whitespace collapsed, so spacing and homoglyph tricks cannot split a literal |
| Instruction manipulation              |      ✅       | ✅  | Signature **and** Laya **and** bounded Qwen verification                                                           |
| Sensitive exposure                    |      ✅       | ✅  | SQL scope and output check **and** Laya                                                                            |
| Resource abuse                        |      ✅       | ✅  | Hard call, turn, repetition and time ceilings **and** Laya                                                         |
| Budgets and rate limits               |      ✅       |     | Atomic SQL reservation; unknown usage is never zero                                                                |
| Citation validity                     |      ✅       |     | Tags validated against supplied context and rewritten                                                              |
| Role limits on writes                 |      ✅       |     | The model proposes; `src/shared/gateway/client-rules.ts` decides                                                   |
| Audit before effect                   |      ✅       |     | Written before disclosure, in the same transaction as the effect                                                   |

The pattern list is illustrative coverage, not universal DLP, and it is commented as such in the source. The matched value never leaves the detector: a finding carries a code, category, severity, stage and locator, so an audit record can say `SECRET_TOKEN at row:1:line:3` without storing the secret.

---

## Centralized policy engine

One JSON document, versioned in Postgres, is the only source of control settings. No threshold, budget or model name is hard-coded in feature logic. [Sample configuration](docs/contracts/policy.example.json), [schema](docs/contracts/policy.schema.json).

| Section           | Governs                   | Examples                                                                                                                                                                         |
| ----------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`            | Strictness level          | `balanced` holds the review band for a human; `strict` blocks it                                                                                                                 |
| `semantic`        | AI gate                   | Required or not, checkpoint name, context and window tokens, overlap, max windows, timeout, and a `review` plus `block` threshold per risk                                       |
| `execution`       | Allowed models and agency | `generation_model`, thinking off, context and output tokens, `max_model_turns`, `max_tool_calls`, `max_identical_tool_calls`, `max_elapsed_ms`, `allowed_tools` as a closed enum |
| `imports`         | Untrusted input           | Byte, row, page, character and processing ceilings, allowed formats, the one allowlisted connector dataset                                                                       |
| `budgets`         | Spend and resources       | Per-actor and per-organisation generation tokens and milliseconds, semantic tokens, **commercial micro-USD**, requests per minute, max active runs                               |
| `comparison_rate` | Cost reporting            | An explicitly labelled illustrative rate, never presented as an invoice                                                                                                          |
| `client_guard`    | The agent guard, optional | Profile name, prompt assessment required, the tool allow-list, editable root and extensions, maximum prompt and edit bytes. Absent means both agent endpoints refuse everything  |
| `retention`       | Data lifetime             | Raw days, audit days, export minutes, review days                                                                                                                                |

Three properties make this a control and not a settings file:

1. **Strictness is a dial with a floor.** Every numeric limit has a schema maximum. A policy may lower a limit; it can never raise one past the ceiling the code enforces. Removing a control is not expressible: `semantic.required` and the hard invariants cannot be switched off to buy an ALLOW.
2. **Relationships are validated, not just types.** `review < block` for all three risks, `overlap < window`, input plus template plus output tokens within the context, provider timeout within the elapsed ceiling, identical tool calls within total tool calls, and every per-actor budget at or under its per-organisation budget.
3. **Updates are atomic and auditable.** Admin only, exact `expected_version + 1`, idempotency key, SQL locks the head and writes snapshot plus audit in one transaction. A retry returns the original activation instead of double-applying.

Both local and commercial budget units exist. Local units are generation tokens and milliseconds against the Mac. The commercial path is a labelled micro-USD simulator with its own ceilings, so budget enforcement is tested on both unit types without a paid subscription, which the brief does not provide.

---

## Historical attack mitigation and model supply chain

| Attack class from the brief                        | What stops it here                                                                                                                                                                                                                  | Where                                                                                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Known exploit signatures, externally fed           | A versioned feed with an expiry. Indicator kinds `literal` and `domain`; categories `prompt_injection`, `exfiltration`, `unsafe_code`, `resource_abuse`; per-indicator action `REVIEW` or `BLOCK`, up to 100 indicators             | [feed example](docs/contracts/threat-feed.example.json), [schema](docs/contracts/threat-feed.schema.json), `src/shared/gateway/checks.ts` |
| Malicious code execution                           | Model output is never evaluated, shelled out or templated into a command. The model's only write path emits one JSON plan that is validated and projected onto a closed schema, then re-decided by role rules                       | `src/shared/gateway/client-act.ts`                                                                                                        |
| Unsafe deserialization                             | No YAML, pickle or arbitrary object graph is ever parsed. Every input is CSV lines or JSON validated by Ajv against a schema with `additionalProperties: false`                                                                     | `src/shared/contracts/validate.ts`                                                                                                        |
| Supply-chain exploits on model repositories        | The pinned Laya checkpoint revision and the pinned Ollama model digest are enforced by the adapters on every health read. Any other value is a 503. The bridge exposes fixed routes only, with no caller-chosen model, path or host | `src/shared/contracts/runtime-manifest.json`, `src/features/detection/providers/laya.ts`                                                  |
| Exfiltration to an attacker-controlled destination | Domain indicators match on dot boundaries, and the model has no network egress of its own                                                                                                                                           | `src/shared/gateway/checks.ts`                                                                                                            |
| Stale or emptied feed                              | A feed has `expires_at` and `verify:release` fails on an expired one. An invalid feed cannot silently clear checks                                                                                                                  | `src/shared/gateway/controls.ts`                                                                                                          |

A stale feed is the failure mode we care about most, because an empty indicator list looks exactly like a clean one. The feed carries a version and an expiry, and the preflight refuses to start a demo on an expired feed.

---

## OWASP Top 10 for LLM Applications

Honest mapping, with the gaps named. This is where our controls land, not a claim of complete coverage.

|       | Risk                             | Status             | Control                                                                                                                                                                                                           |
| ----- | -------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM01 | Prompt injection                 | Partial            | Signatures, Laya, bounded Qwen verification; 4 of 12 benchmark attacks were not flagged                                                                                                                           |
| LLM02 | Sensitive information disclosure | Covered            | SQL scope before retrieval, output check, PII patterns, public-only PDF export, identical 404 for absent and forbidden ids                                                                                        |
| LLM03 | Supply chain                     | Covered for models | Pinned checkpoint revision and model digest, fixed bridge routes, allowlisted connector dataset. We do not scan npm dependencies                                                                                  |
| LLM04 | Data and model poisoning         | Partial            | Imports quarantined, decided per line, published only through human review with a recorded editor, audience and reason. Review approval is not in this build                                                      |
| LLM05 | Improper output handling         | Covered            | Answer buffered and checked before display; citations validated against supplied context and rewritten                                                                                                            |
| LLM06 | Excessive agency                 | Covered            | Closed `allowed_tools` enum, at most one action per Act run, role fee limits, destructive actions always held. For a coding agent, the guard denies shell and network tools outright and confines edits to `src/` |
| LLM07 | System prompt leakage            | Covered by design  | No enforcement lives in a prompt, so leaking it grants nothing. Permissions are in code and SQL                                                                                                                   |
| LLM08 | Vector and embedding weaknesses  | Not applicable     | No vector search or embeddings in this build                                                                                                                                                                      |
| LLM09 | Misinformation                   | Partial            | Citation validation, conflicting figures kept explicit, honest evidence limitation when the corpus has no answer                                                                                                  |
| LLM10 | Unbounded consumption            | Covered            | Atomic reservations before the call, call and turn and repetition and time ceilings, per-minute and active-run caps, unresolved usage never recorded as zero                                                      |

Sources we read while designing the gate, and what each changed: [control assessment, Primary research](docs/testing/control-assessment/REPORT.md) covers the Laya model card, NVIDIA NeMo self checks, Meta LlamaFirewall, LiteLLM guardrails, PromptArmor and AgentDojo. LlamaFirewall is why the policy engine combines separate scanners rather than one blended score; LiteLLM is why output is buffered and checked after the call; PromptArmor is why we did not trust a contextual verifier on its own.

---

## Proof

### Held-out adversarial benchmark

36 cases written and committed **before** any run, then executed against the production deployment at commit `cd0c855`, policy v3, on 2026-10-04 between 02:50 and 02:56 UTC. Cases pinned by SHA-256, per-case metadata in [results.json](docs/testing/benchmark/results.json), method and limits in the [benchmark report](docs/testing/benchmark/REPORT.md). Reproduce with `npm run benchmark:gateway`.

| Case class       |  n  | ALLOW | REVIEW | BLOCK |
| ---------------- | :-: | :---: | :----: | :---: |
| benign           | 12  | 12/12 |  0/12  | 0/12  |
| difficult benign | 12  | 6/12  |  6/12  | 0/12  |
| attack           | 12  | 4/12  |  1/12  | 7/12  |

**Protected values leaked: 0 of 36.** The oracle whole-word matches the restricted figures and code names against every answer. Four attacks were answered, which is four more than the target, and the Laya limits section says exactly which four and why.

Latency on the same run: cold request 7718 ms gateway time; warm gateway p50 4082 ms, p95 5874 ms over n=35; wall clock p50 5102 ms, p95 6793 ms. That includes the HTTPS bridge to the Mac hosting both models and Vercel cold starts. No latency target is claimed, and generation dominates the budget.

### Governed writes, verified live

Run against production on 2026-10-04 at 03:39 UTC, read back from each actor's audit, then repeated in a headless browser at 1440 px and 375 px. Trace ids in the [release evidence](docs/testing/release-evidence.md). The analyst fee limit is 20%, the admin limit is 50%, and a delete always needs a second person.

| Request                                    | Actor    | Outcome | Reason code                            |
| ------------------------------------------ | -------- | ------- | -------------------------------------- |
| Create client                              | analyst  | ALLOW   | none                                   |
| Create client                              | employee | BLOCK   | `action:role_not_permitted`            |
| Create client with an injected instruction | analyst  | BLOCK   | `client_signature:SIG-001`             |
| Fee +10%                                   | analyst  | ALLOW   | none                                   |
| Fee +30%                                   | analyst  | REVIEW  | `action:change_exceeds_role_limit`     |
| Fee +30%                                   | admin    | ALLOW   | none                                   |
| Fee +200%                                  | admin    | REVIEW  | `action:change_exceeds_role_limit`     |
| Delete client                              | admin    | REVIEW  | `action:destructive_requires_approval` |
| List clients                               | employee | ALLOW   | no fee, version or notes in any row    |
| List clients                               | reviewer | 404     | a role that cannot list cannot probe   |

A held action writes nothing: the fee is unchanged on re-list and the client stays listed after a held delete.

### Access-control probes

From production, with trace ids recorded for each: a foreign run, trace and excerpt all return an identical generic 404 whose body is byte-identical to a random UUID's once ids are masked; `role`, `actor_id` and `organisation_id` in a request body are 400 `INVALID_INPUT`; a missing `Origin` header is 403; no session is 401. Full table in the [release evidence](docs/testing/release-evidence.md).

### Control matrix

```
npm run test:controls
```

[control-matrix.json](docs/testing/control-matrix.json) maps each control in the brief to existing vitest tests by their full name, never by line number: at least one test that proves the allowed path and at least one that proves the BLOCK, REVIEW or 503 path. The script runs only those test files offline, with no `.env.local`, in a few seconds. A row is **PASS** only when every mapped test ran and passed. A mapped test that was renamed, deleted, skipped, marked todo or failed turns its row **FAIL**, and the command exits 1. The not-implemented rows are listed for honesty and never change the exit code.

M9–M11: attack surface closed by construction (no deserialization, no code-execution tools, pinned models); the tests prove those boundaries hold. We do not claim malware detection.

Real run on this branch, based on `origin/main` at `7637c83`: rows 15/15 PASS · 18 test files · 304/304 tests passed · 5 not implemented.

| ID  | PDF                             | Control                                                                                             | ALLOW proof                                                                                                                                                                                                       | BLOCK/REVIEW/503 proof                                                                                                                                                                                                                                                                                                                                                                                                                                | Result |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M1  | Policy management               | Central policy; a new version applies to the next request; strict turns the review band into BLOCK  | shared/gateway/policy-update: policy update activates a validated new version with trusted identity and content hashes                                                                                            | shared/gateway/checks: decide maps the review band to BLOCK only in strict mode; shared/gateway/chat: executeChat 17. a version mismatch is unavailable before any claim; shared/gateway/policy-update: policy update rejects analyst before persistence                                                                                                                                                                                              | PASS   |
| M2  | Data ingestion: block vs redact | Import blocks or redacts unsafe units and publishes only clean facts                                | shared/gateway/imports: executeImport publishes an all-clean batch as approved/ALLOW, one Laya call per non-blank line                                                                                            | shared/gateway/imports: executeImport removes a signature-blocked unit without a Laya call: partial/REDACT with its locator; shared/gateway/imports: executeImport (upload) MIX-01: removes the contact, credential and injected lines and publishes the fact: partial/REDACT; shared/gateway/imports: executeImport (upload) removes every line of a row holding a PEM block, key body included: BLOCK                                               | PASS   |
| M3  | Threat feed / signatures        | Feed signatures match after NFKC, zero-width removal and on subdomains                              | shared/gateway/checks: matchSignatures needs a dot boundary for domains                                                                                                                                           | shared/gateway/checks: matchSignatures matches SIG-001 after NFKC and case folding; shared/gateway/checks: matchSignatures is not evaded by extra whitespace or zero-width characters; shared/gateway/checks: matchSignatures matches SIG-002 on a subdomain inside a URL; shared/gateway/chat: executeChat 2. a signature BLOCK calls no provider and reserves nothing                                                                               | PASS   |
| M4  | Output: secrets / PII           | Secrets and contact data in model output are blocked; the value never leaves                        | shared/gateway/checks: matchSensitive finds nothing in a benign sentence or a word that only contains a prefix                                                                                                    | shared/gateway/chat: executeChat 11c. a credential in the answer is a BLOCK at output_signature; the token never leaves; shared/gateway/checks: matchSensitive finds keys, token prefixes and emails with category and code, never the value; shared/gateway/checks: matchSensitive covers each conventional prefix and survives a zero-width split                                                                                                   | PASS   |
| M5  | Authentication / access control | Origin check, 401 without session, strict body, identical 404 for unauthorised ids                  | shared/gateway/http: handle runs with the parsed body and key, with no-store                                                                                                                                      | shared/gateway/http: handle rejects a foreign or missing Origin before identity; shared/gateway/http: handle maps no session to 401 and an identity outage to 503, never ALLOW; shared/gateway/http: handle validates key, content type, size and strict body before running; shared/gateway/excerpts: readExcerpt answers an id outside the actor's permissions exactly as an id that does not exist                                                 | PASS   |
| M6  | Semantic risk assessment        | Laya bands: ALLOW below review, REVIEW band (Qwen verification), BLOCK above; policy BLOCK is final | shared/gateway/chat: executeChat 1. ALLOW runs the full sequence and releases only after finalize; shared/gateway/chat-verification: sends only the policy REVIEW band to the verifier, and passes ALLOW through  | shared/gateway/chat: executeChat 4. the review band holds in balanced mode and blocks in strict mode; shared/gateway/chat: executeChat 3. a semantic BLOCK on the input never generates; shared/gateway/chat-verification: keeps a policy BLOCK final below the verification ceiling (no verifier call); shared/gateway/chat: executeChat verification cannot clear a policy-block denial                                                             | PASS   |
| M7  | Budgets / cost control          | Reserve before the provider call; an exhausted budget blocks first; unknown usage is not zero       | shared/gateway/standalone-check: standalone guard assessment records intent and reserves before live assessment, then persists before allow                                                                       | shared/gateway/chat: executeChat 13. an exhausted budget blocks before any provider call; shared/gateway/chat: executeChat 6. a detection failure leaves the reservation unresolved; shared/gateway/metrics: the usage totals lets one unknown make the total unknown, rather than understating it                                                                                                                                                    | PASS   |
| M8  | Model supply chain              | Pinned Laya revision and Qwen digest; a mismatch withholds                                          | features/detection/ports: G2 detection factory returns schema-valid single-window metadata and genuine aggregate usage                                                                                            | shared/gateway/chat: executeChat 12. a wrong Laya revision or Qwen digest is unavailable; features/detection/ports: G2 detection factory wrong revision blocks inference; revision drift retains consumed usage; features/detection/ports: G2 generation factory rejects malformed output and wrong digest safely                                                                                                                                     | PASS   |
| M9  | File handling                   | File type decided by content: CSV accepted; PDF and binary (pickle) refused with 415                | shared/gateway/imports: startUpload creates an unverified source, quarantines the raw bytes, then a pending run: 202                                                                                              | shared/gateway/imports: startUpload refuses a PDF by its magic bytes with an honest 415, whatever its name; shared/gateway/imports: startUpload refuses pickle bytes named .csv with 415 UNSUPPORTED_FILE before storing anything                                                                                                                                                                                                                     | PASS   |
| M10 | Tool use                        | No code-execution tools: model tool calls refused; shell, hidden paths and traversal denied         | app/api/v1/guard/check/route: accepts a bounded prompt from a hook-scoped bearer and returns the gateway envelope                                                                                                 | shared/gateway/chat: executeChat 10. a proposed tool call is refused; shared/gateway/guard-request: strict guard inputs allows small source edits but denies shell, hidden paths, traversal and protected config; app/api/v1/guard/check/route: marks shell execution as a deterministic denial and sends no shell command to the model                                                                                                               | PASS   |
| M11 | Coding agent guard              | Agent cannot modify dependency manifests/config                                                     | shared/gateway/guard-request: strict guard inputs allows small source edits but denies shell, hidden paths, traversal and protected config                                                                        | shared/gateway/guard-request: strict guard inputs allows small source edits but denies shell, hidden paths, traversal and protected config; shared/gateway/guard-request: strict guard inputs rejects caller identity, unknown fields and oversized edits                                                                                                                                                                                             | PASS   |
| M12 | MCP / integrations              | MCP exposes public data only, behind a scoped bearer token                                          | app/api/mcp/route: InterLock MCP route using the official SDK client discovers only the two fixed tools and calls both through a public credential                                                                | app/api/mcp/route: InterLock MCP route using the official SDK client requires bearer identity before discovery and rejects foreign origins; app/api/mcp/route: InterLock MCP route using the official SDK client never emits a public excerpt when its output assessment refuses it; shared/auth/integration-token: integration bearer identity rejects malformed, missing, wrong-scope, revoked, expired and inactive credentials                    | PASS   |
| M13 | Agent actions                   | Client actions: role limits, delete held for approval, injection in action fields blocked           | shared/gateway/client-act: Act mode happy path: an analyst's create is ALLOW, written once under the run id                                                                                                       | shared/gateway/client-act: Act mode an employee's create is BLOCK from the role rules, with the refusal's trace; shared/gateway/client-act: Act mode an admin's delete is REVIEW and never deletes; shared/gateway/client-act: Act mode an analyst's +30% fee change is REVIEW, held by clients.ts, nothing written; shared/gateway/clients: client_create blocks an injection or a contact in any text field with its reason code and writes nothing | PASS   |
| M14 | Fail-closed                     | A missing or failing required component answers 503 with no reservation                             | shared/gateway/chat: executeChat 1. ALLOW runs the full sequence and releases only after finalize                                                                                                                 | shared/gateway/chat: executeChat 7. a missing detection adapter is 503 with no reservation; shared/gateway/chat: executeChat 7b. a missing generation adapter is 503 with no reservation; shared/gateway/imports: executeImport without a composed detection adapter: 503 before any reservation, failed, nothing published; shared/gateway/unavailable: unavailableResponse returns a valid 503 envelope with no decision                            | PASS   |
| M15 | Reporting / audit               | Audit export capped and scoped; blocked, loop and review counters kept separate                     | shared/gateway/auditExport: exportAudit answers CSV with a trace id, own scope and the current UTC day by default; shared/gateway/metrics: the counters keeps blocked attempts, loop stops and review cases apart | shared/gateway/auditExport: exportAudit exports exactly the cap and refuses one more with a narrowing instruction; shared/gateway/auditExport: exportAudit gives an admin the organisation, and refuses it to anyone else; shared/gateway/metrics: the response refuses a window larger than one read can total                                                                                                                                       | PASS   |

Not implemented, stated rather than hidden:

| ID  | PDF              | Item                          | Note                                                                                                                        |
| --- | ---------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| N1  | Output redaction | Redaction inside chat answers | Unsafe chat output is withheld (BLOCK/REVIEW), never partially redacted; redaction exists only on import.                   |
| N2  | Model governance | Model allowlist               | The generation model is a pinned constant, not a configurable allowlist.                                                    |
| N3  | Threat feed      | External feed push            | POST/PUT /feeds answers 503; the feed is read-only in this build.                                                           |
| N4  | PII detection    | PII beyond email              | Phone, IBAN, PESEL and card numbers are not detected; only email contact data is.                                           |
| M16 | Telemetry        | Per-stage timing              | Per-stage timing not asserted by a test; the audit test asserts the stage sequence and only the generation call's duration. |

### Verified commands

Run on this branch merged with `origin/main` at `42a5324` on 2026-10-04:

```
npm run check
# tooling 33/33, vitest 1084/1084 in 79 files, production build, exit 0
# also exit 0 from a fresh worktree with npm ci and no .env.local
```

```
npm run dev
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/health          # 200
curl -s -X POST http://localhost:3000/api/v1/chat -H 'content-type: application/json' \
  -H 'origin: http://localhost:3000' -d '{"question":"What is AsterCloud revenue?"}'
# {"decision":"BLOCK", ... "error":{"code":"UNAUTHENTICATED", ...}, "trace_id":"..."}
```

Recorded earlier and **not re-run for this document**, because it writes to the shared Supabase project and test writes are frozen before judging: `npm run test:db` 59/59 on 2026-10-04.

---

## Security reporting and dashboards

Two audiences, two views, one audit trail. Every protected operation writes an audit record **before** its effect, in the same transaction, so a record cannot be missing for an action that happened.

**For a security engineer.** A trace page per operation: stage, decision, reason codes, findings with their category, severity and locator, the Laya scores per stage, the Qwen verdict and digest when verification ran, measured token and millisecond usage, policy and feed version, and completion status. Protected text is excluded from every projection by contract, so an audit record names `SECRET_TOKEN at row:1:line:3` without storing the secret. `GET /api/v1/audit/export` returns CSV for offline analysis, access-recorded, and the export is withheld whole if any row fails its contract rather than exported partially.

**For management.** An organisation dashboard with blocked attempts, loop stops counted separately from security refusals, decisions by outcome, generation and semantic token usage, elapsed milliseconds, outstanding reservations, and an explicitly labelled illustrative commercial equivalent in micro-USD. Unmeasured values read "Not measured" or "N/A" rather than zero, and an unresolved reservation is reported as unresolved rather than charged as nothing.

Counters are computed from persisted rows over a window, never from the most recent page of a list, because presenting a page as a total measures the page. A window that would exceed the 1000-row cap is refused with a narrowing instruction rather than silently truncated.

Each actor sees only their own traces; the organisation view is admin only, and an employee asking for it gets an honest 403. One actor cannot read another's trace, and the refusal is a 404 that does not confirm the trace exists.

---

## Status

Nothing here is mocked for the demo. "Not in this build" means the route answers 503 or an explicit refusal, never a fabricated success.

| Area                                                     | State             | Note                                                                                                                                                                                                                                |
| -------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gateway engine, policy v3, deterministic checks          | Working           | One engine behind every `/api/v1` route; 24 documented paths                                                                                                                                                                        |
| Live Laya classifier, pinned revision                    | Working           | Real service behind an authenticated HTTPS bridge; never a stub                                                                                                                                                                     |
| Qwen contextual verification of the REVIEW band          | Working           | Bounded to balanced chat; cannot clear a deterministic finding                                                                                                                                                                      |
| Fail-closed on a missing control                         | Working           | 503 before any reservation; the easiest thing for a judge to test                                                                                                                                                                   |
| Role, deal and classification scoping                    | Working           | Enforced in server code and again in SQL; 59 database tests                                                                                                                                                                         |
| Centralized versioned policy with live admin update      | Working           | `PUT /policy` with CAS, relationship validation and hard ceilings                                                                                                                                                                   |
| Atomic budgets, local and commercial units               | Working           | Concurrent reservations cannot overspend; unknown usage never zero                                                                                                                                                                  |
| CSV and allowlisted connector import, per-line redaction | Working           | Private quarantine, then approved excerpts, a REDACT partial, or a held candidate                                                                                                                                                   |
| Chat with validated and rewritten citations              | Working           | Conflicting figures stay explicit                                                                                                                                                                                                   |
| Audit, personal traces, admin dashboard, CSV export      | Working           | Protected text excluded from every projection                                                                                                                                                                                       |
| Client actions and Act mode                              | Working           | One chat input. A client-side router picks Ask or Act for the user's convenience only, and the gateway applies the same rules on either path. The model proposes one JSON plan; role rules decide. Verified live and in the browser |
| Public sanitised PDF export                              | Working           | Public-approved excerpts only, then an output check                                                                                                                                                                                 |
| Trace link for a client action                           | Partial           | Returned 503 during QA; fixed in `src/shared/gateway/audit.ts` with a regression test, not yet re-verified on the deployment                                                                                                        |
| Semantic gate against paraphrased attacks                | Partial           | 4 of 12 benchmark attacks auto-allowed; none leaked a value                                                                                                                                                                         |
| Difficult-benign friction                                | Partial           | 6 of 12 held by citation validation when the corpus has no answer                                                                                                                                                                   |
| Review approval flow                                     | Partial           | A candidate is created and visible; approving it is not in this build                                                                                                                                                               |
| Threat-feed push endpoint                                | Not in this build | `GET /feeds` reads the active feed; `POST`/`PUT` answer 503                                                                                                                                                                         |
| PDF upload                                               | Not in this build | Refused with `UNSUPPORTED_FILE` and a message, never silently parsed                                                                                                                                                                |
| MCP server for Claude Code, two tools                    | Built, gated      | `/api/mcp` on the official SDK. Scoped token, input and returned payload both assessed, control head re-checked after the call. Unit-tested; the live release gates below are not all passed                                        |
| Guard over Claude Code's own prompts and tool calls      | Built, gated      | `/api/v1/guard/check` behind Claude Code hooks. Hard-denies shell, network, paths outside `src/`, dotfiles and oversized edits before any effect                                                                                    |
| MCP and guard live release                               | Not yet released  | Migration `20261004034000` is applied, but both endpoints answer `POLICY_UNAVAILABLE` until policy v4 carries `client_guard`. v4 activation, the frozen live run and the Claude Code rehearsal are not recorded as done             |
| High availability                                        | Not claimed       | Both models run on one Mac that must stay awake and connected                                                                                                                                                                       |

---

## Quickstart

Node 24 and npm 11.11.0 (`.nvmrc` pins the Node version).

```
git clone https://github.com/Bartek201301/hackyeah-2026.git
cd hackyeah-2026
npm ci
npm run check
```

`npm run check` runs contract type generation, format, typecheck, lint, module boundary rules, the tooling tests, 1084 unit tests and a production build. It needs no credentials and no model services: this exact sequence was run from a fresh checkout with no `.env.local` present and exited 0.

To run the application, put the project's Supabase values in `.env.local`, copied from `.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
APP_ORIGIN=http://localhost:3000
```

```
npm run dev
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/health
```

A `200` means the app is up and reached the database. Signing in needs one of the four prepared accounts. Chat, import and Act mode additionally need `LAYA_API_KEY` plus Laya and Ollama reachable, either on loopback or through `MODEL_BRIDGE_URL` and `MODEL_BRIDGE_TOKEN`; without them every model path answers 503 rather than a guess. Model service setup, the full variable contract and recovery are in [setup](docs/team/setup.md). `npm run verify:release` checks the whole runtime before a demo.

The quickest honest path for a reviewer is the hosted instance with a prepared account.

**Integrating your own application.** The control layer is an HTTP API, not a library you have to adopt. 25 paths are specified in [OpenAPI](docs/contracts/openapi.json); `npm run contracts:types` generates the types and `src/shared/contracts/client.ts` is a thin typed client over `openapi-fetch`. An application sends a request and reads one envelope: `decision`, `reasons`, `policy_version`, `feed_version`, `semantic`, `usage`, `timings`, `data`, `error`, `trace_id`. Nothing else needs to change.

---

## Architecture as built

```mermaid
flowchart TB
  A["Web app, or any client of the 25 OpenAPI paths"]
  AG["Coding agent: Claude Code"]
  A --> R["Thin route handler: origin, actor, idempotency key, closed-schema body"]
  AG -->|"MCP: search_excerpts, read_excerpt"| MC["/api/mcp: scoped token, input and output both assessed"]
  AG -->|"hooks: prompt and proposed tool call"| GD["/api/v1/guard/check: closed tool set, src-only paths"]
  MC --> R
  GD --> R
  R --> S1

  subgraph E["Gateway engine: the only place a decision is made"]
    direction TB
    S1["1-3 Identity, role and deal from trusted server records"]
    S2["4-5 Deterministic: feed signatures, secret and PII patterns"]
    S3["6-7 Semantic: Laya scores, then Qwen for the REVIEW band only"]
    S4["8 Retrieval scoped by role, deal and classification, in SQL"]
    S5["9 Generate, validate and rewrite citations, check the output"]
    S6["Audit committed before anything is disclosed"]
    AC["Act path: one JSON plan, schema-validated, role rules decide"]
    S1 --> S2 --> S3 --> S4 --> S5 --> S6
    S3 --> AC --> S6
  end

  S3 --> M["Injected detection and generation ports"]
  S5 --> M
  M --> BR["Authenticated HTTPS bridge, or loopback on the Mac"]
  BR --> LA["Laya typed-decisions, pinned revision"]
  BR --> OL["Ollama qwen3:8b, pinned digest"]

  DB[("One Supabase project: Postgres holds policy, feed, records, reservations and audit; two private buckets hold originals and exports")]
  S6 --> DB
  S4 --> DB
  DB -->|"active policy and feed version"| S1
  DB --> PR["Sanitised projections: own traces, admin aggregates"]
  PR --> A
  S6 -->|"trace id, policy and feed version"| MC
  GD -.->|"exit 2 denies the action"| AG
  E -.->|"any required control unavailable"| F["503: nothing reserved, nothing disclosed"]
```

Trust boundaries, in the order a request crosses them: browser to server (every body, upload, tool argument and model output untrusted); gateway to database (privileged credentials can bypass RLS, so server code checks organisation, actor, role and deal on every operation, and SQL functions enforce the atomic invariants); gateway to model bridge (server-only bearer token, fixed host and routes, bounded JSON, no caller-chosen model or path, and the bridge holds no database key); raw data to approved excerpt (provenance and immutable version retained, classification independent of processing status, semantic scores cannot change permissions); model output to user (citations validated against supplied context, output checked before exposure); logs to dashboards (safe reason codes and metrics only, never prompts, secrets, raw text or denied document titles).

The engine in `src/shared/gateway/**` is the only place a decision is made. Routes under `src/app/api/v1/**` are thin: one shared entry resolves origin, actor, idempotency key and body, then calls the engine. Feature areas each expose a single index module and never import one another; the detection implementation is injected at `src/app/api/v1/composition.ts`. `npm run check:rules` fails the build if a boundary is crossed.

All 12 migrations are applied and recorded in [supabase/APPLIED.md](supabase/APPLIED.md). The last recorded catalog read found RLS on for all 21 public tables then present, the browser holding SELECT on exactly three projection tables, and no `SECURITY DEFINER` function; migration L added the `clients` table under the same rule.

---

## Challenge mapping

### Evaluation criteria

| Criterion                                            | Weight | What we built                                                                                                                                                  | Evidence                                                                                                                                                                  |
| ---------------------------------------------------- | :----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Robustness of the solution and quality of guardrails |  30%   | Ten-stage ordered gate, deterministic and AI in series, neither able to approve alone; fail-closed on any missing control                                      | [Benchmark](docs/testing/benchmark/REPORT.md), [calibration](docs/testing/control-assessment/calibration/REPORT.md), [held-out](src/features/detection/J2-CALIBRATION.md) |
| Architecture and performance efficiency              |  20%   | Six trust boundaries, atomic SQL accounting, single-forward-pass classifier, measured cold and warm latency with sample sizes                                  | [Architecture](docs/product/architecture.md), benchmark latency table                                                                                                     |
| Security reporting                                   |  20%   | Audit before effect, per-stage trace detail with locators, CSV export, management metrics with labelled estimates and unresolved usage                         | `src/shared/gateway/audit.ts`, `src/shared/gateway/auditExport.ts`, `src/shared/gateway/metrics.ts`, `src/features/audit/`                                                |
| Completeness of the self-testing suite               |  15%   | 1084 unit tests in 79 files with positive and negative cases, 33 tooling tests, 59 database and RLS tests, 36-case held-out benchmark, live classifier corpora | The judge table at the top                                                                                                                                                |
| Practical implementability and scalability           |  15%   | HTTP API with OpenAPI and a generated typed client, policy swappable without redeploy, model behind a port interface, documented recovery                      | [OpenAPI](docs/contracts/openapi.json), `src/shared/gateway/ports.ts`, [runbook](docs/demo/runbook.md)                                                                    |

### Formal requirements

| #   | Requirement                                                                  | Status  | Where                                                                                            |
| --- | ---------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| 1   | Centralized policy engine: controls, thresholds, allowed models, budgets     | Done    | [policy.example.json](docs/contracts/policy.example.json), `src/shared/gateway/policy-update.ts` |
| 2a  | Deterministic controls: patterns for PII and secrets, auth and access checks | Done    | `src/shared/gateway/checks.ts`, `src/shared/auth/actor.ts`, `src/shared/gateway/retrieval.ts`    |
| 2b  | Semantic AI-based controls                                                   | Done    | Laya `typed-decisions` plus bounded Qwen verification                                            |
| 3   | Budget and resource governance, local and commercial                         | Done    | `budgets` section, atomic SQL reservations, micro-USD simulator                                  |
| 4   | Historical attack mitigation from an external signature source               | Partial | Feed read and enforced; **push endpoint not in this build**                                      |
| 5   | Security reporting and exportable audit logs                                 | Done    | Trace detail, admin metrics, `GET /audit/export`                                                 |
| 6   | Self-testing suite, positive and negative                                    | Done    | `npm run check`, `npm run test:db`, `npm run benchmark:gateway`                                  |

### Expected outcomes

| Outcome                                                                 | Status                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional control layer developers can integrate                       | Done: 24-path HTTP API, OpenAPI contract, generated typed client                                                                                                       |
| Architecture diagram                                                    | Done: above, as built, including the MCP and guard arms                                                                                                                |
| Documented sample configuration with strictness levels and budget rules | Done: `balanced` and `strict`, per-risk review and block thresholds, budget ceilings on tokens, time, commercial units, request rate and concurrent runs               |
| Interactive dashboard with controls, posture, blocked threats and cost  | Done: personal and organisation views, labelled estimates                                                                                                              |
| Executable test suite including budget limits and exploit mitigation    | Done: budget races in `test:db`, exploit cases in the unit suite and the live benchmark                                                                                |
| Agent to agent, app to agent, agent to MCP, agent to model              | App to gateway to model and governed agent writes are live. Agent to MCP and the guard over the agent itself are built and unit-tested, pending the v4 activation gate |

---

## Decisions and tradeoffs

**The model proposes, the gateway retrieves and decides.** We gave up open agentic tool loops: retrieval is never model-driven, and in Act mode the model emits one JSON plan it cannot execute. In exchange a restricted record never enters model context, which is why the four auto-allowed benchmark attacks still leaked nothing, and a fee change past a role limit is held even when the model asked for it. For a 19 hour build, a control you can prove beats a capability you have to defend.

**Two models in series, one of which cannot generate.** Laya decides fast and cannot hallucinate a verdict; Qwen only resolves the uncertain band and only for chat. We gave up the better benign pass rate an unrestricted verifier showed, because the same verifier missed 2 of 8 adversarial cases. A gate that is right more often on friendly input and wrong on hostile input is the wrong trade for a control layer.

**The classifier runs locally behind an authenticated tunnel.** We gave up availability: one sleeping laptop takes the demo down, and we say so rather than hiding it. In exchange the assessment is real, every call is free, no company text leaves the machine, and the brief's no-paid-API constraint is satisfied by design rather than by a mock.

**Atomic invariants live in SQL, not in application code.** We gave up portability away from Postgres. In exchange two concurrent requests cannot overspend a ceiling, and privileged server code that could bypass RLS still has to pass the same function checks.

---

## What we would build next

1. Close the semantic gap the benchmark exposed. The four auto-allowed phrasings are a training set, not an embarrassment to hide, and Laya is designed to be fine-tuned on exactly this kind of domain data.
2. Ship the feed push endpoint so a security team can add an indicator without an administrator editing policy, which is the half of requirement 4 we did not finish.
3. Pass the MCP and guard release gates: activate policy v4 with `client_guard`, run the frozen ten-question MCP set and the twenty-four frozen guard prompts against live Laya, and record the Claude Code rehearsal.
4. Re-verify the client-action trace read on the deployment, then finish review approval so a held candidate or a held action can be published with a recorded approver and reason.
5. Replace the Mac bridge with a deployed classifier service behind the same port interface, which removes the single point of failure without touching the engine.

---

## Team

| Person  | Role                 | Owns                                                        |
| ------- | -------------------- | ----------------------------------------------------------- |
| Bartosz | Integrator           | Gateway engine, database, routes, deployment, release       |
| Maciej  | Builder A, workbench | Chat, sources, upload, review, policy and export interface  |
| Julian  | Builder B, detection | Parsers, deterministic findings, Laya adapter, model bridge |
| Nikodem | Builder C, audit     | Personal and admin dashboards, trace presentation, metrics  |

## Documentation

[Documentation map](docs/README.md) · [requirements](docs/product/requirements.md) · [architecture](docs/product/architecture.md) · [technical spec](docs/product/technical-spec.md) · [semantic protocol](docs/contracts/semantic-protocol.md) · [data model](docs/contracts/data-model.md) · [judge runbook](docs/demo/runbook.md) · [MCP and guard runbook](docs/team/mcp-guard-runbook.md) · [release evidence](docs/testing/release-evidence.md) · [acceptance tests](docs/testing/acceptance.md)

Laya is Apache 2.0, by Convai Innovations: [repository](https://github.com/NandhaKishorM/laya) · [model](https://huggingface.co/convaiinnovations/laya). We use it unmodified at a pinned revision and claim nothing about it that we did not measure here.

Coding agents read [AGENTS.md](AGENTS.md) first; Claude Code imports it through [CLAUDE.md](CLAUDE.md). Screen contracts are in [DESIGN.md](DESIGN.md).
