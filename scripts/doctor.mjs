// Manual diagnostics; never part of CI.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { validateSupabaseConfig, checkSupabaseConnection } from "../src/shared/supabase-config.mjs";

const results = [];
try {
  const expected = readFileSync(".nvmrc", "utf8").trim();
  if (process.versions.node !== expected)
    throw new Error(`Node.js: you have ${process.versions.node}, use ${expected} from .nvmrc.`);
  results.push({ name: "Node.js", ok: true, detail: expected });
  const expectedNpm = JSON.parse(readFileSync("package.json", "utf8")).packageManager.replace("npm@", "");
  if (!process.env.npm_config_user_agent?.startsWith(`npm/${expectedNpm} `))
    throw new Error(`Run via npm run doctor, using npm ${expectedNpm}.`);
  results.push({ name: "npm", ok: true, detail: expectedNpm });
  if (!existsSync("node_modules/next")) throw new Error("Dependencies missing. Run npm ci.");
  // Load the environment with the same library and in the same order as Next dev.
  const require = createRequire(import.meta.url);
  const nextRequire = createRequire(require.resolve("next/package.json"));
  nextRequire("@next/env").loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const config = validateSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  results.push({ name: "Configuration", ok: true, detail: "URL and publishable key are valid." });
  results.push(...(await checkSupabaseConnection(config)));
} catch (error) {
  results.push({ name: "Configuration", ok: false, detail: error.message });
}
for (const result of results) console.log(`${result.ok ? "✅" : "❌"} ${result.name} — ${result.detail}`);
const failed = results.some((result) => !result.ok);
console.log(failed ? "DOCTOR: FAIL — fix the first error and run again." : "DOCTOR: OK");
process.exitCode = failed ? 1 : 0;
