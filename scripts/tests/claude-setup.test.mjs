import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../setup-claude-demo.mjs");
const run = async (...args) => {
  const child = spawn(process.execPath, [script, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  const code = await new Promise((resolve) => child.once("exit", resolve));
  return code;
};

test("installation preserves unrelated files, rejects changed config and uninstalls only its own entries", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "interlock-setup-test-"));
  const workspace = path.join(temp, "project");
  const credentials = path.join(temp, "credentials.json");
  await writeFile(credentials, JSON.stringify({ mcp: "A".repeat(43), hooks: "B".repeat(43) }), {
    mode: 0o600,
  });
  assert.equal(await run("install", workspace, "http://localhost:3000", credentials), 0);
  assert.equal(await run("preflight", workspace), 0);
  assert.equal(await run("install", workspace, "http://localhost:3000", credentials), 1);
  const settings = path.join(workspace, ".interlock", "settings.json");
  const original = await readFile(settings, "utf8");
  assert.match(original, /UserPromptSubmit/);
  assert.match(original, /PreToolUse/);
  assert.match(original, /UserPromptExpansion/);
  await writeFile(settings, original + " ");
  assert.equal(await run("preflight", workspace), 1);
  assert.equal(await run("uninstall", workspace), 1);
  await writeFile(settings, original);
  assert.equal(await run("uninstall", workspace), 0);
  assert.equal((await stat(credentials)).isFile(), true);
  assert.match(await readFile(path.join(workspace, "src", "example.ts"), "utf8"), /synthetic workspace/);
});
