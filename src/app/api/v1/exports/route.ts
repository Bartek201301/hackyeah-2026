import type { ExportRequest } from "@/shared/contracts";
import { startExport } from "@/shared/gateway/exports";
import { handle } from "@/shared/gateway/http";
import { gatewayDeps } from "../composition";

export const maxDuration = 30;

export const POST = (request: Request) =>
  handle(request, { body: "ExportRequest", idempotent: true }, ({ actor, body, key }) =>
    startExport(gatewayDeps(), actor, body as ExportRequest, key!),
  );
