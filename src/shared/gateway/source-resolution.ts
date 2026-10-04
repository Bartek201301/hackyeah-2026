import "server-only";
import type { ActorContext } from "@/shared/contracts";
import type { ExcerptAudience, GatewayDeps, PermittedSourceMatch } from "./ports";
import { projectSourceLabel } from "./safe-projection";

/** Only explicit filenames, quoted source names and stable dataset aliases constrain retrieval. */
export function namedSourceIn(message: string): string | null {
  const quoted = message.match(
    /\b(?:file|document|source)\s+(?:named|called)?\s*["'`“]([^"'`”]{1,200})["'`”]/i,
  );
  if (quoted) return quoted[1].trim();
  const filename = message.match(/\b([\p{L}\p{N}][\p{L}\p{N}_.-]{0,160}\.(?:csv|pdf|txt))\b/iu);
  if (filename) return filename[1];
  const alias = message.match(/\b(?:PUB|INT|RES|MIX|REV|OTH)-\d{2}\b/i);
  return alias?.[0] ?? null;
}

export type SourceResolution =
  | { kind: "none" }
  | { kind: "selected"; sourceId: string }
  | { kind: "missing" }
  | { kind: "ambiguous"; sources: PermittedSourceMatch[] };

export async function resolveSource(
  deps: GatewayDeps,
  actor: ActorContext,
  input: { message: string; sourceId: string | null; dealId: string | null; audience: ExcerptAudience },
): Promise<SourceResolution> {
  const name = input.sourceId ? null : namedSourceIn(input.message);
  if (!name && !input.sourceId) return { kind: "none" };
  const matches = await deps.repository.matchPermittedSources(actor, {
    name,
    sourceId: input.sourceId,
    dealId: input.dealId,
    audience: input.audience,
  });
  if (!matches.length) return { kind: "missing" };
  const sources = matches.flatMap((source) => {
    const label = projectSourceLabel(source.label);
    return label ? [{ ...source, label }] : [];
  });
  if (sources.length !== matches.length) return { kind: "missing" };
  if (sources.length > 1) return { kind: "ambiguous", sources };
  return { kind: "selected", sourceId: sources[0].id };
}
