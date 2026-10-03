import "server-only";
import type { GatewayDeps } from "@/shared/gateway/ports";
import { createSupabaseRepository } from "@/shared/gateway/repository";

// ponytail: detection/generation stay null (→ 503, never ALLOW) until phase 6 composes Julian's factories.
export const gatewayDeps = (): GatewayDeps => ({
  repository: createSupabaseRepository(),
  detection: null,
  generation: null,
});
