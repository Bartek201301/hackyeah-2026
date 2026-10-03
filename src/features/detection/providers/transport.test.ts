import { describe, expect, it, vi } from "vitest";
import policy from "../../../../docs/contracts/policy.example.json";
import type { GatewayPolicy, GenerationPort } from "@/shared/contracts";
import { assessLocalWindow, generateLocal } from "./clients";
import { QWEN_DIGEST, QWEN_MODEL } from "./ollama";
import { createBridgeTransport, createLoopbackTransport, type LocalEndpoint } from "./transport";

const request = () => ({
  body: { synthetic: true },
  bearer: "synthetic-secret",
  deadline: Date.now() + 1000,
  signal: new AbortController().signal,
});
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
const genInput = (): Parameters<GenerationPort["generate"]>[0] => ({
  call_id: "ca984d6b-7475-4aa0-baff-a4e34e21d937",
  messages: [{ role: "user", content: "Synthetic." }],
  tools: [],
  limits: structuredClone((policy as GatewayPolicy).execution),
});

describe("bounded loopback transport (in-process fake provider)", () => {
  it("pins URL, path, auth, JSON, redirect refusal and abort signal", async () => {
    const provider = vi.fn<typeof fetch>().mockImplementation(async () => json({ ok: true }));
    await expect(createLoopbackTransport(provider)("layaAssess", request())).resolves.toEqual({ ok: true });
    expect(provider).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/v1/systemone",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        body: '{"synthetic":true}',
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          authorization: "Bearer synthetic-secret",
          "content-type": "application/json",
        }),
      }),
    );
  });
  it.each(["arbitrary", "http://evil.test", "__proto__"])(
    "refuses unsupported endpoint %s with zero dispatch",
    async (endpoint) => {
      const provider = vi.fn<typeof fetch>();
      await expect(
        createLoopbackTransport(provider)(endpoint as LocalEndpoint, request()),
      ).rejects.toMatchObject({ code: "invalid_input", dispatched: false, input_tokens: null });
      expect(provider).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, "", "bad\r\nsecret"])(
    "refuses absent/invalid Laya bearer without dispatch",
    async (bearer) => {
      const provider = vi.fn<typeof fetch>();
      await expect(
        createLoopbackTransport(provider)("layaAssess", { ...request(), bearer }),
      ).rejects.toMatchObject({ code: "invalid_input", dispatched: false });
      expect(provider).not.toHaveBeenCalled();
    },
  );
  it("never sends Laya credentials to Ollama", async () => {
    const provider = vi.fn<typeof fetch>().mockResolvedValue(json({ ok: true }));
    await expect(createLoopbackTransport(provider)("ollamaChat", request())).rejects.toThrow("invalid_input");
    await createLoopbackTransport(provider)("ollamaChat", { ...request(), bearer: undefined });
    expect(provider.mock.calls[0][0]).toBe("http://127.0.0.1:11434/api/chat");
    expect(provider.mock.calls[0][1]?.headers).not.toHaveProperty("authorization");
  });
  it("refuses overlarge request before dispatch", async () => {
    const provider = vi.fn<typeof fetch>();
    await expect(
      createLoopbackTransport(provider)("layaAssess", { ...request(), body: "x".repeat(262144) }),
    ).rejects.toMatchObject({ code: "body_limit", dispatched: false });
    expect(provider).not.toHaveBeenCalled();
  });
  it("bounds declared and chunked responses and cancels readers", async () => {
    for (const declared of [true, false]) {
      const cancel = vi.fn();
      const response = new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(65537));
          },
          cancel,
        }),
        {
          headers: { "content-type": "application/json", ...(declared ? { "content-length": "65537" } : {}) },
        },
      );
      await expect(
        createLoopbackTransport(vi.fn<typeof fetch>().mockResolvedValue(response))("layaAssess", request()),
      ).rejects.toMatchObject({ code: "body_limit", dispatched: true, input_tokens: null });
      expect(cancel).toHaveBeenCalled();
    }
  });
  it.each(["not JSON private-body", '{"ok":true} trailing', new Uint8Array([0xff])])(
    "rejects malformed full response without leaking raw body",
    async (body) => {
      const provider = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(body, { headers: { "content-type": "application/json" } }));
      await expect(createLoopbackTransport(provider)("layaAssess", request())).rejects.toMatchObject({
        code: "invalid_response",
        message: "invalid_response",
        dispatched: true,
      });
    },
  );
  it.each([302, 401, 429, 500])("maps HTTP %s without exposing response secrets", async (status) => {
    const provider = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("private-provider-error synthetic-secret", { status }));
    await expect(createLoopbackTransport(provider)("layaAssess", request())).rejects.toMatchObject({
      code: "http_error",
      message: "http_error",
      input_tokens: null,
      dispatched: true,
    });
  });
  it("does not retain causes or log protected data on network failure", async () => {
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    try {
      const provider = vi.fn<typeof fetch>().mockRejectedValue(new Error("synthetic-secret private-body"));
      let error: unknown;
      try {
        await createLoopbackTransport(provider)("layaAssess", request());
      } catch (e) {
        error = e;
      }
      expect(error).toMatchObject({ message: "unavailable", dispatched: true, input_tokens: null });
      expect(error).not.toHaveProperty("cause");
      expect(JSON.stringify(error)).not.toContain("synthetic-secret");
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    } finally {
      logs.forEach((log) => log.mockRestore());
    }
  });
  it.each(["timeout", "cancelled"] as const)(
    "interrupts stalled fetch and body reads: %s",
    async (reason) => {
      for (const phase of ["fetch", "body"]) {
        const controller = new AbortController();
        const response = new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode('{"partial":'));
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
        const provider = vi
          .fn<typeof fetch>()
          .mockImplementation(() =>
            phase === "fetch" ? new Promise<Response>(() => undefined) : Promise.resolve(response),
          );
        const pending = createLoopbackTransport(provider)("layaAssess", {
          ...request(),
          signal: controller.signal,
          deadline: Date.now() + (reason === "timeout" ? 20 : 1000),
        });
        if (reason === "cancelled") setTimeout(() => controller.abort(), 10);
        await expect(pending).rejects.toMatchObject({
          code: reason,
          dispatched: true,
          input_tokens: null,
          output_tokens: null,
        });
        expect(provider.mock.calls[0][1]?.signal?.aborted).toBe(true);
      }
    },
  );
  it("rejects pre-abort and expired deadline without dispatch", async () => {
    const provider = vi.fn<typeof fetch>();
    const controller = new AbortController();
    controller.abort();
    await expect(
      createLoopbackTransport(provider)("layaAssess", { ...request(), signal: controller.signal }),
    ).rejects.toMatchObject({ code: "cancelled", dispatched: false });
    await expect(
      createLoopbackTransport(provider)("layaAssess", { ...request(), deadline: Date.now() - 1 }),
    ).rejects.toMatchObject({ code: "timeout", dispatched: false });
    expect(provider).not.toHaveBeenCalled();
  });
});

