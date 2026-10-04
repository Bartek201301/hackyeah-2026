import { createHash } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootScripts = path.dirname(fileURLToPath(import.meta.url));
const supervisor = path.join(rootScripts, "claude-guard-supervisor.mjs");
const own = "InterLock restricted demo v1";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => {
  throw new Error(message);
};
const [command, workspace, origin, credentialsFile] = process.argv.slice(2);
const ownedFiles = ["guard-config.json", "mcp.json", "settings.json"];

async function privateFile(file) {
  const info = await stat(file);
  if (!info.isFile() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid())
    fail("Credentials must be a private file owned by this user");
}
async function writeOwned(file, contents) {
  await writeFile(file, contents, { flag: "wx", mode: 0o600 });
}
async function verifyOwned(directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  if (manifest.owner !== own) fail("Not an InterLock installation");
  for (const name of ownedFiles) {
    if (hash(await readFile(path.join(directory, name))) !== manifest.hashes[name])
      fail("InterLock configuration changed; inspect it before uninstalling");
  }
  return manifest;
}
async function install() {
  if (!path.isAbsolute(workspace) || !path.isAbsolute(credentialsFile)) fail("Use absolute paths");
  const url = new URL(origin);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname))
  )
    fail("HTTPS gateway origin required");
  await privateFile(credentialsFile);
  await mkdir(workspace, { recursive: true });
  await mkdir(path.join(workspace, "src"), { recursive: true });
  const example = path.join(workspace, "src", "example.ts");
  try {
    await writeOwned(example, "export const greeting = 'Hello from the synthetic workspace';\n");
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const directory = path.join(workspace, ".interlock");
  await mkdir(directory, { mode: 0o700 });
  const config = {
    workspace_root: workspace,
    credentials_file: credentialsFile,
    guard_url: `${url.origin}/api/v1/guard/check`,
  };
  const mcp = {
    mcpServers: {
      interlock: {
        type: "http",
        url: `${url.origin}/api/mcp`,
        headers: { Authorization: "Bearer ${INTERLOCK_MCP_TOKEN}" },
        timeout: 30000,
      },
    },
  };
  const hook = {
    type: "command",
    command: process.execPath,
    args: [supervisor, path.join(directory, "guard-config.json")],
    timeout: 35,
  };
  const settings = {
    disableClaudeAiConnectors: true,
    permissions: { deny: ["Bash", "PowerShell", "WebFetch", "WebSearch", "Task", "NotebookEdit", "Skill"] },
    hooks: {
      UserPromptSubmit: [{ hooks: [hook] }],
      UserPromptExpansion: [{ hooks: [hook] }],
      PreToolUse: [{ matcher: "*", hooks: [hook] }],
    },
  };
  const files = {
    "guard-config.json": JSON.stringify(config, null, 2) + "\n",
    "mcp.json": JSON.stringify(mcp, null, 2) + "\n",
    "settings.json": JSON.stringify(settings, null, 2) + "\n",
  };
  for (const [name, contents] of Object.entries(files))
    await writeOwned(path.join(directory, name), contents);
  await writeOwned(
    path.join(directory, "manifest.json"),
    JSON.stringify(
      {
        owner: own,
        hashes: Object.fromEntries(Object.entries(files).map(([name, contents]) => [name, hash(contents)])),
      },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(
    "InterLock demo profile installed. Launch with scripts/launch-protected-claude.mjs WORKSPACE.\n",
  );
}
async function preflight() {
  if (!path.isAbsolute(workspace)) fail("Use an absolute workspace path");
  const directory = path.join(workspace, ".interlock");
  await verifyOwned(directory);
  const config = JSON.parse(await readFile(path.join(directory, "guard-config.json"), "utf8"));
  await privateFile(config.credentials_file);
  process.stdout.write("InterLock profile and private credentials are present.\n");
}
async function uninstall() {
  if (!path.isAbsolute(workspace)) fail("Use an absolute workspace path");
  const directory = path.join(workspace, ".interlock");
  await verifyOwned(directory);
  for (const name of ownedFiles) await unlink(path.join(directory, name));
  await unlink(path.join(directory, "manifest.json"));
  process.stdout.write("InterLock-owned configuration removed; synthetic source and credentials kept.\n");
}

try {
  if (command === "install") await install();
  else if (command === "preflight") await preflight();
  else if (command === "uninstall") await uninstall();
  else fail("Usage: setup-claude-demo.mjs install|preflight|uninstall WORKSPACE [ORIGIN CREDENTIAL_FILE]");
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
