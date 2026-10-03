import { Button, ErrorState, Notice } from "@/shared/ui";
import type { TraceReadState } from "../envelope";
import { copy } from "../copy";

type Props = {
  state: Exclude<TraceReadState, { kind: "ok" }>;
  onRetry: () => void;
};

/**
 * One block per refused or failed read.
 *
 * `notFound`, `denied` and `invalidInput` deliberately render the same words. A distinct
 * "not yours" message would confirm that the identifier exists, which is a disclosure the
 * trace screen has no reason to make. The states stay separate in the model because the
 * dashboards need to tell them apart.
 *
 * A rate-limited read gets no retry button: inviting a retry there is how a client builds a
 * loop against its own gateway.
 */
export function TraceStateBlock({ state, onRetry }: Props) {
  const retry = (
    <Button variant="secondary" onClick={onRetry}>
      {copy.action.retry}
    </Button>
  );

  switch (state.kind) {
    case "notFound":
    case "denied":
    case "invalidInput":
      return <ErrorState title={copy.state.notFoundTitle} description={copy.state.notFoundBody} />;
    case "unauthenticated":
      // No sign-in route exists yet, so this states the fact instead of linking nowhere.
      return (
        <ErrorState title={copy.state.unauthenticatedTitle} description={copy.state.unauthenticatedBody} />
      );
    case "rateLimited":
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
