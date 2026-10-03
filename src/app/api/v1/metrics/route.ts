import { unavailableResponse } from "@/shared/gateway/unavailable";
import { handle } from "@/shared/gateway/http";
import { readMetrics } from "@/shared/gateway/metrics";
import { gatewayDeps } from "../composition";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return handle(request, {}, async ({ actor }) =>
    readMetrics(gatewayDeps(), actor, {
      scope: params.get("scope"),
      from: params.get("from"),
      to: params.get("to"),
    }),
  );
}

// metrics_read is the only operation on this path. Other methods keep the 503 seam rather than a
// 405, so an unbuilt operation answers like every other unbuilt one.
const unavailable = () => unavailableResponse();
export { unavailable as POST, unavailable as PUT, unavailable as DELETE };
