import type { ChatRequest } from "@/shared/contracts";
import { startChat } from "@/shared/gateway/chat";
import { handle } from "@/shared/gateway/http";
import { gatewayDeps } from "../composition";

export const maxDuration = 30;

export const POST = (request: Request) =>
  handle(request, { body: "ChatRequest", idempotent: true }, ({ actor, body, key }) =>
    startChat(gatewayDeps(), actor, body as ChatRequest, key!),
  );
