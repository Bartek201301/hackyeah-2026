import "server-only";
import type { ErrorCode } from "@/shared/contracts";
import { errorOutcome, toResponse } from "./envelope";

// 503 seam: required state is unavailable, so no decision and no protected result.
// trace_id is not persisted (no audit write on this path).
export function unavailableResponse(
  code: ErrorCode = "STATE_UNAVAILABLE",
  message = "This gateway operation is not available yet.",
): Response {
  return toResponse(errorOutcome(code, { message, status: 503 }));
}
