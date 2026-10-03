// Claude Code hook (PostToolUse): formats each file with Prettier after it is edited.
// Optional convenience; the shared check for all tools is format:check in CI.
// Never reports an error — if formatting fails, it simply does nothing.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    const file = JSON.parse(input)?.tool_input?.file_path;
    const prettier = "node_modules/.bin/prettier";
    if (file && existsSync(file) && existsSync(prettier) && /\.(ts|tsx|js|mjs|json|css|md)$/.test(file)) {
      execFileSync(prettier, ["--write", "--ignore-unknown", file], { stdio: "ignore", timeout: 15000 });
    }
  } catch {
    // deliberately ignored — formatting must not block work
  }
  process.exit(0);
});
