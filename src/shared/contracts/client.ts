// Browser-safe typed gateway client: openapi-fetch plus type-only imports, never server modules.
import createClient from "openapi-fetch";
import type { ApiResponse } from "./index";
import type { paths } from "./openapi.gen";

export const createGatewayClient = (baseUrl = "/api/v1") =>
  createClient<paths>({ baseUrl, credentials: "same-origin" });
export type GatewayClient = ReturnType<typeof createGatewayClient>;
/** One key per user action; reuse it when retrying that action. */
export const newIdempotencyKey = () => crypto.randomUUID();

/** openapi-fetch returns 2xx bodies on `data` and non-2xx bodies on `error`; both carry the same
 *  gateway envelope. Returns null (never throws) when neither looks like one. */
export function readEnvelope(result: { data?: unknown; error?: unknown; response: Response }): {
  status: number;
  body: ApiResponse | null;
} {
  const value = result.data ?? result.error;
  const body =
    typeof value === "object" &&
    value !== null &&
    typeof (value as { trace_id?: unknown }).trace_id === "string"
      ? (value as ApiResponse)
      : null;
  return { status: result.response.status, body };
}
