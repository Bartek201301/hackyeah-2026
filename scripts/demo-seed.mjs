// Idempotent demo seed: organisation, deals, the four prepared accounts with trusted memberships,
// policy v1, feed v1, the control head, and the seven dataset sources with their raw fixture rows.
// Approves no content (no documents, excerpts or Storage objects), never resets or deletes users and
// never prints passwords, keys or row text.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { admin, fixtures, must, passwordFor } from "./db/clients.mjs";

const readJson = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const SEED_BATCH_ID = "00000000-0000-4000-8000-000000000301";
const sha256 = (document) => createHash("sha256").update(JSON.stringify(document)).digest("hex");

try {
  const db = admin();
  const org = fixtures.organisation.id;
  const dealIds = Object.fromEntries(fixtures.deals.map((deal) => [deal.alias, deal.id]));

  must(
    "organisations",
    await db
      .from("organisations")
      .upsert({ id: org, name: fixtures.organisation.name }, { onConflict: "id" }),
  );
  must(
    "deals",
    await db.from("deals").upsert(
      fixtures.deals.map((deal) => ({ id: deal.id, organisation_id: org, label: deal.name })),
      { onConflict: "id" },
    ),
  );

  const { users } = must("list users", await db.auth.admin.listUsers({ perPage: 1000 }));
  const ids = {};
  let created = 0;
  for (const account of fixtures.accounts) {
    let user = users.find((candidate) => candidate.email === account.email);
    if (!user) {
      ({ user } = must(
        `create user ${account.alias}`,
        await db.auth.admin.createUser({
          email: account.email,
          password: passwordFor(account.alias),
          email_confirm: true,
        }),
      ));
      created++;
    }
    ids[account.alias] = user.id;
  }

  must(
    "memberships",
    await db.from("memberships").upsert(
      fixtures.accounts.map((account) => ({
        organisation_id: org,
        actor_id: ids[account.alias],
        role: account.role,
        active: true,
      })),
      { onConflict: "organisation_id,actor_id" },
    ),
  );
  must(
    "deal_memberships",
    await db.from("deal_memberships").upsert(
      fixtures.accounts.flatMap((account) =>
        account.deal_aliases.map((alias) => ({
          organisation_id: org,
          deal_id: dealIds[alias],
          actor_id: ids[account.alias],
        })),
      ),
      { onConflict: "organisation_id,deal_id,actor_id", ignoreDuplicates: true },
    ),
  );

  const policy = readJson("docs/contracts/policy.example.json");
  const feed = readJson("docs/contracts/threat-feed.example.json");
  const insertOnce = { onConflict: "organisation_id,version", ignoreDuplicates: true };
  must(
    "policy_versions",
    await db
      .from("policy_versions")
      .upsert(
        { organisation_id: org, version: 1, document: policy, sha256: sha256(policy), created_by: ids.admin },
        insertOnce,
      ),
  );
  must(
    "feed_versions",
    await db.from("feed_versions").upsert(
      {
        organisation_id: org,
        version: 1,
        document: feed,
        sha256: sha256(feed),
        source: "seed",
        expires_at: feed.expires_at,
        created_by: ids.admin,
      },
      insertOnce,
    ),
  );
  // Insert-if-absent: a later head (T07) is never moved back.
  must(
    "control_heads",
    await db
      .from("control_heads")
      .upsert(
        { organisation_id: org, policy_version: 1, feed_version: 1, revision: 1 },
        { onConflict: "organisation_id", ignoreDuplicates: true },
      ),
  );

  // MIX-01 and REV-01 stay quarantined for the live upload. Raw rows are untrusted until the gateway
  // imports them; the payload is exactly the CSV schema.
  const datasets = fixtures.documents.filter((document) => document.initial_status !== "quarantined");
  const sources = must(
    "sources",
    await db
      .from("sources")
      .upsert(
        datasets.map((document) => ({
          organisation_id: org,
          kind: "dataset",
          dataset_key: document.alias,
          label: document.alias,
          classification: document.classification,
          deal_id: document.deal_alias ? dealIds[document.deal_alias] : null,
          audience_evidence: document.audience_evidence,
          created_by: ids.admin,
        })),
        { onConflict: "organisation_id,dataset_key" },
      )
      .select("id, dataset_key"),
  );
  const sourceIds = Object.fromEntries(sources.map((source) => [source.dataset_key, source.id]));
  const rows = must(
    "dataset_rows",
    await db
      .from("dataset_rows")
      .upsert(
        datasets.map(({ alias, text, source_date, period, unit, fact_key, basis }) => ({
          organisation_id: org,
          batch_id: SEED_BATCH_ID,
          source_id: sourceIds[alias],
          row_number: 1,
          payload: { text, source_date, period, unit, fact_key, basis },
        })),
        { onConflict: "source_id,batch_id,row_number" },
      )
      .select("id"),
  );

  console.log(`users created: ${created}, existing: ${fixtures.accounts.length - created}`);
  console.log("| alias | email | role | deals | uuid |\n| --- | --- | --- | --- | --- |");
  for (const account of fixtures.accounts)
    console.log(
      `| ${account.alias} | ${account.email} | ${account.role} | ${account.deal_aliases.join(", ") || "-"} | ${ids[account.alias]} |`,
    );
  console.log(`sources: ${sources.length} upserted, dataset_rows: ${rows.length} upserted`);
  console.log("| alias | source_id |\n| --- | --- |");
  for (const { alias } of datasets) console.log(`| ${alias} | ${sourceIds[alias]} |`);
} catch (error) {
  console.error(`demo:seed failed — ${error.message}`);
  process.exitCode = 1;
}
