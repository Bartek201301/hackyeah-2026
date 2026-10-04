// Release preflight (T12): exits non-zero on the first missing required service. Prints names, booleans
// and versions only, never a key, token or response body.
// ponytail: preflight only. It does not rerun check, test:db or browser QA; their results are in
// docs/testing/release-evidence.md.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { checkSupabaseConnection, validateSupabaseConfig } from "../src/shared/supabase-config.mjs";
import { inspectLocalModels } from "./model-doctor.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const manifest = read("../src/shared/contracts/runtime-manifest.json");
const ORG = read("../docs/demo/fixtures.json").organisation.id;
// The feed must outlive the judging window (deadline 11:00 Kraków = 09:00 UTC) with margin.
const FEED_VALID_UNTIL = Date.parse("2026-10-04T13:00:00Z");
const APP_URL = (process.env.RELEASE_URL ?? "https://hackyeah-2026.vercel.app").replace(/\/$/, "");
const env = (name) => process.env[name]?.trim() ?? "";

const ok = (step, detail = "") => console.log(`OK   ${step}${detail && `: ${detail}`}`);
function fail(step, detail) {
  console.error(`FAIL ${step}: ${detail}`);
  process.exit(1);
}

async function getJson(url, headers = {}) {
  try {
    const response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(10000) });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch (error) {
    return { status: 0, body: null, error: error?.name ?? "network" };
  }
}

// 1. Env names. Path A = bridge, path B = loopback Laya on the Mac; the same order as the factories.
const bridge = Boolean(env("MODEL_BRIDGE_URL") && env("MODEL_BRIDGE_TOKEN"));
const names = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"];
names.push(...(bridge ? ["MODEL_BRIDGE_URL", "MODEL_BRIDGE_TOKEN"] : ["LAYA_API_KEY"]));
for (const name of names) console.log(`     ${name}=${Boolean(env(name))}`);
const missing = names.filter((name) => !env(name));
if (missing.length) fail("env", `missing ${missing.join(", ")} (path A needs MODEL_BRIDGE_URL+TOKEN)`);
ok("env", bridge ? "path A (bridge)" : "path B (loopback)");

// 2. Supabase reachable: auth settings and the health_check RPC.
let config;
try {
  config = validateSupabaseConfig(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  );
} catch (error) {
  fail("supabase config", error.message);
}
for (const check of await checkSupabaseConnection(config))
  if (!check.ok) fail(`supabase ${check.name}`, check.detail);
ok("supabase", "auth settings and health_check RPC answer");

// 3. Control head: active policy and feed rows exist; the feed does not expire before the window ends.
const db = createClient(config.url, env("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const head = await db
  .from("control_heads")
  .select("policy_version, feed_version, revision")
  .eq("organisation_id", ORG)
  .maybeSingle();
if (head.error || !head.data) fail("control head", head.error?.code ?? "no row for the demo organisation");
const { policy_version, feed_version, revision } = head.data;
const [policy, feed] = await Promise.all([
  db
    .from("policy_versions")
    .select("sha256")
    .eq("organisation_id", ORG)
    .eq("version", policy_version)
    .maybeSingle(),
  db
    .from("feed_versions")
    .select("expires_at")
    .eq("organisation_id", ORG)
    .eq("version", feed_version)
    .maybeSingle(),
]);
if (policy.error || !policy.data?.sha256) fail("policy", `policy v${policy_version} row missing`);
if (feed.error || !feed.data) fail("feed", `feed v${feed_version} row missing`);
if (!(Date.parse(feed.data.expires_at) > FEED_VALID_UNTIL))
  fail("feed", `feed v${feed_version} expires ${feed.data.expires_at}, before 2026-10-04T13:00:00Z`);
ok(
  "control head",
  `policy v${policy_version}, feed v${feed_version} (expires ${feed.data.expires_at}), rev ${revision}`,
);

// 4. Models: authenticated readiness at the pinned Laya revision and Qwen digest.
if (bridge) {
  const base = env("MODEL_BRIDGE_URL").replace(/\/$/, "");
  if (!base.startsWith("https://")) fail("bridge", "MODEL_BRIDGE_URL must be an https:// origin");
  const auth = { authorization: `Bearer ${env("MODEL_BRIDGE_TOKEN")}` };
  const laya = await getJson(`${base}/laya/health`, auth);
  if (laya.status !== 200)
    fail("bridge laya", `status ${laya.status}${laya.error ? ` (${laya.error})` : ""}`);
  if (!laya.body?.loaded?.includes(manifest.laya_models))
    fail("bridge laya", "no authenticated model details");
  if (laya.body.revisions?.[manifest.laya_models] !== manifest.laya_checkpoint_revision)
    fail("bridge laya", "checkpoint revision differs from the runtime manifest");
  const tags = await getJson(`${base}/ollama/api/tags`, auth);
  if (tags.status !== 200)
    fail("bridge ollama", `status ${tags.status}${tags.error ? ` (${tags.error})` : ""}`);
  const qwen = tags.body?.models?.filter((m) => m?.name === manifest.ollama_model) ?? [];
  if (qwen.length !== 1 || qwen[0].digest !== manifest.ollama_model_digest)
    fail("bridge ollama", `${manifest.ollama_model} missing or digest differs from the runtime manifest`);
} else {
  for (const row of await inspectLocalModels({ key: env("LAYA_API_KEY"), shellKeyDiffers: false }))
    if (!row.ok) fail(`loopback ${row.service}`, row.code);
}
ok(
  "models",
  `laya ${manifest.laya_checkpoint_revision.slice(0, 12)}, qwen ${manifest.ollama_model_digest.slice(0, 12)}`,
);

// 5. The app answers: an unauthenticated run read is a 401 envelope (503 means it lost its config).
const app = await getJson(`${APP_URL}/api/v1/runs/00000000-0000-4000-8000-000000000000`);
if (app.status !== 401 || app.body?.error?.code !== "UNAUTHENTICATED")
  fail("app", `${APP_URL} answered ${app.status}, expected 401 UNAUTHENTICATED`);
ok("app", `${APP_URL} gateway answers`);
console.log("verify:release passed. Run one live question on the judged runtime before handing over.");
