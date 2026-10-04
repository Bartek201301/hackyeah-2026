import { randomUUID } from "node:crypto";
import { createMcpHandler, fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { resolveIntegrationToken } from "@/shared/auth/integration-token";
import { searchExcerpts, readExcerpt } from "@/shared/gateway/excerpts";
import { loadControls } from "@/shared/gateway/calls";
import { assessStandalone } from "@/shared/gateway/standalone-check";
import { gatewayDeps } from "@/app/api/v1/composition";

export const runtime = "nodejs";
export const maxDuration = 60;

const SEARCH_SCHEMA = fromJsonSchema<{ query: string }>({
  type: "object",
  additionalProperties: false,
  properties: { query: { type: "string", minLength: 1, maxLength: 400 } },
  required: ["query"],
});
const READ_SCHEMA = fromJsonSchema<{ id: string }>({
  type: "object",
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
    },
  },
  required: ["id"],
});

const refusal = (code: string, trace: string | null = null) => ({
  isError: true,
  content: [
    {
      type: "text" as const,
      text: `InterLock blocked this action (${code}).${trace ? ` Trace: ${trace}.` : ""}`,
    },
  ],
});

async function callTool(
  request: Request,
  scope: "excerpt:search" | "excerpt:read",
  argument: string,
  operation: "search" | "read",
) {
  try {
    const identity = await resolveIntegrationToken(request.headers.get("authorization"), scope);
    if (!identity) return refusal("ACCESS_DENIED");
    const deps = gatewayDeps();
    if (operation === "search") {
      const input = await assessStandalone(deps, {
        ...identity,
        scope,
        stage: "mcp_input",
        text: argument,
        idempotencyKey: randomUUID(),
      });
      if (input.body.decision !== "ALLOW")
        return refusal(input.body.error?.code ?? "POLICY_BLOCK", input.body.trace_id);
    }
    const result =
      operation === "search"
        ? await searchExcerpts(deps, identity.actor, { query: argument }, randomUUID())
        : await readExcerpt(deps, identity.actor, argument);
    if (result.body.decision !== "ALLOW" || !result.body.data)
      return refusal(result.body.error?.code ?? "NOT_FOUND", result.body.trace_id);
    const payload = JSON.stringify(result.body.data);
    const output = await assessStandalone(deps, {
      ...identity,
      scope,
      stage: "mcp_output",
      text: payload,
      idempotencyKey: randomUUID(),
    });
    if (output.body.decision !== "ALLOW")
      return refusal(output.body.error?.code ?? "POLICY_BLOCK", output.body.trace_id);
    const current = await resolveIntegrationToken(request.headers.get("authorization"), scope);
    const controls = current ? await loadControls(deps, current.actor) : null;
    if (
      !current ||
      !controls ||
      controls.versions.policy_version !== output.body.policy_version ||
      controls.versions.feed_version !== output.body.feed_version
    )
      return refusal("STATE_CHANGED");
    const structured = {
      data: result.body.data,
      trace_id: output.body.trace_id,
      retrieval_trace_id: result.body.trace_id,
      policy_version: output.body.policy_version,
      feed_version: output.body.feed_version,
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(structured) }],
      structuredContent: structured,
    };
  } catch {
    return refusal("STATE_UNAVAILABLE");
  }
}

async function serve(request: Request): Promise<Response> {
  const expected = process.env.INTERLOCK_PUBLIC_ORIGIN;
  let origin: URL;
  try {
    origin = new URL(expected ?? "");
  } catch {
    return new Response("Unavailable", { status: 503 });
  }
  const requestUrl = new URL(request.url);
  if (
    requestUrl.origin !== origin.origin ||
    (request.headers.get("origin") && request.headers.get("origin") !== origin.origin)
  )
    return new Response("Forbidden", { status: 403 });
  let identity;
  try {
    identity = await resolveIntegrationToken(request.headers.get("authorization"), null);
  } catch {
    return new Response("Unavailable", { status: 503 });
  }
  if (
    !identity ||
    !identity.actor.scopes.some((scope) => scope === "excerpt:search" || scope === "excerpt:read")
  )
    return new Response("Unauthorized", { status: 401 });
  const handler = createMcpHandler(
    () => {
      const server = new McpServer({ name: "interlock", version: "1.0.0" });
      server.registerTool(
        "search_excerpts",
        {
          title: "Search public company excerpts",
          description:
            "Search public-approved company excerpts through InterLock. Returns citations and audit traces.",
          inputSchema: SEARCH_SCHEMA,
        },
        async ({ query }) => callTool(request, "excerpt:search", query, "search"),
      );
      server.registerTool(
        "read_excerpt",
        {
          title: "Read a public company excerpt",
          description: "Read one public-approved excerpt by ID through InterLock.",
          inputSchema: READ_SCHEMA,
        },
        async ({ id }) => callTool(request, "excerpt:read", id, "read"),
      );
      return server;
    },
    { legacy: "stateless", maxRequestBodySize: 8192 },
  );
  try {
    const response = await handler.fetch(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export const POST = serve;
export const GET = serve;
export const DELETE = serve;
