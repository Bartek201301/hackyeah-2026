import { Badge, Notice } from "@/shared/ui";
import type { GatewayOutcome } from "../lib/envelope";

/* Presentational only: renders a classified outcome. All decisions live in lib/envelope.ts. */

/** Danger states get role="alert" via Notice; everything else is a polite status. */
const noticeTone = (tone: GatewayOutcome["tone"]): "info" | "success" | "danger" =>
  tone === "success" ? "success" : tone === "danger" ? "danger" : "info";

export function OutcomeNotice({ outcome }: { outcome: GatewayOutcome }) {
  return (
    <Notice tone={noticeTone(outcome.tone)}>
      <div className="flex flex-col gap-1.5">
        {/* Text label, not colour alone — DESIGN forbids colour-only status. */}
        <p className="font-semibold">{outcome.title}</p>
        <p>{outcome.detail}</p>
        {outcome.reasons.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted">Reasons:</span>
            {outcome.reasons.map((reason) => (
              <Badge key={reason} tone="neutral">
                {reason}
              </Badge>
            ))}
          </p>
        )}
        {outcome.traceId && (
          <p className="text-muted">
            Trace <span className="font-mono text-xs">{outcome.traceId}</span>
            {/* Trace detail is Builder C's screen; its route is not agreed yet (see B7/N1). */}
          </p>
        )}
      </div>
    </Notice>
  );
}
