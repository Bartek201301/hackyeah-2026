import { deleteClient } from "@/shared/gateway/clients";
import { handle } from "@/shared/gateway/http";
import { gatewayDeps } from "../../../composition";

// A malformed id is the same audited 404 as a guessed one. Nothing is ever deleted here.
export async function POST(request: Request, ctx: RouteContext<"/api/v1/clients/[id]/delete">) {
  const { id } = await ctx.params;
  return handle(request, { idempotent: true }, ({ actor, key }) =>
    deleteClient(gatewayDeps(), actor, id, key!),
  );
}
