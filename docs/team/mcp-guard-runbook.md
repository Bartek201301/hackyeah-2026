# InterLock MCP and Claude Code restricted demo

Status: implementation branch only. The integration is **not released** until the migration review, deployment, policy activation, live model evidence, Claude Code rehearsal, CI and peer approval have all passed. The existing web demo remains available throughout.

## Boundary and setup

`/api/mcp` serves exactly `search_excerpts` and `read_excerpt` through the official MCP SDK. Every request uses a short-lived InterLock bearer token bound to an active actor and organisation. The SQL retrieval audience is `public`, even for an admin-associated token. Search input and the complete returned JSON (excerpt text, citation and source label) are assessed before the MCP callback releases content. Invalid coverage, a missing policy/feed, budget exhaustion, unknown provider usage or failed final audit withholds it.

`/api/v1/guard/check` takes a separate hook token. It accepts only a bounded prompt or a validated proposed tool action. The hook runner sends no transcript. It blocks shell, network tools, hidden/secret paths, configuration files, symlinks, paths outside `src/` and large edits before effect. Claude's normal permission prompts remain in place on allow.

The protected coding session is a normal Claude Code interface started from a dedicated synthetic project with `--restricted`, `--tools Read,Edit,Write`, `--strict-mcp-config` and the generated settings. The installed Claude binary, the operator and the hook installation are trusted. A different or manually reconfigured Claude session is outside this boundary. The gateway independently protects company data if hooks are absent.

Set `INTERLOCK_PUBLIC_ORIGIN` on the server to the exact public origin, with no trailing path. The endpoint rejects other Host or supplied Origin values. Set the normal Supabase and live model bridge environment variables; do not put secrets in `NEXT_PUBLIC_*`, `.mcp.json`, a PR or a screenshot.

## Release order and commands

1. Merge current `origin/main` into `codex/mcp-guard` and run `npm run check` plus the focused tests. PR #109 and migrations `20261004031500` and `20261004032500` must already be present. Open a PR; the integrator cannot merge it.
2. The command center reviews the additive `20261004034000_guard_finalization.sql` migration and types **apply**. Only then apply it from the authorised checkout:

   ```sh
   env -u SUPABASE_ACCESS_TOKEN supabase db query --linked --workdir /Users/bartus/Desktop/Hacathon -f <ABSOLUTE_PATH_TO_20261004034000_guard_finalization.sql>
   ```

   Verify `pg_proc.prosecdef = false` for `finalize_guard_check`; `anon` and `authenticated` cannot execute it; `service_role` can. Record the commit, project, UTC time and result in `supabase/APPLIED.md`. Never edit the applied file.

3. Deploy the compatible code, then fetch the current policy v3 into a private local file. Generate the v4 candidate with `node scripts/prepare-client-guard-policy.mjs <ABSOLUTE_V3_JSON> <ABSOLUTE_PRIVATE_V4_JSON>`. The generator changes only `version` and adds `client_guard`; it verifies the existing semantic, execution, budget and retention objects are unchanged. The command center diffs v4 against v3 before activation. Activate with the existing authenticated admin `PUT /api/v1/policy` and a fresh `Idempotency-Key`; never edit `control_heads` directly.
4. After deployment and v4 activation, issue credentials using an active admin operator ID and an existing active target actor/organisation. Run from a shell that loads the private Supabase environment; the command prints no credential:

   ```sh
   INTERLOCK_OPERATOR_ACTOR_ID=<ADMIN_UUID> node --env-file=<PRIVATE_ENV_FILE> scripts/integration-token.mjs issue --org <ORG_UUID> --actor <ACTOR_UUID> --out <ABSOLUTE_PRIVATE_CREDENTIAL_FILE>
   ```

   The file is created once with mode `0600` under a mode `0700` directory. It contains separate four-hour MCP and hook credentials. Never commit, print, paste or screenshot it. For rollback, revoke both token IDs using `scripts/integration-token.mjs revoke --org <ORG_UUID> --token-id <ID>`, then disable `client_guard` through a version-checked policy update. Do not drop the additive migration.

5. Prepare a synthetic project outside the application checkout, preserving unrelated user settings:

   ```sh
   node scripts/setup-claude-demo.mjs install <ABSOLUTE_SYNTHETIC_WORKSPACE> <PUBLIC_ORIGIN> <ABSOLUTE_PRIVATE_CREDENTIAL_FILE>
   node scripts/setup-claude-demo.mjs preflight <ABSOLUTE_SYNTHETIC_WORKSPACE>
   node scripts/launch-protected-claude.mjs <ABSOLUTE_SYNTHETIC_WORKSPACE>
   ```

   `install` refuses to overwrite an existing InterLock profile. `uninstall` verifies hashes and removes only its three configuration files and manifest; it keeps the synthetic source and credentials. Revoke credentials separately. The launcher uses the normal Claude Code binary, expands the MCP token from a private file into the process environment and loads only the intended MCP server. The absolute hook runner lives outside the editable `src/` directory.

## Acceptance and demo evidence

The local implementation checks are `npm run check`, `node --test scripts/tests/guard-finalization.test.mjs`, `node --test scripts/tests/claude-guard.test.mjs` and `npx vitest run src/app/api/mcp/route.test.ts src/app/api/v1/guard/check/route.test.ts src/shared/gateway/standalone-check.test.ts`. The hook test binds a loopback mock server and may need local network permission. Database tests use isolated PGlite; they do not establish that the shared migration was applied.

Before a live claim, freeze twelve benign and twelve adversarial prompts, plus [ten MCP questions](../testing/mcp-evaluation.json), then run them with live Laya (and Qwen when the v3 REVIEW resolver applies). Report each decision, false positive and miss without tuning thresholds for the demo. Measure one cold and ten warm requests each for prompt check, tool check and MCP retrieval, reporting median and maximum separately. Run the existing browser, DB/RLS, chat, export and dashboard regressions after the merge.

Four-minute judge path: show the two InterLock tools in Claude Code; search a public AsterCloud fact and its citation/trace; request a restricted fact and show only refusal; make a small source edit in the synthetic project; attempt `Read .env` or Bash and verify no file/network effect; open Activity to connect the decision, policy/feed versions and measured usage. If any release gate fails, do not present the integration as live. The existing web runbook is the fallback.

The normal command hooks can be skipped or killed by the host. Their explicit exit-code-2 denials, 20-second HTTP deadline, 25-second independent supervisor and 35-second host timeout reduce this risk but do not make them an unbypassable admission controller. The static restricted Claude profile and server-side gateway permissions are independent limits. This release does not control Claude's total token bill, final answer text, other applications, arbitrary MCP servers or every code vulnerability.

References: [MCP builder](https://github.com/anthropics/skills/blob/main/skills/mcp-builder/SKILL.md), [official MCP SDK](https://ts.sdk.modelcontextprotocol.io/v2/serving/web-standard.html), [Claude Code hooks](https://code.claude.com/docs/en/hooks), [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp), [MCP security guidance](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices).
