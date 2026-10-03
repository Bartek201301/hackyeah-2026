import { listAudit } from "@/shared/gateway/auditList";
import { handle } from "@/shared/gateway/http";
import { unavailableResponse } from "@/shared/gateway/unavailable";
import { gatewayDeps } from "../composition";

export async function GET(request: Request) {
  const after = new URL(request.url).searchParams.get("after");
  return handle(request, {}, async ({ actor }) => listAudit(gatewayDeps(), actor, after));
}

// audit_list is the only operation on this path. Other methods keep the 503 seam rather than a 405,
// so an unbuilt operation answers like every other unbuilt one.
const unavailable = () => unavailableResponse();
export { unavailable as POST, unavailable as PUT, unavailable as DELETE };
