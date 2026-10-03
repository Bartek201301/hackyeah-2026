import { errorOutcome } from "@/shared/gateway/envelope";
import { readExcerpt } from "@/shared/gateway/excerpts";
import { handle, isUuid } from "@/shared/gateway/http";
import { gatewayDeps } from "../../composition";

export async function GET(request: Request, ctx: RouteContext<"/api/v1/excerpts/[id]">) {
  const { id } = await ctx.params;
  return handle(request, {}, async ({ actor }) =>
    isUuid(id) ? readExcerpt(gatewayDeps(), actor, id) : errorOutcome("INVALID_INPUT"),
  );
}
