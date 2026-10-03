type ThinkingIndicatorProps = {
  /** The real current stage, supplied by the caller, e.g. "Checking your request". */
  label: string;
  /** Optional grey second line, e.g. "3 permitted sources". */
  detail?: string;
};

/**
 * "Working on it" line for a running request: a softly pulsing dot and the stage label with a
 * shimmer sweep. Shows only what the caller passes — never invented thoughts or answer text.
 * Reduced motion: static dot and plain text.
 */
export function ThinkingIndicator({ label, detail }: ThinkingIndicatorProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-5 w-3 shrink-0 items-center justify-center" aria-hidden>
        <span className="size-2.5 animate-think-pulse rounded-full bg-fg motion-reduce:animate-none" />
      </span>
      <div role="status" aria-live="polite" className="flex min-w-0 flex-col gap-0.5">
        {/* Band sits off-screen at both ends of the sweep, so any frozen frame is plain text. */}
        <span className="animate-think-shimmer bg-[linear-gradient(90deg,var(--color-fg)_40%,var(--color-muted)_50%,var(--color-fg)_60%)] bg-[length:250%_100%] bg-clip-text text-sm font-medium text-transparent motion-reduce:animate-none motion-reduce:bg-none motion-reduce:text-fg">
          {label}
        </span>
        {detail && <span className="text-xs text-muted">{detail}</span>}
      </div>
    </div>
  );
}
