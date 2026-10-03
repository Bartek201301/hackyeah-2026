import { handle } from "@/shared/gateway/http";
import { listReviews } from "@/shared/gateway/reviews";
import { unavailableResponse } from "@/shared/gateway/unavailable";
import { gatewayDeps } from "../composition";

export async function GET(request: Request) {
  return handle(request, {}, async ({ actor }) => listReviews(gatewayDeps(), actor));
}

// A path with its own route no longer reaches the [...path] seam, so the methods the contract does
// not place here stay the 503 envelope rather than Next's envelope-less 405.
const unavailable = () => unavailableResponse();
export { unavailable as POST, unavailable as PUT, unavailable as DELETE };
