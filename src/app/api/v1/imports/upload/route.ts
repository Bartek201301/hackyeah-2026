import { handle } from "@/shared/gateway/http";
import { startUpload, UPLOAD_FIELDS } from "@/shared/gateway/imports";
import { gatewayDeps } from "../../composition";

export const maxDuration = 30;

// Creates the source, quarantines the file and answers 202 with the Run; POST /runs/{id}/execute imports it.
export const POST = (request: Request) =>
  handle(request, { multipart: UPLOAD_FIELDS, idempotent: true }, ({ actor, form, key }) =>
    startUpload(gatewayDeps(), actor, form!, key!),
  );
