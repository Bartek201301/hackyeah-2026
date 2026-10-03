import type { SearchRequest } from "@/shared/contracts";
import { searchExcerpts } from "@/shared/gateway/excerpts";
import { handle } from "@/shared/gateway/http";
import { gatewayDeps } from "../composition";

export const POST = (request: Request) =>
  handle(request, { body: "SearchRequest", idempotent: true }, ({ actor, body, key }) =>
    searchExcerpts(gatewayDeps(), actor, body as SearchRequest, key!),
  );
