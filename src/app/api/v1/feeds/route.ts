import { readFeed } from "@/shared/gateway/controls";
import { handle } from "@/shared/gateway/http";
import { unavailableResponse } from "@/shared/gateway/unavailable";
import { gatewayDeps } from "../composition";

export async function GET(request: Request) {
  return handle(request, {}, async ({ actor }) => readFeed(gatewayDeps(), actor));
}

// feed_import is not built; same seam rule as /policy.
const unavailable = () => unavailableResponse();
export { unavailable as POST, unavailable as PUT, unavailable as DELETE };
