import type { ConnectorImport } from "@/shared/contracts";
import { handle } from "@/shared/gateway/http";
import { startConnectorImport } from "@/shared/gateway/imports";
import { gatewayDeps } from "../../composition";

export const maxDuration = 30;

export const POST = (request: Request) =>
  handle(request, { body: "ConnectorImport", idempotent: true }, ({ actor, body, key }) =>
    startConnectorImport(gatewayDeps(), actor, body as ConnectorImport, key!),
  );
