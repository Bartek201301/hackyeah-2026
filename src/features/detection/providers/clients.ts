import "server-only";
import type { DetectionPort, GatewayPolicy, GenerationPort } from "@/shared/contracts";
import { LAYA_REVISION, parseLaya, serializeLaya, validateLayaHealth } from "./laya";
import { parseOllama, serializeOllama, validateOllamaTags } from "./ollama";
import { createLoopbackTransport, type LocalTransport } from "./transport";
import { ProviderFailure } from "./validation";

/** Feature-private raw-window client. No parse, findings, tokenizer windows or coverage claims. */
export async function assessLocalWindow(
  input: Parameters<DetectionPort["assess"]>[0],
  limits: GatewayPolicy["semantic"],
  bearer: string,
  signal: AbortSignal,
  transport: LocalTransport = createLoopbackTransport(),
) {
  const body = serializeLaya(input, limits);
  const start = performance.now();
  const deadline = Date.now() + limits.timeout_ms;
  const request = { bearer, signal, deadline };
  validateLayaHealth(await transport("layaHealth", request));
  const raw = await transport("layaAssess", { ...request, body });
  const observation = parseLaya(raw, LAYA_REVISION, performance.now() - start);
  try {
    validateLayaHealth(await transport("layaHealth", request));
  } catch (error) {
    throw new ProviderFailure(
      error instanceof ProviderFailure ? error.code : "invalid_response",
      true,
      observation.usage.input_tokens,
      observation.usage.output_tokens,
    );
  }
  return observation;
}
/** No durable call ledger: deliberately not exported from detection/index.ts. */
export async function generateLocal(
  input: Parameters<GenerationPort["generate"]>[0],
  signal: AbortSignal,
  transport: LocalTransport = createLoopbackTransport(),
) {
  const body = serializeOllama(input);
  const request = { signal, deadline: Date.now() + input.limits.provider_timeout_ms };
  const digest = validateOllamaTags(await transport("ollamaTags", request));
  const raw = await transport("ollamaChat", { ...request, body });
  const result = parseOllama(raw, input, digest);
  try {
    validateOllamaTags(await transport("ollamaTags", request));
  } catch (error) {
    throw new ProviderFailure(
      error instanceof ProviderFailure ? error.code : "invalid_response",
      true,
      result.input_tokens,
      result.output_tokens,
    );
  }
  return result;
}
