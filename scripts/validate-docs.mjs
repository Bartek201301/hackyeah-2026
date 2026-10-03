import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

// The repository's locked ESLint dependency supplies AJV 6. The contracts use only
// assertions shared by draft-07 and 2020-12; reject new unsupported keywords here.
// T01 will add the direct AJV 2020 runtime dependency for application validation.
const require = createRequire(import.meta.url);
const Ajv = require("ajv");
const root = process.cwd();
const read = (file) => readFileSync(resolve(root, file), "utf8");
const json = (file) => JSON.parse(read(file));
const base = "docs/contracts/";
const api = json(`${base}openapi.json`);
assert.equal(api.openapi, "3.1.0");
const policy = json(`${base}policy.schema.json`);
const feed = json(`${base}threat-feed.schema.json`);
const allowed = new Set([
  "$schema",
  "$id",
  "$ref",
  "title",
  "description",
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "const",
  "enum",
  "anyOf",
  "oneOf",
  "allOf",
  "format",
  "default",
  "definitions",
]);
function compatible(schema) {
  if (typeof schema !== "object" || schema === null) return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    assert(allowed.has(key), `Unsupported schema keyword: ${key}`);
    if (["$schema", "$id"].includes(key)) continue;
    if (key === "$ref") {
      out[key] = value
        .replace("#/components/schemas/", "#/definitions/")
        .replace("./policy.schema.json", "#/definitions/GatewayPolicy")
        .replace("./threat-feed.schema.json", "#/definitions/ThreatFeed");
    } else if (key === "properties" || key === "definitions") {
      out[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, compatible(v)]));
    } else if (["items", "additionalProperties"].includes(key) && typeof value === "object") {
      out[key] = compatible(value);
    } else if (["anyOf", "oneOf", "allOf"].includes(key)) {
      out[key] = value.map(compatible);
    } else out[key] = value;
  }
  return out;
}
const definitions = compatible({
  definitions: { ...api.components.schemas, GatewayPolicy: policy, ThreatFeed: feed },
}).definitions;
const ajv = new Ajv({ allErrors: true, strictKeywords: true, unknownFormats: ["binary"] });
function validate(name, value) {
  const test = ajv.compile({ $ref: `#/definitions/${name}`, definitions });
  assert(test(value), `${name}: ${JSON.stringify(test.errors)}`);
}
const examples = {
  "search.request": "SearchRequest",
  "chat.request": "ChatRequest",
  "export.request": "ExportRequest",
  "source.request": "SourceRequest",
  "review.request": "ReviewRequest",
  "policy.request": "PolicyUpdate",
  "feed.request": "FeedUpdate",
  "blocked.response": "Response",
};
validate("GatewayPolicy", json(`${base}policy.example.json`));
validate("ThreatFeed", json(`${base}threat-feed.example.json`));
for (const [file, schema] of Object.entries(examples)) validate(schema, json(`${base}examples/${file}.json`));
for (const name of Object.keys(definitions)) ajv.compile({ $ref: `#/definitions/${name}`, definitions });
const defaults = json(`${base}policy.example.json`);
for (const thresholds of Object.values(defaults.semantic.thresholds))
  assert(thresholds.review < thresholds.block);
assert(defaults.semantic.overlap_tokens < defaults.semantic.window_tokens);
assert(
  defaults.execution.max_input_utf8_bytes +
    defaults.execution.template_token_reserve +
    defaults.execution.max_output_tokens <=
    defaults.execution.context_tokens,
);
assert.equal(defaults.semantic.required, true);
const operationIds = new Set();
for (const [path, methods] of Object.entries(api.paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    assert(!operationIds.has(operation.operationId), `Duplicate operation ${operation.operationId}`);
    operationIds.add(operation.operationId);
    assert(operation.responses && operation.summary);
    for (const param of path.matchAll(/\{([^}]+)\}/g)) {
      assert(operation.parameters.some((p) => p.in === "path" && p.name === param[1] && p.required));
    }
    if (["post", "put"].includes(method))
      assert(operation.parameters.some((p) => p.name === "Idempotency-Key" && p.required));
  }
}
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const path = resolve(dir, item.name);
    return item.isDirectory() ? walk(path) : [path];
  });
}
const active = [
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "DESIGN.md",
  "docs/README.md",
  ...["docs/product", "docs/team", "docs/contracts", "docs/testing", "docs/demo", "docs/pitch"].flatMap(
    (dir) =>
      walk(resolve(root, dir))
        .filter((f) => f.endsWith(".md"))
        .map((f) => relative(root, f)),
  ),
];
let links = 0;
for (const file of active) {
  const text = read(file).replace(/```[\s\S]*?```/g, "");
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    assert(existsSync(resolve(dirname(resolve(root, file)), target)), `${file}: missing link ${target}`);
    links++;
  }
}
const acceptance = read("docs/testing/acceptance.md");
const plan = read("docs/team/implementation-plan.md");
const requirements = read("docs/product/requirements.md");
for (let i = 1; i <= 20; i++) {
  const id = `R${String(i).padStart(2, "0")}`;
  assert(requirements.includes(`| ${id} |`), `Missing requirement ${id}`);
  assert(
    acceptance.split("\n").some((line) => line.startsWith("| AT") && line.includes(id)),
    `Unmapped acceptance ${id}`,
  );
  assert(plan.includes(id), `Unmapped task ${id}`);
}
const fixtures = json("docs/demo/fixtures.json");
assert.equal(new Set(fixtures.documents.map((d) => d.id)).size, fixtures.documents.length);
assert.equal(fixtures.accounts.length, 4);
const semantic = json("docs/testing/semantic-cases.json");
assert.equal(semantic.cases.length, 24);
for (const split of ["development", "held_out"])
  for (const category of ["benign", "attack", "hard_benign"]) {
    assert.equal(semantic.cases.filter((c) => c.split === split && c.category === category).length, 4);
  }
assert(read("CLAUDE.md").startsWith("@AGENTS.md"));
assert.equal((read("docs/pitch/presentation.html").match(/aria-roledescription="slide"/g) || []).length, 6);
console.log(
  `Documentation checks passed: ${Object.keys(examples).length + 2} schema examples, ${operationIds.size} operations, ${links} local links, 20 mapped requirements, 24 semantic cases, 6 slides.`,
);
console.log(
  "Schema assertions checked with locked AJV 6 using the shared draft-07/2020-12 subset; this is not a full OpenAPI conformance certification.",
);
