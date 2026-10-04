import { downloadExport } from "@/shared/gateway/exports";
import { handle } from "@/shared/gateway/http";
import { gatewayDeps } from "../../../composition";

// A malformed id is the same audited 404 as a guessed one.
export async function GET(request: Request, ctx: RouteContext<"/api/v1/exports/[id]/download">) {
  const { id } = await ctx.params;
  return handle(request, {}, async ({ actor }) => downloadExport(gatewayDeps(), actor, id));
}
