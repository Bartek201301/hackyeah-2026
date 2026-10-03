import { exportAudit } from "@/shared/gateway/auditExport";
import { handle } from "@/shared/gateway/http";
import { unavailableResponse } from "@/shared/gateway/unavailable";
import { gatewayDeps } from "../../composition";

// Static segment beats audit/[id], so this path is never read as a trace id.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return handle(request, {}, async ({ actor }) =>
    exportAudit(gatewayDeps(), actor, {
      scope: params.get("scope"),
      from: params.get("from"),
      to: params.get("to"),
    }),
  );
}

// audit_export is the only operation on this path. Other methods keep the 503 seam rather than a
// 405, so an unbuilt operation answers like every other unbuilt one.
const unavailable = () => unavailableResponse();
export { unavailable as POST, unavailable as PUT, unavailable as DELETE };
