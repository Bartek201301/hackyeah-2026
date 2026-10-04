import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { envelope } from "@/shared/gateway/envelope";
import { assessStandalone } from "@/shared/gateway/standalone-check";
import { searchExcerpts } from "@/shared/gateway/excerpts";

const excerpt = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  version: 1,
  text: "Public fact",
  classification: "public" as const,
  citation: {
    excerpt_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    excerpt_version: 1,
    source_label: "Public source",
    source_date: "2026-10-01",
    period: "2026",
    locator: "row:1",
  },
};

vi.mock("@/shared/auth/integration-token", () => ({
  resolveIntegrationToken: vi.fn(async (header: string | null, scope: string | null) => {
    if (header !== "Bearer test") return null;
    if (scope && !["excerpt:search", "excerpt:read"].includes(scope)) return null;
    return {
      tokenId: "token",
      actor: {
        actor_id: "actor",
        organisation_id: "org",
        role: "admin",
        deal_ids: [],
        audience: "public",
        scopes: ["excerpt:search", "excerpt:read"],
      },
    };
  }),
}));
vi.mock("@/app/api/v1/composition", () => ({ gatewayDeps: () => ({ repository: {} }) }));
vi.mock("@/shared/gateway/calls", () => ({
  loadControls: vi.fn(async () => ({ versions: { policy_version: 4, feed_version: 2 } })),
}));
vi.mock("@/shared/gateway/standalone-check", () => ({
  assessStandalone: vi.fn(async () => ({
    status: 200,
    body: envelope({
      trace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      policy_version: 4,
      feed_version: 2,
      decision: "ALLOW",
    }),
  })),
}));
vi.mock("@/shared/gateway/excerpts", () => ({
  searchExcerpts: vi.fn(async () => ({
    status: 200,
    body: envelope({
      trace_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      decision: "ALLOW",
      data: { items: [excerpt] },
    }),
  })),
  readExcerpt: vi.fn(async () => ({
    status: 200,
    body: envelope({
      trace_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      decision: "ALLOW",
      data: excerpt,
    }),
  })),
}));

import { DELETE, GET, POST } from "./route";

beforeEach(() => {
  process.env.INTERLOCK_PUBLIC_ORIGIN = "http://localhost:3000";
});
const ENDPOINT = "http://localhost:3000/api/mcp";
const fetchRoute: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  return request.method === "GET"
    ? GET(request)
    : request.method === "DELETE"
      ? DELETE(request)
      : POST(request);
};

describe("InterLock MCP route using the official SDK client", () => {
  it("discovers only the two fixed tools and calls both through a public credential", async () => {
    const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
      fetch: fetchRoute,
      requestInit: { headers: { authorization: "Bearer test" } },
    });
    const client = new Client({ name: "integration-test", version: "1.0.0" });
    try {
      await client.connect(transport);
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(["read_excerpt", "search_excerpts"]);
      const search = await client.callTool({ name: "search_excerpts", arguments: { query: "revenue" } });
      expect(search.isError).not.toBe(true);
      expect(JSON.stringify(search)).toContain("Public fact");
      expect(vi.mocked(searchExcerpts).mock.calls.at(-1)?.[1].audience).toBe("public");
      const read = await client.callTool({
        name: "read_excerpt",
        arguments: {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        },
      });
      expect(read.isError).not.toBe(true);
    } finally {
      await client.close();
    }
  });

  it("requires bearer identity before discovery and rejects foreign origins", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    expect((await POST(new Request(ENDPOINT, { method: "POST", body }))).status).toBe(401);
    expect(
      (
        await POST(
          new Request(ENDPOINT, {
            method: "POST",
            body,
            headers: { authorization: "Bearer test", origin: "https://elsewhere.example" },
          }),
        )
      ).status,
    ).toBe(403);
  });

  it("serves the legacy initialization family without bypassing authentication", async () => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "legacy-test", version: "1" },
      },
    });
    const response = await POST(
      new Request(ENDPOINT, {
        method: "POST",
        body,
        headers: {
          authorization: "Bearer test",
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("interlock");
  });

  it("lets the SDK reject malformed and oversized protocol messages", async () => {
    const headers = {
      authorization: "Bearer test",
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    };
    const malformed = await POST(new Request(ENDPOINT, { method: "POST", headers, body: "{" }));
    expect(malformed.status).toBeGreaterThanOrEqual(400);
    const large = await POST(
      new Request(ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", padding: "x".repeat(9000) }),
      }),
    );
    expect(large.status).toBe(413);
  });

  it("never emits a public excerpt when its output assessment refuses it", async () => {
    vi.mocked(assessStandalone).mockImplementationOnce(async () => ({
      status: 200,
      body: envelope({ trace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", decision: "ALLOW" }),
    }));
    vi.mocked(assessStandalone).mockImplementationOnce(async () => ({
      status: 403,
      body: envelope({ trace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", decision: "BLOCK" }),
    }));
    const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
      fetch: fetchRoute,
      requestInit: { headers: { authorization: "Bearer test" } },
    });
    const client = new Client({ name: "integration-test", version: "1.0.0" });
    try {
      await client.connect(transport);
      const result = await client.callTool({ name: "search_excerpts", arguments: { query: "revenue" } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain("Public fact");
    } finally {
      await client.close();
    }
  });
});
