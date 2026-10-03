// Browser-safe typed gateway client. Must not import ./validate (server-only).
import createClient from "openapi-fetch";
import type { paths } from "./openapi.gen";

export const createGatewayClient = (baseUrl = "/api/v1") =>
  createClient<paths>({ baseUrl, credentials: "same-origin" });
export type GatewayClient = ReturnType<typeof createGatewayClient>;
/** One key per user action; reuse it when retrying that action. */
export const newIdempotencyKey = () => crypto.randomUUID();
