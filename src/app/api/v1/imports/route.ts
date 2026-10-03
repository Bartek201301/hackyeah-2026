import { handle } from "@/shared/gateway/http";
import { listImports } from "@/shared/gateway/sources";
import { unavailableResponse } from "@/shared/gateway/unavailable";
import { gatewayDeps } from "../composition";

export async function GET(request: Request) {
  return handle(request, {}, async ({ actor }) => listImports(gatewayDeps(), actor));
}

// This route takes /imports away from the [...path] seam, so the methods the contract does not place
// here answer with the same 503 envelope rather than Next's bare 405. The two import operations that
// do exist are POST /imports/connector and POST /imports/upload, which are separate paths.
const unavailable = () => unavailableResponse();
export { unavailable as POST, unavailable as PUT, unavailable as DELETE };
