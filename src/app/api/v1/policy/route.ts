import { readPolicy } from "@/shared/gateway/controls";
import { updatePolicy } from "@/shared/gateway/policy-update";
import { handle } from "@/shared/gateway/http";
import { unavailableResponse } from "@/shared/gateway/unavailable";
import { gatewayDeps } from "../composition";

export async function GET(request: Request) {
  return handle(request, {}, async ({ actor }) => readPolicy(gatewayDeps(), actor));
}

export const PUT = (request: Request) =>
  handle(request, { body: "PolicyUpdate", idempotent: true }, ({ actor, body, key }) =>
    updatePolicy(gatewayDeps(), actor, body, key!),
  );

// Other mutations remain unavailable with the standard envelope.
const unavailable = () => unavailableResponse();
export { unavailable as POST, unavailable as DELETE };
