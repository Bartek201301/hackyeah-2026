import { executeChat } from "@/shared/gateway/chat";
import { errorOutcome } from "@/shared/gateway/envelope";
import { handle, isUuid } from "@/shared/gateway/http";
import { gatewayDeps } from "../../../composition";

// Policy max_elapsed_ms is 120 s; headroom for finalize.
export const maxDuration = 150;

export async function POST(request: Request, ctx: RouteContext<"/api/v1/runs/[id]/execute">) {
  const { id } = await ctx.params;
  return handle(request, { idempotent: true }, async ({ actor, key, signal }) =>
    isUuid(id) ? executeChat(gatewayDeps(), actor, id, key!, signal) : errorOutcome("INVALID_INPUT"),
  );
}
