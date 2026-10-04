import type { ClientUpdate } from "@/shared/contracts";
import { updateClient } from "@/shared/gateway/clients";
import { handle } from "@/shared/gateway/http";
import { gatewayDeps } from "../../../composition";

// A malformed id is the same audited 404 as a guessed one.
export async function POST(request: Request, ctx: RouteContext<"/api/v1/clients/[id]/update">) {
  const { id } = await ctx.params;
  return handle(request, { body: "ClientUpdate", idempotent: true }, ({ actor, body, key }) =>
    updateClient(gatewayDeps(), actor, id, body as ClientUpdate, key!),
  );
}
