import { errorOutcome } from "@/shared/gateway/envelope";
import { handle, isUuid } from "@/shared/gateway/http";
import { readRunResult } from "@/shared/gateway/runs";
import { gatewayDeps } from "../../composition";

export async function GET(request: Request, ctx: RouteContext<"/api/v1/runs/[id]">) {
  const { id } = await ctx.params;
  return handle(request, {}, async ({ actor }) =>
    isUuid(id) ? readRunResult(gatewayDeps(), actor, id) : errorOutcome("INVALID_INPUT"),
  );
}
