import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const worker = path.join(path.dirname(fileURLToPath(import.meta.url)), "claude-guard-worker.mjs");
let child;
const timer = setTimeout(() => {
  child?.kill("SIGKILL");
  process.stderr.write("InterLock watchdog blocked this action.\n");
  process.exit(2);
}, 25000);
try {
  if (!path.isAbsolute(process.argv[2] ?? "")) throw new Error("missing config");
  child = spawn(process.execPath, [worker, process.argv[2]], { stdio: ["pipe", "pipe", "pipe"] });
  const exited = new Promise((resolve, reject) => {
    child.once("exit", (status) => resolve(status));
    child.once("error", reject);
  });
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.byteLength;
    if (size > 12000) throw new Error("oversized hook input");
    child.stdin.write(chunk);
  }
  child.stdin.end();
  let output = "";
  for await (const chunk of child.stderr) {
    output += chunk.toString("utf8");
    if (output.length > 1000) throw new Error("oversized worker output");
  }
  const code = await exited;
  clearTimeout(timer);
  if (code === 0) process.exit(0);
  process.stderr.write(output || "InterLock worker failed; action blocked.\n");
  process.exit(2);
} catch {
  child?.kill("SIGKILL");
  clearTimeout(timer);
  process.stderr.write("InterLock supervisor failed; action blocked.\n");
  process.exit(2);
}
