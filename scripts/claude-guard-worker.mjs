import { randomUUID } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

const deny = (message = "InterLock blocked this action.") => {
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
};
const fixed = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const under = (root, candidate) => candidate.startsWith(`${root}${path.sep}`);
const ext = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css"]);
const forbidden = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "AGENTS.md",
  "CLAUDE.md",
]);

async function boundedStdin(max) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.byteLength;
    if (bytes > max) throw new Error("oversized input");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function localPath(root, cwd, input, name) {
  if (typeof input?.file_path !== "string" || !input.file_path || input.file_path.includes("\0"))
    throw new Error("invalid path");
  const candidate = path.resolve(cwd, input.file_path);
  if (!under(root, candidate)) throw new Error("outside workspace");
  const relative = path.relative(root, candidate).split(path.sep).join("/");
  const parts = relative.split("/");
  if (
    parts[0] !== "src" ||
    parts.some((part) => !part || part === "." || part === ".." || part.startsWith("."))
  )
    throw new Error("protected path");
  const base = parts.at(-1);
  if (forbidden.has(base) || !ext.has(path.extname(base))) throw new Error("protected file");
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error("symlink");
      if (i < parts.length - 1 && !info.isDirectory()) throw new Error("invalid parent");
      if (i === parts.length - 1 && (!info.isFile() || (name === "Read" && info.size > 6000)))
        throw new Error("file not bounded");
      if (i === parts.length - 1 && (name === "Edit" || name === "Write") && info.mode & 0o111)
        throw new Error("executable file");
    } catch (error) {
      if (error?.code === "ENOENT" && i === parts.length - 1 && name === "Write") break;
      throw error;
    }
  }
  return relative;
}

async function main() {
  const configPath = process.argv[2];
  if (!path.isAbsolute(configPath)) throw new Error("invalid configuration");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const root = await realpath(config.workspace_root);
  const credentialsInfo = await lstat(config.credentials_file);
  if ((credentialsInfo.mode & 0o077) !== 0 || credentialsInfo.uid !== process.getuid())
    throw new Error("credential permissions");
  const credentials = JSON.parse(await readFile(config.credentials_file, "utf8"));
  if (!/^[A-Za-z0-9_-]{43}$/.test(credentials.hooks)) throw new Error("credential format");
  const input = await boundedStdin(12000);
  const cwd = await realpath(input.cwd);
  if (cwd !== root && !under(root, cwd)) throw new Error("outside workspace");
  const eventId = fixed(input.tool_use_id)
    ? input.tool_use_id
    : fixed(input.prompt_id)
      ? input.prompt_id
      : randomUUID();
  let body;
  let localBlock = false;
  if (input.hook_event_name === "UserPromptSubmit") {
    if (typeof input.prompt !== "string" || !input.prompt || Buffer.byteLength(input.prompt, "utf8") > 6000)
      throw new Error("invalid prompt");
    body = { event_type: "prompt", event_id: eventId, prompt: input.prompt };
  } else if (input.hook_event_name === "UserPromptExpansion") {
    body = { event_type: "tool", event_id: eventId, tool_name: "UserPromptExpansion" };
    localBlock = true;
  } else if (input.hook_event_name === "PreToolUse") {
    const name = input.tool_name;
    const args = input.tool_input;
    if (!fixed(name) || !args || typeof args !== "object" || Array.isArray(args))
      throw new Error("invalid tool input");
    body = { event_type: "tool", event_id: eventId, tool_name: name };
    if (name === "Read" || name === "Edit" || name === "Write") {
      try {
        body.relative_path = await localPath(root, cwd, args, name);
      } catch {
        body.relative_path = "__local_denial__";
        localBlock = true;
      }
      if (name === "Edit" || name === "Write") {
        const proposed = name === "Edit" ? args.new_string : args.content;
        if (
          typeof proposed !== "string" ||
          !proposed ||
          Buffer.byteLength(proposed, "utf8") > 2000 ||
          proposed.startsWith("#!") ||
          (name === "Edit" &&
            (args.replace_all === true ||
              typeof args.old_string !== "string" ||
              Buffer.byteLength(args.old_string, "utf8") > 2000))
        ) {
          localBlock = true;
          body.relative_path = "__local_denial__";
        } else body.proposed_text = proposed;
      }
    } else if (name === "mcp__interlock__search_excerpts" || name === "mcp__interlock__read_excerpt") {
      const proposed = name.endsWith("search_excerpts") ? args.query : args.id;
      if (typeof proposed !== "string" || !proposed || Buffer.byteLength(proposed, "utf8") > 2000)
        localBlock = true;
      else body.proposed_text = proposed;
    } else localBlock = true;
  } else throw new Error("unsupported event");
  const controller = AbortSignal.timeout(20000);
  let result;
  let status;
  try {
    const response = await fetch(config.guard_url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${credentials.hooks}` },
      body: JSON.stringify(body),
      signal: controller,
    });
    if (response.status !== 200 && response.status !== 403) throw new Error("guard unavailable");
    status = response.status;
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > 10000) throw new Error("guard response oversized");
    result = JSON.parse(raw);
  } catch {
    deny(
      localBlock
        ? "InterLock blocked locally; central audit unavailable."
        : "InterLock guard unavailable; action blocked.",
    );
    return;
  }
  if (status !== 200 || localBlock || result?.decision !== "ALLOW" || result?.error !== null) {
    const trace =
      typeof result?.trace_id === "string" && /^[0-9a-f-]{36}$/i.test(result.trace_id)
        ? ` Trace: ${result.trace_id}.`
        : "";
    deny(`InterLock blocked this action.${trace}`);
  }
}

try {
  await main();
} catch {
  deny("InterLock local check failed; action blocked.");
}
