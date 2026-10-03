import { describe, expect, it } from "vitest";
import { check } from "@/shared/contracts/validate";
import { unavailableResponse } from "./unavailable";

describe("unavailableResponse", () => {
  it("returns a valid 503 envelope with no decision", async () => {
    const res = unavailableResponse("AUDIT_UNAVAILABLE");
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(check("Response", body)).toEqual({ ok: true, value: body });
    expect(body.decision).toBeNull();
    expect(body.data).toBeNull();
    expect(body.error.code).toBe("AUDIT_UNAVAILABLE");
  });

  it("defaults to STATE_UNAVAILABLE", async () => {
    expect((await unavailableResponse().json()).error.code).toBe("STATE_UNAVAILABLE");
  });
});
