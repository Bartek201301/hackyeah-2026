# MCP server and coding-agent guard

<!-- Moved verbatim from README.md on 2026-10-04 to keep the README short; the README links here. -->

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

**Boundary of the guard.** Command hooks can be skipped or killed by the host, so this is not an unbypassable admission controller; the exit-2 denials, the HTTP deadline, the independent supervisor and the host timeout reduce that risk rather than remove it. The installed Claude binary, the operator and the hook installation are trusted. A differently configured session is outside the boundary. The restricted Claude profile and the server-side permissions are independent limits, so **the gateway still protects company data even with no hooks at all**, which is the property that matters. The guard does not control the agent's total token bill, its final answer text, other applications, other MCP servers, or every code vulnerability.

**Release status.** Migration `supabase/migrations/20261004034000_guard_finalization.sql` is applied, and policy v4 with `client_guard` is active on production; it differs from v3 only in `version` and the new section. In a live Claude Code session connected to the MCP server, a source-file Read was allowed and a `.env` read was blocked before disclosure. MCP search and its returned excerpts resolve Laya's review band with the same bounded Qwen verification as chat; a small source edit in the review band stays held for a person. Integration tokens are issued only by an operator script, so judges see this path in the recording rather than by self-service. Release order and the judge path are in the [MCP guard runbook](../../docs/team/mcp-guard-runbook.md).
