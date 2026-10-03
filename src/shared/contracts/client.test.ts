import { describe, expect, it } from "vitest";
import { readEnvelope } from "./client";

const envelope = { trace_id: "00000000-0000-4000-8000-000000000001", decision: null };
const response = (status: number) => new Response(null, { status });

describe("readEnvelope", () => {
  it("returns a 2xx envelope from data", () => {
    expect(readEnvelope({ data: envelope, response: response(200) })).toEqual({
      status: 200,
      body: envelope,
    });
  });

  it("returns a 403 envelope from error", () => {
    expect(readEnvelope({ error: envelope, response: response(403) })).toEqual({
      status: 403,
      body: envelope,
    });
  });

  it("returns a 503 envelope from error", () => {
    expect(readEnvelope({ error: envelope, response: response(503) }).body).toBe(envelope);
  });

  it("returns null for a non-envelope error", () => {
    expect(readEnvelope({ error: "Bad Gateway", response: response(502) })).toEqual({
      status: 502,
      body: null,
    });
  });
});
