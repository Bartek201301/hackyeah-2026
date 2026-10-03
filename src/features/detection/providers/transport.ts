import "server-only";
import { ProviderFailure, requireValue } from "./validation";

const loopbackEndpoints = {
  layaHealth: "http://127.0.0.1:8000/health",
  layaAssess: "http://127.0.0.1:8000/v1/systemone",
  ollamaTags: "http://127.0.0.1:11434/api/tags",
  ollamaChat: "http://127.0.0.1:11434/api/chat",
} as const;
const bridgePaths = {
  layaHealth: "/laya/health",
  layaAssess: "/laya/v1/systemone",
  ollamaTags: "/ollama/api/tags",
  ollamaChat: "/ollama/api/chat",
} as const;
export type LocalEndpoint = keyof typeof loopbackEndpoints;
export type LocalTransport = ReturnType<typeof createLoopbackTransport>;
/** Injection is private, for fake-provider tests. No caller-selectable URLs or redirects. */
export function createLoopbackTransport(fetcher: typeof fetch = fetch) {
  return createTransport(loopbackEndpoints, undefined, fetcher);
}

/** The server environment selects one fixed HTTPS origin; no request chooses a URL. */
export function createBridgeTransport(
  baseUrl: string,
  token: string,
  fetcher: typeof fetch = fetch,
): LocalTransport | null {
  let origin: string;
  try {
    const url = new URL(baseUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      ![url.origin, `${url.origin}/`].includes(baseUrl) ||
      !/^[a-f0-9]{64}$/.test(token)
    )
      return null;
    origin = url.origin;
  } catch {
    return null;
  }
  return createTransport(
    Object.fromEntries(Object.entries(bridgePaths).map(([key, path]) => [key, `${origin}${path}`])) as Record<
      LocalEndpoint,
      string
    >,
    token,
    fetcher,
  );
}

function createTransport(
  endpoints: Record<LocalEndpoint, string>,
  bridgeToken: string | undefined,
  fetcher: typeof fetch,
) {
  return async (
    endpoint: LocalEndpoint,
    request: { body?: unknown; bearer?: string; deadline: number; signal: AbortSignal },
  ): Promise<unknown> => {
    requireValue(Object.hasOwn(endpoints, endpoint), "invalid_input");
    const isLaya = endpoint === "layaHealth" || endpoint === "layaAssess";
    const effect = endpoint === "layaAssess" || endpoint === "ollamaChat";
    requireValue(
      isLaya
        ? typeof request.bearer === "string" &&
            /^[\x21-\x7e]{1,4096}$/.test(request.bearer) &&
            (bridgeToken === undefined || request.bearer === bridgeToken)
        : request.bearer === undefined,
      "invalid_input",
    );
    requireValue(effect ? request.body !== undefined : request.body === undefined, "invalid_input");
    requireValue(
      Number.isSafeInteger(request.deadline) && request.deadline <= Date.now() + 60000,
      "invalid_input",
    );
    let body: string | undefined;
    try {
      body = request.body === undefined ? undefined : JSON.stringify(request.body);
    } catch {
      throw new ProviderFailure("invalid_input");
    }
    requireValue(body === undefined || Buffer.byteLength(body) <= 262144, "body_limit");
    if (request.signal.aborted) throw new ProviderFailure("cancelled");
    if (request.deadline <= Date.now()) throw new ProviderFailure("timeout");
    const controller = new AbortController();
    let reason: "cancelled" | "timeout" = "timeout";
    const onAbort = () => {
      reason = "cancelled";
      controller.abort();
    };
    request.signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), request.deadline - Date.now());
    let dispatched = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let rejectAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(new ProviderFailure(reason, dispatched));
      controller.signal.addEventListener("abort", rejectAbort, { once: true });
    });
    const bounded = <T>(promise: Promise<T>) => Promise.race([promise, aborted]);
    try {
      if (request.signal.aborted) onAbort();
      if (controller.signal.aborted) throw new ProviderFailure(reason);
      dispatched = effect;
      const response = await bounded(
        fetcher(endpoints[endpoint], {
          method: effect ? "POST" : "GET",
          redirect: "error",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            accept: "application/json",
            ...(effect ? { "content-type": "application/json" } : {}),
            ...(bridgeToken || isLaya ? { authorization: `Bearer ${bridgeToken ?? request.bearer}` } : {}),
          },
          body,
        }),
      );
      // Cancel every unused body, including errors. Never parse or expose provider error text.
      reader = response.body?.getReader();
      requireValue(response.status === 200 && !response.redirected, "http_error");
      requireValue(
        response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() === "application/json",
      );
      requireValue(reader);
      const cap = effect ? 65536 : 32768;
      const declared = response.headers.get("content-length");
      requireValue(declared === null || (/^\d+$/.test(declared) && Number(declared) <= cap), "body_limit");
      let size = 0;
      const chunks: Uint8Array[] = [];
      for (;;) {
        const chunk = await bounded(reader.read());
        if (chunk.done) break;
        size += chunk.value.byteLength;
        requireValue(size <= cap, "body_limit");
        chunks.push(chunk.value);
      }
      requireValue(!controller.signal.aborted);
      const decoder = new TextDecoder("utf-8", { fatal: true });
      try {
        return JSON.parse(decoder.decode(Buffer.concat(chunks))) as unknown;
      } catch {
        throw new ProviderFailure("invalid_response");
      }
    } catch (error) {
      const code = controller.signal.aborted
        ? reason
        : error instanceof ProviderFailure
          ? error.code
          : "unavailable";
      throw new ProviderFailure(code, dispatched);
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", onAbort);
      if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort);
      void reader?.cancel().catch(() => undefined);
      controller.abort();
    }
  };
}
