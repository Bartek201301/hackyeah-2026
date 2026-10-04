import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const supervisor = path.join(scripts, "claude-guard-supervisor.mjs");
let temp, workspace, configFile, server, endpoint;
before(async () => {
  temp = await mkdtemp(path.join(os.tmpdir(), "interlock-hook-test-"));
  workspace = path.join(temp, "project");
  await mkdir(path.join(workspace, "src"), { recursive: true });
  await writeFile(path.join(workspace, "src", "example.ts"), "export const value = 1;\n");
  await writeFile(path.join(workspace, ".env"), "synthetic-secret");
  await symlink(path.join(workspace, ".env"), path.join(workspace, "src", "linked.ts"));
  const credentials = path.join(temp, "credentials.json");
  await writeFile(credentials, JSON.stringify({ hooks: "A".repeat(43) }), { mode: 0o600 });
  server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/bad") response.end("not json");
    else if (request.url === "/review") {
      response.statusCode = 403;
      response.end(
        JSON.stringify({ decision: "REVIEW", error: null, trace_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }),
      );
    } else
      response.end(
        JSON.stringify({ decision: "ALLOW", error: null, trace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/guard`;
  configFile = path.join(temp, "config.json");
  await writeFile(
    configFile,
    JSON.stringify({ workspace_root: workspace, credentials_file: credentials, guard_url: endpoint }),
  );
});
after(async () => {
  await new Promise((resolve) => server?.close(resolve));
});

async function run(input, config = configFile) {
  const child = spawn(process.execPath, [supervisor, config], { stdio: ["pipe", "pipe", "pipe"] });
  const stderr = [];
  child.stderr.on("data", (part) => stderr.push(part));
  child.stdin.end(JSON.stringify({ cwd: workspace, ...input }));
  const code = await new Promise((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", reject);
  });
  return { code, stderr: Buffer.concat(stderr).toString("utf8") };
}

test("allowed prompt and small source edit preserve normal host permissions", async () => {
  assert.equal(
    (
      await run({
        hook_event_name: "UserPromptSubmit",
        prompt_id: "prompt-1",
        prompt: "Explain the public fact",
      })
    ).code,
    0,
  );
  assert.equal(
    (
      await run({
        hook_event_name: "PreToolUse",
        tool_use_id: "edit-1",
        tool_name: "Edit",
        tool_input: { file_path: "src/example.ts", old_string: "value = 1", new_string: "value = 2" },
      })
    ).code,
    0,
  );
  assert.equal(
    await readFile(path.join(workspace, "src", "example.ts"), "utf8"),
    "export const value = 1;\n",
  );
});

test("local restrictions block shell, secrets, traversal, symlink and outside-root edits before effect", async () => {
  const actions = [
    { tool_name: "Bash", tool_input: { command: "curl https://example.invalid" } },
    { tool_name: "Read", tool_input: { file_path: ".env" } },
    { tool_name: "Read", tool_input: { file_path: "src/../.env" } },
    { tool_name: "Read", tool_input: { file_path: "src/linked.ts" } },
    { tool_name: "Write", tool_input: { file_path: path.join(temp, "outside.ts"), content: "bad" } },
    { tool_name: "Write", tool_input: { file_path: ".interlock/settings.json", content: "bad" } },
  ];
  for (const [index, action] of actions.entries()) {
    const result = await run({ hook_event_name: "PreToolUse", tool_use_id: `block-${index}`, ...action });
    assert.equal(result.code, 2, action.tool_name);
    assert.match(result.stderr, /InterLock blocked/);
  }
  assert.equal(await readFile(path.join(workspace, ".env"), "utf8"), "synthetic-secret");
  assert.equal(
    await readFile(path.join(workspace, "src", "example.ts"), "utf8"),
    "export const value = 1;\n",
  );
});

test("network failure, malformed response, missing worker configuration and prompt expansion block", async () => {
  assert.equal(
    (await run({ hook_event_name: "UserPromptExpansion", prompt_id: "expand-1", prompt: "/unsafe" })).code,
    2,
  );
  assert.equal(
    (
      await run(
        { hook_event_name: "UserPromptSubmit", prompt_id: "bad-config", prompt: "hello" },
        path.join(temp, "missing.json"),
      )
    ).code,
    2,
  );
  const bad = path.join(temp, "bad-config.json");
  await writeFile(
    bad,
    JSON.stringify({
      workspace_root: workspace,
      credentials_file: path.join(temp, "credentials.json"),
      guard_url: `${endpoint.replace(/\/guard$/, "")}/bad`,
    }),
  );
  assert.equal(
    (await run({ hook_event_name: "UserPromptSubmit", prompt_id: "bad-response", prompt: "hello" }, bad))
      .code,
    2,
  );
  const offline = path.join(temp, "offline-config.json");
  await writeFile(
    offline,
    JSON.stringify({
      workspace_root: workspace,
      credentials_file: path.join(temp, "credentials.json"),
      guard_url: "http://127.0.0.1:1/guard",
    }),
  );
  const failed = await run(
    {
      hook_event_name: "PreToolUse",
      tool_use_id: "offline",
      tool_name: "Bash",
      tool_input: { command: "curl https://example.invalid" },
    },
    offline,
  );
  assert.equal(failed.code, 2);
  assert.match(failed.stderr, /blocked locally; central audit unavailable/);
});

test("audited REVIEW blocks with its trace instead of claiming the guard is unavailable", async () => {
  const reviewed = path.join(temp, "review-config.json");
  await writeFile(
    reviewed,
    JSON.stringify({
      workspace_root: workspace,
      credentials_file: path.join(temp, "credentials.json"),
      guard_url: `${endpoint.replace(/\/guard$/, "")}/review`,
    }),
  );
  const result = await run(
    { hook_event_name: "UserPromptSubmit", prompt_id: "reviewed", prompt: "A safe test prompt" },
    reviewed,
  );
  assert.equal(result.code, 2);
  assert.match(
    result.stderr,
    /InterLock blocked this action\. Trace: bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb\./,
  );
  assert.doesNotMatch(result.stderr, /guard unavailable/);
});
