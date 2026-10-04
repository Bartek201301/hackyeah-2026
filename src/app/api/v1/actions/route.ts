import type { ActionRequest } from "@/shared/contracts";
import { startAct } from "@/shared/gateway/client-act";
import { handle } from "@/shared/gateway/http";
import { gatewayDeps } from "../composition";

export const maxDuration = 30;

export const POST = (request: Request) =>
  handle(request, { body: "ActionRequest", idempotent: true }, ({ actor, body, key }) =>
    startAct(gatewayDeps(), actor, body as ActionRequest, key!),
  );