describe("authenticated bridge transport (in-process fake provider)", () => {
  const token = "a".repeat(64);
  it("sends its captured bearer to exactly the four fixed HTTPS paths", async () => {
    const provider = vi.fn<typeof fetch>().mockImplementation(async () => json({ ok: true }));
    const bridge = createBridgeTransport("https://bridge.example.invalid", token, provider);
    expect(bridge).not.toBeNull();
    for (const endpoint of ["layaHealth", "layaAssess", "ollamaTags", "ollamaChat"] as const) {
      await bridge?.(endpoint, {
        ...request(),
        body: endpoint === "layaAssess" || endpoint === "ollamaChat" ? { synthetic: true } : undefined,
        bearer: endpoint.startsWith("laya") ? token : undefined,
      });
    }
    expect(provider.mock.calls.map(([url]) => url)).toEqual([
      "https://bridge.example.invalid/laya/health",
      "https://bridge.example.invalid/laya/v1/systemone",
      "https://bridge.example.invalid/ollama/api/tags",
      "https://bridge.example.invalid/ollama/api/chat",
    ]);
    for (const [, init] of provider.mock.calls) {
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
      expect(init).toMatchObject({ redirect: "error", cache: "no-store" });
    }
  });
  it.each([
    "http://bridge.example.invalid",
    "https://bridge.example.invalid/path",
    "https://bridge.example.invalid/?x=1",
    "https://user:pass@bridge.example.invalid",
    "https://bridge.example.invalid/#fragment",
  ])("rejects bad bridge origin %s", (url) => {
    expect(createBridgeTransport(url, token, vi.fn<typeof fetch>())).toBeNull();
  });
  it("rejects invalid token and a caller bearer mismatch", async () => {
    expect(createBridgeTransport("https://bridge.example.invalid", "short")).toBeNull();
    const provider = vi.fn<typeof fetch>();
    const bridge = createBridgeTransport("https://bridge.example.invalid", token, provider);
    await expect(
      bridge?.("layaHealth", { ...request(), bearer: "wrong", body: undefined }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      dispatched: false,
    });
    expect(provider).not.toHaveBeenCalled();
  });
});

