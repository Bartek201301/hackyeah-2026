import { beforeEach, expect, it, vi } from "vitest";
import { envelope } from "@/shared/gateway/envelope";
import { assessStandalone } from "@/shared/gateway/standalone-check";

vi.mock("@/shared/auth/integration-token", () => ({
  resolveIntegrationToken: vi.fn(async (header, scope) => {
    if (header !== "Bearer test" || (scope && !["guard:prompt", "guard:tool"].includes(scope))) return null;
    return {
      tokenId: "token",
      actor: {
        actor_id: "actor",
        organisation_id: "org",
        role: "employee",
        deal_ids: [],
        audience: "public",
        scopes: ["guard:prompt", "guard:tool"],
      },
    };
  }),
}));
vi.mock("@/app/api/v1/composition", () => ({ gatewayDeps: () => ({ repository: {} }) }));
vi.mock("@/shared/gateway/calls", () => ({
  loadControls: vi.fn(async () => ({
    policy: {
      client_guard: { allowed_tools: ["Read", "Edit"], editable_extensions: [".ts"] },
    },
  })),
}));
vi.mock("@/shared/gateway/standalone-check", () => ({
  assessStandalone: vi.fn(async (deps, input) => ({
    status: input.hardReason ? 403 : 200,
    body: envelope({
      trace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      decision: input.hardReason ? "BLOCK" : "ALLOW",
    }),
  })),
}));
import { POST } from "./route";

const endpoint = "http://localhost:3000/api/v1/guard/check";
const send = (body: unknown, auth = "Bearer test", origin?: string) =>
  POST(
    new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth, ...(origin ? { origin } : {}) },
      body: JSON.stringify(body),
    }),
  );
beforeEach(() => {
  process.env.INTERLOCK_PUBLIC_ORIGIN = "http://localhost:3000";
  vi.clearAllMocks();
});

it("accepts a bounded prompt from a hook-scoped bearer and returns the gateway envelope", async () => {
  const response = await send({ event_type: "prompt", event_id: "p1", prompt: "Hello" });
  expect(response.status).toBe(200);
  expect((await response.json()).decision).toBe("ALLOW");
  expect(vi.mocked(assessStandalone).mock.calls[0]?.[1]).toMatchObject({
    stage: "claude_prompt",
    scope: "guard:prompt",
    text: "Hello",
  });
});

it("rejects forged roles, missing identity and unexpected Origin before assessment", async () => {
  expect((await send({ event_type: "prompt", event_id: "p1", prompt: "Hello", role: "admin" })).status).toBe(
    400,
  );
  expect((await send({ event_type: "prompt", event_id: "p1", prompt: "Hello" }, "Bearer wrong")).status).toBe(
    401,
  );
  expect(
    (
      await send(
        { event_type: "prompt", event_id: "p1", prompt: "Hello" },
        "Bearer test",
        "https://evil.example",
      )
    ).status,
  ).toBe(403);
  expect(vi.mocked(assessStandalone)).not.toHaveBeenCalled();
});

it("marks shell execution as a deterministic denial and sends no shell command to the model", async () => {
  const response = await send({ event_type: "tool", event_id: "t1", tool_name: "Bash" });
  expect(response.status).toBe(403);
  expect((await response.json()).decision).toBe("BLOCK");
  expect(vi.mocked(assessStandalone).mock.calls[0]?.[1]).toMatchObject({
    stage: "claude_tool",
    hardReason: "TOOL_NOT_ALLOWED",
    text: "Bash",
  });
});
