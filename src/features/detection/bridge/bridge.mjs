import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const routes = Object.freeze({
  "GET /laya/health": { path: "/laya/health", upstream: "http://127.0.0.1:8000/health", laya: true },
  "POST /laya/v1/systemone": {
    path: "/laya/v1/systemone",
    upstream: "http://127.0.0.1:8000/v1/systemone",
    laya: true,
  },
  "GET /ollama/api/tags": {
    path: "/ollama/api/tags",
    upstream: "http://127.0.0.1:11434/api/tags",
    laya: false,
  },
  "POST /ollama/api/chat": {
    path: "/ollama/api/chat",
    upstream: "http://127.0.0.1:11434/api/chat",
    laya: false,
  },
});
const requestCap = 262144;

function bearerMatches(header, expected) {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice(7), "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function empty(res, status) {
  res.writeHead(status, { "cache-control": "no-store", "content-length": "0" });
  res.end();
}

async function readBody(req) {
  if (req.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase() !== "application/json")
    throw new Error("invalid_content_type");
  const declared = req.headers["content-length"];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > requestCap))
    throw new Error("body_limit");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > requestCap) throw new Error("body_limit");
    chunks.push(chunk);
  }
  try {
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return { body, bytes: Buffer.concat(chunks) };
  } catch {
    throw new Error("invalid_json");
  }
}

async function readResponse(response, cap) {
  if (
    response.status !== 200 ||
    response.redirected ||
    response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json"
  )
    throw new Error("invalid_upstream");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > cap))
    throw new Error("response_limit");
  if (!response.body) throw new Error("invalid_upstream");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > cap) throw new Error("response_limit");
      chunks.push(chunk.value);
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  const bytes = Buffer.concat(chunks);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  JSON.parse(text);
  return bytes;
}

/** Test injection is private to this module; production always uses the fixed upstream URLs above. */
export function createBridgeServer({ token, layaKey, fetcher = fetch, logger = console.info }) {
  if (!/^[a-f0-9]{64}$/.test(token) || !/^[\x21-\x7e]{1,4096}$/.test(layaKey))
    throw new Error("invalid_bridge_configuration");
  const expected = Buffer.from(token, "utf8");
  let active = 0;
  return createServer(async (req, res) => {
    const started = performance.now();
    const route = routes[`${req.method} ${req.url}`];
    const safeMethod = req.method === "GET" || req.method === "POST" ? req.method : "OTHER";
    const safeRoute = route?.path ?? "unknown";
    try {
      if (!route) return empty(res, 404);
      if (!bearerMatches(req.headers.authorization, expected)) return empty(res, 401);
      if (active >= 2) return empty(res, 503);
      active += 1;
      try {
        let body;
        if (req.method === "POST") {
          try {
            const parsed = await readBody(req);
            body = parsed.bytes;
            if (
              (route.laya && parsed.body.model !== "typed-decisions") ||
              (!route.laya &&
                (parsed.body.model !== "qwen3:8b" ||
                  parsed.body.stream !== false ||
                  parsed.body.think !== false))
            )
              return empty(res, 400);
          } catch (error) {
            return empty(res, error?.message === "body_limit" ? 413 : 400);
          }
        } else if (req.headers["content-length"] || req.headers["transfer-encoding"]) {
          return empty(res, 400);
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60000);
        const onClose = () => {
          if (!res.writableEnded) controller.abort();
        };
        res.on("close", onClose);
        try {
          const response = await fetcher(route.upstream, {
            method: req.method,
            redirect: "error",
            cache: "no-store",
            signal: controller.signal,
            headers: {
              accept: "application/json",
              ...(body ? { "content-type": "application/json" } : {}),
              ...(route.laya ? { authorization: `Bearer ${layaKey}` } : {}),
            },
            body,
          });
          const bytes = await readResponse(response, req.method === "POST" ? 65536 : 32768);
          res.writeHead(200, {
            "cache-control": "no-store",
            "content-type": "application/json",
            "content-length": String(bytes.length),
          });
          res.end(bytes);
        } catch {
          if (!res.headersSent) empty(res, 502);
        } finally {
          clearTimeout(timer);
          res.off("close", onClose);
          controller.abort();
        }
      } finally {
        active -= 1;
      }
    } finally {
      logger(safeMethod, safeRoute, res.statusCode, Math.round(performance.now() - started));
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createBridgeServer({
    token: process.env.MODEL_BRIDGE_TOKEN,
    layaKey: process.env.LAYA_API_KEY,
  });
  server.listen(8787, "127.0.0.1");
}
