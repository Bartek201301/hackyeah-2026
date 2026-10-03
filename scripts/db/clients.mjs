// Script-only Supabase clients for demo:seed and test:db. Never imported by app code.
// Errors name the missing or invalid variable, never its value.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { validateSupabaseConfig } from "../../src/shared/supabase-config.mjs";

export const fixtures = JSON.parse(
  readFileSync(new URL("../../docs/demo/fixtures.json", import.meta.url), "utf8"),
);

const passwordName = (alias) => `DEMO_${alias.toUpperCase()}_PASSWORD`;
export const passwordFor = (alias) => process.env[passwordName(alias)];

let cached;
export function config() {
  if (cached) return cached;
  const passwords = fixtures.accounts.map((account) => passwordName(account.alias));
  const names = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    ...passwords,
  ];
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing required env: ${missing.join(", ")}`);
  const { url, key } = validateSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const secret = process.env.SUPABASE_SECRET_KEY.trim();
  if (!secret.startsWith("sb_secret_")) throw new Error("SUPABASE_SECRET_KEY: expected an sb_secret_ key");
  const weak = passwords.filter((name) => process.env[name].length < 16);
  if (weak.length) throw new Error(`Password env shorter than 16 characters: ${weak.join(", ")}`);
  return (cached = { url, key, secret });
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
export const anon = () => createClient(config().url, config().key, options);
export const admin = () => createClient(config().url, config().secret, options);

/** Returns data or throws `step: code message`; never includes the request payload. */
export function must(step, { data, error }) {
  if (error) throw new Error(`${step}: ${error.code ?? "unknown"} ${error.message}`);
  return data;
}

/** A fresh client holding the prepared account's own session. */
export async function signIn(alias) {
  const account = fixtures.accounts.find((candidate) => candidate.alias === alias);
  const client = anon();
  const { user } = must(
    `sign in ${alias}`,
    await client.auth.signInWithPassword({ email: account.email, password: passwordFor(alias) }),
  );
  return { client, uid: user.id };
}
