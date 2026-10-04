import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, stat } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const args = Object.fromEntries(
  process.argv
    .slice(3)
    .map((part, index, all) => (part.startsWith("--") ? [part.slice(2), all[index + 1]] : []))
    .filter((pair) => pair.length),
);
const required = (key) => {
  const value = args[key];
  if (!value) throw new Error(`Missing --${key}`);
  return value;
};
const uuid = (value) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const must = (step, result) => {
  if (result.error) throw new Error(`${step} failed`);
  return result.data;
};
const db = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url?.startsWith("https://") || !secret?.startsWith("sb_secret_"))
    throw new Error("Supabase operator environment unavailable");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
};
async function operator(client, org) {
  const id = process.env.INTERLOCK_OPERATOR_ACTOR_ID;
  if (!uuid(id)) throw new Error("INTERLOCK_OPERATOR_ACTOR_ID missing or invalid");
  const row = must(
    "operator membership",
    await client
      .from("memberships")
      .select("role")
      .eq("organisation_id", org)
      .eq("actor_id", id)
      .eq("active", true)
      .maybeSingle(),
  );
  if (row?.role !== "admin") throw new Error("Active admin operator required");
  return id;
}
async function audit(client, org, operatorId, operation, tokenId) {
  const result = await client.rpc("record_access_decision", {
    p_organisation_id: org,
    p_actor_id: operatorId,
    p_operation: operation,
    p_idempotency_key: randomUUID(),
    p_request_sha256: hash(`${operation}:${tokenId}`),
    p_decision: "ALLOW",
    p_reasons: [],
    p_usage: {
      generation_input_tokens: 0,
      generation_output_tokens: 0,
      generation_ms: 0,
      semantic_input_tokens: 0,
      semantic_ms: 0,
      reserved_generation_tokens: 0,
      unresolved_reservation: false,
      comparison_micro_usd: 0,
      comparison_rate_version: "none",
    },
    p_payload: { stage: "credential", token_id: tokenId },
  });
  must("credential audit", result);
}

async function issue() {
  const org = required("org");
  const actor = required("actor");
  const file = required("out");
  if (!uuid(org) || !uuid(actor) || !path.isAbsolute(file))
    throw new Error("Invalid identifiers or output path");
  const client = db();
  const operatorId = await operator(client, org);
  const member = must(
    "target membership",
    await client
      .from("memberships")
      .select("id")
      .eq("organisation_id", org)
      .eq("actor_id", actor)
      .eq("active", true)
      .maybeSingle(),
  );
  if (!member) throw new Error("Active target actor required");
  const expires = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
  const tokens = [
    { key: "mcp", scopes: ["excerpt:search", "excerpt:read"] },
    { key: "hooks", scopes: ["guard:prompt", "guard:tool"] },
  ];
  const written = {};
  const ids = [];
  try {
    for (const item of tokens) {
      const token = randomBytes(32).toString("base64url");
      const row = must(
        "token insert",
        await client
          .from("access_tokens")
          .insert({
            organisation_id: org,
            actor_id: actor,
            token_sha256: hash(token),
            scopes: item.scopes,
            audience: "public",
            expires_at: expires,
          })
          .select("id")
          .single(),
      );
      ids.push(row.id);
      written[item.key] = token;
      written[`${item.key}_id`] = row.id;
      await audit(client, org, operatorId, "token_issue", row.id);
    }
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const dir = await stat(path.dirname(file));
    if ((dir.mode & 0o077) !== 0) throw new Error("Output directory must be private");
    const handle = await open(file, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify({ ...written, expires_at: expires }));
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (ids.length)
      await client.from("access_tokens").update({ revoked_at: new Date().toISOString() }).in("id", ids);
    throw error;
  }
  process.stdout.write("Integration credentials saved to the private file.\n");
}

async function revoke() {
  const org = required("org");
  const tokenId = required("token-id");
  if (!uuid(org) || !uuid(tokenId)) throw new Error("Invalid identifiers");
  const client = db();
  const operatorId = await operator(client, org);
  const row = must(
    "token lookup",
    await client
      .from("access_tokens")
      .select("id")
      .eq("organisation_id", org)
      .eq("id", tokenId)
      .maybeSingle(),
  );
  if (!row) throw new Error("Token not found");
  must(
    "token revoke",
    await client
      .from("access_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("organisation_id", org)
      .eq("id", tokenId)
      .is("revoked_at", null),
  );
  await audit(client, org, operatorId, "token_revoke", tokenId);
  process.stdout.write("Integration credential revoked.\n");
}

try {
  if (process.argv[2] === "issue") await issue();
  else if (process.argv[2] === "revoke") await revoke();
  else throw new Error("Usage: integration-token.mjs issue|revoke --org UUID ...");
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
