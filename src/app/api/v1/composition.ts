import "server-only";
import { createDetectionPort, createGenerationPort } from "@/features/detection";
import type { GatewayDeps } from "@/shared/gateway/ports";
import { createSupabaseRepository } from "@/shared/gateway/repository";

// Factories return null without server model env; the engine then answers 503 before any reservation.
export const gatewayDeps = (): GatewayDeps => ({
  repository: createSupabaseRepository(),
  detection: createDetectionPort(),
  generation: createGenerationPort(),
});
