import type { ClientCreate } from "@/shared/contracts";
import { createClient, listClients } from "@/shared/gateway/clients";
import { handle } from "@/shared/gateway/http";
import { unavailableResponse } from "@/shared/gateway/unavailable";
import { gatewayDeps } from "../composition";

export const GET = (request: Request) =>
  handle(request, {}, ({ actor }) => listClients(gatewayDeps(), actor));

export const POST = (request: Request) =>
  handle(request, { body: "ClientCreate", idempotent: true }, ({ actor, body, key }) =>
    createClient(gatewayDeps(), actor, body as ClientCreate, key!),
  );

// Methods the contract does not place here stay the 503 envelope rather than Next's envelope-less 405.
const unavailable = () => unavailableResponse();
export { unavailable as PUT, unavailable as DELETE };
