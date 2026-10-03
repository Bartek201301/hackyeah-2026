import { Button, ErrorState, Notice } from "@/shared/ui";
import type { ReadFailure } from "../envelope";
import { copy } from "../copy";

/**
 * The same refusal states as the trace screen, in the words the dashboard needs. A denied read
 * here means the organisation scope was requested without the role for it, and an invalid range
 * means the window crossed a UTC day; on the trace screen both would be the wrong sentence.
 */
export function DashboardStateBlock({ state, onRetry }: { state: ReadFailure; onRetry: () => void }) {
  const retry = (
    <Button variant="secondary" onClick={onRetry}>
      {copy.action.retry}
    </Button>
  );

  switch (state.kind) {
    case "unauthenticated":
      return (
        <ErrorState title={copy.state.unauthenticatedTitle} description={copy.state.unauthenticatedBody} />
      );
    case "denied":
      return <Notice tone="danger">{copy.state.deniedBody}</Notice>;
    case "invalidInput":
      return <Notice tone="danger">{copy.state.invalidInputBody}</Notice>;
    case "rateLimited":
      // No retry control: a reporting screen that offers one builds a loop against the gateway.
      return <Notice tone="danger">{copy.state.rateLimitedBody}</Notice>;
    case "auditUnavailable":
      return (
        <ErrorState
          title={copy.state.auditUnavailableTitle}
          description={copy.state.auditUnavailableBody}
          action={retry}
        />
      );
    case "stateUnavailable":
      return (
        <ErrorState
          title={copy.state.stateUnavailableTitle}
          description={copy.state.stateUnavailableBody}
          action={retry}
        />
      );
    default:
      return (
        <ErrorState
          title={copy.state.clientErrorTitle}
          description={copy.state.clientErrorBody}
          action={retry}
        />
      );
  }
}
