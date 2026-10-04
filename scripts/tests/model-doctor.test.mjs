import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectLocalModels } from "../model-doctor.mjs";

const manifest = JSON.parse(
  readFileSync(new URL("../../src/shared/contracts/runtime-manifest.json", import.meta.url), "utf8"),
);
const tags = { models: [{ name: manifest.ollama_model, digest: manifest.ollama_model_digest }] };
const fullHealth = {
  loaded: [manifest.laya_models],
  revisions: { [manifest.laya_models]: manifest.laya_checkpoint_revision },
};
const fetcher = (health) => async (url) =>
  new Response(JSON.stringify(url.endsWith("/health") ? health : tags));

test("public health is not mistaken for authenticated readiness", async () => {
  const rows = await inspectLocalModels({ key: "synthetic-test-key" }, fetcher({ status: "ok" }));
  assert.equal(rows[0].code, "authenticated_health_missing");
  assert.equal(rows[0].ok, false);
  assert.equal(rows[1].ok, true);
  assert.doesNotMatch(JSON.stringify(rows), /synthetic-test-key/);
});

test("connection refusal names the unavailable service", async () => {
  const rows = await inspectLocalModels({ key: "synthetic-test-key" }, async (url) => {
    if (url.endsWith("/health")) throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    return new Response(JSON.stringify(tags));
  });
  assert.equal(rows[0].code, "not_running");
  assert.match(rows[0].message, /127\.0\.0\.1:8000/);
  assert.equal(rows[1].ok, true);
});

test("requires the pinned model and reports stale shell override without its value", async () => {
  const rows = await inspectLocalModels(
    { key: "synthetic-test-key", shellKeyDiffers: true },
    fetcher(fullHealth),
  );
  assert.equal(rows[0].code, "shell_key_override");
  assert.equal(rows[1].ok, true);
  assert.equal(rows[2].ok, true);
  assert.doesNotMatch(JSON.stringify(rows), /synthetic-test-key/);
  const wrong = await inspectLocalModels(
    { key: "synthetic-test-key" },
    fetcher({ ...fullHealth, revisions: { [manifest.laya_models]: "wrong" } }),
  );
  assert.equal(wrong[0].code, "revision_mismatch");
});
