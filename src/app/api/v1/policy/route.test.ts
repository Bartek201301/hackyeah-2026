import { beforeEach, expect, it, vi } from "vitest";
import policy from "../../../../../docs/contracts/policy.example.json";
import { GatewayError } from "@/shared/gateway/envelope";
import { PUT } from "./route";

const { getActor, write } = vi.hoisted(() => ({ getActor: vi.fn(), write: vi.fn() }));
vi.mock("@/shared/auth/actor", () => ({ getActor }));
vi.mock("../composition", () => ({ gatewayDeps: () => ({ repository: { updatePolicy: write } }) }));
const key = "11111111-1111-4111-8111-111111111111";
const actor = {
  actor_id: key,
  organisation_id: key,
  role: "admin",
  deal_ids: [],
  audience: "actor",
  scopes: [],
};
const request = (headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/v1/policy", {
    method: "PUT",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
      "idempotency-key": key,
      ...headers,
    },
    body: JSON.stringify({ expected_version: 1, policy: { ...policy, version: 2 } }),
  });
beforeEach(() => {
  getActor.mockReset().mockResolvedValue(actor);
  write.mockReset().mockResolvedValue({ trace_id: key, policy_version: 2, feed_version: 1 });
});
it("wires authenticated PUT through validation and returns the committed version with no-store", async () => {
  const response = await PUT(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ decision: "ALLOW", data: { version: 2 } });
  expect(write).toHaveBeenCalledWith(
    expect.objectContaining({ actor, idempotencyKey: key, expectedVersion: 1 }),
  );
});
it("rejects a foreign origin, missing session, non-admin and invalid key without a write", async () => {
  expect((await PUT(request({ origin: "https://untrusted.example" }))).status).toBe(403);
  getActor.mockResolvedValueOnce(null);
  expect((await PUT(request())).status).toBe(401);
  getActor.mockResolvedValueOnce({ ...actor, role: "employee" });
  expect((await PUT(request())).status).toBe(403);
  expect((await PUT(request({ "idempotency-key": "invalid" }))).status).toBe(400);
  expect(write).not.toHaveBeenCalled();
});
it.each([
  ["CONFLICT", 409],
  ["STATE_UNAVAILABLE", 503],
] as const)("maps %s without claiming a policy change", async (code, status) => {
  write.mockRejectedValueOnce(new GatewayError(code));
  const response = await PUT(request());
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ decision: null, data: null, error: { code } });
});
