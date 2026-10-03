import { handle } from "@/shared/gateway/http";
import { listSources } from "@/shared/gateway/sources";
import { unavailableResponse } from "@/shared/gateway/unavailable";
import { gatewayDeps } from "../composition";

export async function GET(request: Request) {
  return handle(request, {}, async ({ actor }) => listSources(gatewayDeps(), actor));
}

// A path with its own route no longer reaches the [...path] seam, so every method the contract does
// not implement here is re-exported as that same 503 envelope. Without this Next answers 405 with no
// envelope — source_create (POST) is simply unbuilt, which is not a method error.
const unavailable = () => unavailableResponse();
export { unavailable as POST, unavailable as PUT, unavailable as DELETE };
