import { readPolicy } from "@/shared/gateway/controls";
import { handle } from "@/shared/gateway/http";
import { unavailableResponse } from "@/shared/gateway/unavailable";
import { gatewayDeps } from "../composition";

export async function GET(request: Request) {
  return handle(request, {}, async ({ actor }) => readPolicy(gatewayDeps(), actor));
}

// policy_update is not built. This path no longer reaches the [...path] seam, so every other method
// re-exports the same 503 envelope rather than letting Next answer 405 with no envelope.
const unavailable = () => unavailableResponse();
export { unavailable as PUT, unavailable as POST, unavailable as DELETE };
