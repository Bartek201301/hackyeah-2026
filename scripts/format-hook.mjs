// Hook Claude Code (PostToolUse): po każdej edycji pliku formatuje go Prettierem.
// Dzięki temu wszystkie sesje piszą w identycznym stylu i nie ma konfliktów "białych znaków".
// Nigdy nie zgłasza błędu — jeśli formatowanie się nie uda, po prostu nic nie robi.
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
    // celowo ignorujemy — formatowanie nie może blokować pracy
  }
  process.exit(0);
});
