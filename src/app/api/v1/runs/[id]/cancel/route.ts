import { errorOutcome } from "@/shared/gateway/envelope";
import { handle, isUuid } from "@/shared/gateway/http";
import { cancelRun } from "@/shared/gateway/runs";
import { gatewayDeps } from "../../../composition";

export async function POST(request: Request, ctx: RouteContext<"/api/v1/runs/[id]/cancel">) {
  const { id } = await ctx.params;
  return handle(request, { idempotent: true }, async ({ actor, key }) =>
    isUuid(id) ? cancelRun(gatewayDeps(), actor, id, key!) : errorOutcome("INVALID_INPUT"),
  );
}
