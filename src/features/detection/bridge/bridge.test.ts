// TEST FAKE: isolated relay requests and in-process upstream responses only.
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBridgeServer } from "./bridge.mjs";

const token = "a".repeat(64);
const auth = { authorization: `Bearer ${token}` };
const running: Server[] = [];
async function start(fetcher: typeof fetch = vi.fn<typeof fetch>()) {
  const logger = vi.fn();
  const server = createBridgeServer({ token, layaKey: "private-laya-key", fetcher, logger });
  running.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no test port");
  return { url: `http://127.0.0.1:${address.port}`, logger };
}
afterEach(async () => {
  await Promise.all(
    running.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

describe("fixed-route model relay", () => {
  it("rejects wrong tokens, including equal-length values, before upstream dispatch", async () => {
    const upstream = vi.fn<typeof fetch>();
    const { url, logger } = await start(upstream);
    for (const value of ["wrong", "b".repeat(64)]) {
      const response = await fetch(`${url}/laya/health`, {
        headers: { authorization: `Bearer ${value}` },
      });
      expect(response.status).toBe(401);
      expect(await response.text()).toBe("");
    }
    expect(upstream).not.toHaveBeenCalled();
    expect(logger.mock.calls.every(([, route, status]) => route === "/laya/health" && status === 401)).toBe(
      true,
    );
    expect(readFileSync(new URL("./bridge.mjs", import.meta.url), "utf8")).toContain(
      "timingSafeEqual(actual, expected)",
    );
  });
  it("returns a detail-free 404 for unknown routes", async () => {
    const { url, logger } = await start();
    const response = await fetch(`${url}/unlisted?token=private`, { headers: auth });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(logger.mock.calls[0][1]).toBe("unknown");
  });
  it("rejects oversized JSON and wrong pinned model fields", async () => {
    const upstream = vi.fn<typeof fetch>();
    const { url } = await start(upstream);
    const oversized = await fetch(`${url}/laya/v1/systemone`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ model: "typed-decisions", text: "x".repeat(262144) }),
    });
    expect(oversized.status).toBe(413);
    const wrongLaya = await fetch(`${url}/laya/v1/systemone`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ model: "other" }),
    });
    expect(wrongLaya.status).toBe(400);
    const wrongQwen = await fetch(`${url}/ollama/api/chat`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ model: "qwen3:8b", stream: true, think: false }),
    });
    expect(wrongQwen.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("forwards only fixed endpoints, replaces Laya auth and omits Ollama auth", async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response('{"ok":true}', { headers: { "content-type": "application/json" } }),
      );
    const { url } = await start(upstream);
    for (const path of ["/laya/health", "/ollama/api/tags"]) {
      const response = await fetch(`${url}${path}`, { headers: auth });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    }
    expect(upstream.mock.calls.map(([target]) => target)).toEqual([
      "http://127.0.0.1:8000/health",
      "http://127.0.0.1:11434/api/tags",
    ]);
    expect(new Headers(upstream.mock.calls[0][1]?.headers).get("authorization")).toBe(
      "Bearer private-laya-key",
    );
    expect(new Headers(upstream.mock.calls[1][1]?.headers).get("authorization")).toBeNull();
  });
  it("admits at most two calls and returns a bounded error response", async () => {
    const pending: Array<(value: Response) => void> = [];
    const upstream = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          pending.push(resolve);
        }),
    );
    const { url } = await start(upstream);
    const first = fetch(`${url}/laya/health`, { headers: auth });
    const second = fetch(`${url}/ollama/api/tags`, { headers: auth });
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    const excess = await fetch(`${url}/laya/health`, { headers: auth });
    expect(excess.status).toBe(503);
    expect(await excess.text()).toBe("");
    for (const resolve of pending)
      resolve(new Response('{"ok":true}', { headers: { "content-type": "application/json" } }));
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);

    upstream.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: "x".repeat(32768) }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const oversized = await fetch(`${url}/laya/health`, { headers: auth });
    expect(oversized.status).toBe(502);
    expect(await oversized.text()).toBe("");
  });
});
