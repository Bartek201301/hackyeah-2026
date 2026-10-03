import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import api from "../../../docs/contracts/openapi.json";
import { check, type SchemaName } from "./validate";

const doc = (file: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../docs/contracts/${file}`, import.meta.url), "utf8"));

// Same example → schema mapping as scripts/validate-docs.mjs.
const examples: Record<string, SchemaName> = {
  "examples/search.request.json": "SearchRequest",
  "examples/chat.request.json": "ChatRequest",
  "examples/export.request.json": "ExportRequest",
  "examples/source.request.json": "SourceRequest",
  "examples/review.request.json": "ReviewRequest",
  "examples/policy.request.json": "PolicyUpdate",
  "examples/feed.request.json": "FeedUpdate",
  "examples/blocked.response.json": "Response",
  "policy.example.json": "GatewayPolicy",
  "threat-feed.example.json": "ThreatFeed",
};

describe("contract validators", () => {
  it.each(Object.entries(examples))("%s passes %s", (file, name) => {
    expect(check(name, doc(file))).toEqual({ ok: true, value: doc(file) });
  });

  it("rejects unknown fields without echoing input", () => {
    const request = { ...(doc("examples/chat.request.json") as object), role: "admin" };
    expect(check("ChatRequest", request)).toEqual({
      ok: false,
      errors: ["/ must NOT have additional properties"],
    });
  });

  it("compiles every schema name", () => {
    const names = [...Object.keys(api.components.schemas), "GatewayPolicy", "ThreatFeed"];
    for (const name of names) expect(() => check(name as SchemaName, null)).not.toThrow();
  });
});
