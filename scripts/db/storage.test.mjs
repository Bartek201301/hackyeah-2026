// test:db — private Storage probes (AT17 Storage). Manual, never CI. Its only write: the synthetic canary
// db-test/canary.txt, upserted and kept in both private buckets; every other upload attempt must fail.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { admin, anon, fixtures, must, signIn } from "./clients.mjs";

const BUCKETS = ["quarantine", "generated-exports"];
const CANARY = "db-test/canary.txt";
const CANARY_TEXT = "Synthetic test:db storage canary. Not demo content.";
const db = admin();
const sessions = {};
// Only an answer from the Storage API counts as denied; a network failure must not pass.
const deniedError = ({ error }) => error?.name === "StorageApiError";
const names = async (bucket) =>
  must(`list ${bucket}`, await db.storage.from(bucket).list("db-test", { limit: 1000 })).map((o) => o.name);

before(async () => {
  for (const bucket of BUCKETS)
    must(
      `upload canary to ${bucket}`,
      await db.storage
        .from(bucket)
        .upload(CANARY, new Blob([CANARY_TEXT]), { upsert: true, contentType: "text/plain" }),
    );
  for (const { alias } of fixtures.accounts) sessions[alias] = await signIn(alias);
});
after(() =>
  Promise.all(Object.values(sessions).map(({ client }) => client.auth.signOut({ scope: "local" }))),
);

test("both buckets are private and the service client holds the canary", async () => {
  for (const bucket of BUCKETS) {
    assert.equal(must(`get ${bucket}`, await db.storage.getBucket(bucket)).public, false, bucket);
    const blob = must(`download ${bucket}`, await db.storage.from(bucket).download(CANARY));
    assert.equal(await blob.text(), CANARY_TEXT, bucket);
  }
});

for (const who of ["anon", ...fixtures.accounts.map((account) => account.alias)])
  test(`${who} cannot list, download, sign or upload in private buckets`, async () => {
    const storage = (who === "anon" ? anon() : sessions[who].client).storage;
    for (const bucket of BUCKETS) {
      const listed = await storage.from(bucket).list("db-test");
      assert.ok(deniedError(listed) || listed.data.length === 0, `${who} list ${bucket}`);
      assert.ok(deniedError(await storage.from(bucket).download(CANARY)), `${who} download ${bucket}`);
      assert.ok(deniedError(await storage.from(bucket).createSignedUrl(CANARY, 60)), `${who} sign ${bucket}`);
      const probe = `probe-${randomUUID()}.txt`;
      assert.ok(
        deniedError(await storage.from(bucket).upload(`db-test/${probe}`, new Blob(["probe"]))),
        `${who} upload ${bucket}`,
      );
      assert.ok(!(await names(bucket)).includes(probe), `${who} probe stored in ${bucket}`);
    }
  });

test("public URLs do not serve the canary", async () => {
  for (const bucket of BUCKETS) {
    const { publicUrl } = anon().storage.from(bucket).getPublicUrl(CANARY).data;
    const response = await fetch(publicUrl);
    const body = await response.text();
    assert.notEqual(response.status, 200, bucket);
    assert.ok(!body.includes(CANARY_TEXT), bucket);
  }
});
