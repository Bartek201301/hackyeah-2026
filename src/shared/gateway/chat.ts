import "server-only";
import type { ActorContext, ChatRequest } from "@/shared/contracts";
import { GatewayError } from "./envelope";
import type { GatewayDeps, Outcome } from "./ports";

// Seam: phase 3 replaces these bodies; phase 4 wires routes to them meanwhile.

export async function startChat(
  _deps: GatewayDeps,
  _actor: ActorContext,
  _body: ChatRequest,
  _idempotencyKey: string,
): Promise<Outcome> {
  throw new GatewayError("STATE_UNAVAILABLE");
}

export async function executeChat(
  _deps: GatewayDeps,
  _actor: ActorContext,
  _runId: string,
  _idempotencyKey: string,
  _signal: AbortSignal,
): Promise<Outcome> {
  throw new GatewayError("STATE_UNAVAILABLE");
}

export async function readChat(_deps: GatewayDeps, _actor: ActorContext, _runId: string): Promise<Outcome> {
  throw new GatewayError("STATE_UNAVAILABLE");
}
