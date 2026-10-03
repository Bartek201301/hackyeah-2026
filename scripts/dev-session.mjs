// Prints the path of a curl header file holding a real session for one demo alias:
//   C=$(npm run -s dev:session -- employee); curl -H @"$C" …; rm -rf "$(dirname "$C")"
// Needs only the public Supabase URL/key and DEMO_<ALIAS>_PASSWORD. Never prints the cookie.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { validateSupabaseConfig } from "../src/shared/supabase-config.mjs";
import { fixtures, passwordFor } from "./db/clients.mjs";

const alias = process.argv[2] ?? "";
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const account = fixtures.accounts.find((candidate) => candidate.alias === alias);
if (!account) fail(`dev:session: unknown alias "${alias}"`);
const password = passwordFor(alias);
if (!password) fail(`dev:session: DEMO_${alias.toUpperCase()}_PASSWORD is not set`);
const { url, key } = validateSupabaseConfig(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

// In-memory jar: setAll delivers changed cookies and removals (empty values).
const jar = new Map();
const supabase = createServerClient(url, key, {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (cookies) =>
      cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
  },
});
const { error } = await supabase.auth.signInWithPassword({ email: account.email, password });
if (error || jar.size === 0) fail(`dev:session: sign-in failed for "${alias}"`);

const file = join(mkdtempSync(join(tmpdir(), "t03-session-")), "cookie.txt");
writeFileSync(file, `Cookie: ${[...jar].map(([name, value]) => `${name}=${value}`).join("; ")}\n`, {
  mode: 0o600,
});
console.log(file);