describe("private clients require validated input and current metadata", () => {
  it("rejects extra Laya questions and unsupported generation model before even health calls", async () => {
    const transport = vi.fn();
    const input = {
      call_id: "ca984d6b-7475-4aa0-baff-a4e34e21d937",
      operation: "chat",
      audience: "actor" as const,
      text: "synthetic",
      questions: [],
    };
    await expect(
      assessLocalWindow(
        input,
        (policy as GatewayPolicy).semantic,
        "synthetic-secret",
        new AbortController().signal,
        transport,
      ),
    ).rejects.toThrow("invalid_input");
    const generation = genInput();
    Object.assign(generation.limits, { generation_model: "other" });
    await expect(generateLocal(generation, new AbortController().signal, transport)).rejects.toThrow(
      "invalid_input",
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it("does not dispatch inference with missing/mismatched digest", async () => {
    const transport = vi.fn().mockResolvedValue({ models: [{ name: QWEN_MODEL, digest: "wrong" }] });
    await expect(generateLocal(genInput(), new AbortController().signal, transport)).rejects.toThrow(
      "revision_mismatch",
    );
    expect(transport.mock.calls.map((c) => c[0])).toEqual(["ollamaTags"]);
  });
  it("withholds output if digest changes after dispatch, retaining genuine counts", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce({ models: [{ name: QWEN_MODEL, digest: QWEN_DIGEST }] })
      .mockResolvedValueOnce({
        model: QWEN_MODEL,
        created_at: "2026-10-03T18:00:00Z",
        message: { role: "assistant", content: "synthetic" },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 42,
        eval_count: 7,
      })
      .mockResolvedValueOnce({ models: [] });
    await expect(generateLocal(genInput(), new AbortController().signal, transport)).rejects.toMatchObject({
      code: "revision_mismatch",
      dispatched: true,
      input_tokens: 42,
      output_tokens: 7,
    });
    expect(transport.mock.calls.map((c) => c[0])).toEqual(["ollamaTags", "ollamaChat", "ollamaTags"]);
    expect(new Set(transport.mock.calls.map((c) => c[1].deadline)).size).toBe(1);
  });
});

describe("Ollama transport failure accounting", () => {
  it.each(["timeout", "cancelled", "http_error"] as const)("retains unknown usage on %s", async (reason) => {
    const controller = new AbortController();
    const provider = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        reason === "http_error"
          ? Promise.resolve(new Response("private", { status: 500 }))
          : new Promise<Response>(() => undefined),
      );
    const pending = createLoopbackTransport(provider)("ollamaChat", {
      ...request(),
      bearer: undefined,
      signal: controller.signal,
      deadline: Date.now() + 20,
    });
    if (reason === "cancelled") controller.abort();
    await expect(pending).rejects.toMatchObject({
      code: reason,
      dispatched: true,
      input_tokens: null,
      output_tokens: null,
    });
  });
});
