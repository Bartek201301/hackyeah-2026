import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

try {
  const workspace = process.argv[2];
  if (!path.isAbsolute(workspace)) throw new Error("Use an absolute synthetic workspace path");
  const directory = path.join(workspace, ".interlock");
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  if (manifest.owner !== "InterLock restricted demo v1") throw new Error("Profile identity mismatch");
  for (const name of ["guard-config.json", "mcp.json", "settings.json"]) {
    const contents = await readFile(path.join(directory, name));
    if (createHash("sha256").update(contents).digest("hex") !== manifest.hashes[name])
      throw new Error("Profile configuration changed");
  }
  const config = JSON.parse(await readFile(path.join(directory, "guard-config.json"), "utf8"));
  if (config.workspace_root !== workspace) throw new Error("Workspace configuration mismatch");
  const info = await stat(config.credentials_file);
  if ((info.mode & 0o077) !== 0 || info.uid !== process.getuid())
    throw new Error("Credential permissions are not private");
  const credentials = JSON.parse(await readFile(config.credentials_file, "utf8"));
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(credentials.mcp) ||
    !/^[A-Za-z0-9_-]{43}$/.test(credentials.hooks) ||
    !(Date.parse(credentials.expires_at) > Date.now())
  )
    throw new Error("Credentials unavailable or expired");
  const child = spawn(
    "claude",
    [
      "--restricted",
      "--strict-mcp-config",
      "--mcp-config",
      path.join(directory, "mcp.json"),
      "--settings",
      path.join(directory, "settings.json"),
      "--tools",
      "Read,Edit,Write",
      "--permission-mode",
      "default",
    ],
    {
      cwd: workspace,
      stdio: "inherit",
      shell: false,
      env: { ...process.env, INTERLOCK_MCP_TOKEN: credentials.mcp },
    },
  );
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
  child.once("error", () => {
    process.stderr.write("Claude Code could not start.\n");
    process.exitCode = 1;
  });
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
