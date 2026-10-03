import { readAudit } from "@/shared/gateway/audit";
import { errorOutcome } from "@/shared/gateway/envelope";
import { handle, isUuid } from "@/shared/gateway/http";
import { gatewayDeps } from "../../composition";

export async function GET(request: Request, ctx: RouteContext<"/api/v1/audit/[id]">) {
  const { id } = await ctx.params;
  return handle(request, {}, async ({ actor }) =>
    isUuid(id) ? readAudit(gatewayDeps(), actor, id) : errorOutcome("INVALID_INPUT"),
  );
}
