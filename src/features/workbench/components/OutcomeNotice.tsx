import Link from "next/link";
import { Badge, Notice } from "@/shared/ui";
import type { GatewayOutcome } from "../lib/envelope";
import { traceHref } from "../lib/trace";

/* Presentational only: renders a classified outcome. All decisions live in lib/envelope.ts. */

/** Danger states get role="alert" via Notice; everything else is a polite status. */
const noticeTone = (tone: GatewayOutcome["tone"]): "info" | "success" | "danger" =>
  tone === "success" ? "success" : tone === "danger" ? "danger" : "info";

export function OutcomeNotice({ outcome }: { outcome: GatewayOutcome }) {
  const href = traceHref(outcome.traceId);

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
        {outcome.kind === "unauthenticated" && (
          <p>
            <Link
              href="/login"
              className="font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Go to sign in
            </Link>
          </p>
        )}
        {href ? (
          <p>
            <Link
              href={href}
              className="font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              View the audited trace
            </Link>
          </p>
        ) : (
          /* technical-spec §9: the trace id can be ephemeral when the audit write itself failed. */
          <p className="text-muted">No audit record is available for this attempt.</p>
        )}
      </div>
    </Notice>
  );
}
