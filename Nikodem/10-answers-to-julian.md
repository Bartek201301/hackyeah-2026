# 10 — Answers to Julian's open questions N1 and N2

Raised in `Julian/plans/02-open-questions.md:155-162`, and marked in his code at
`src/features/workbench/components/OutcomeNotice.tsx:30`: _"Trace detail is Builder C's screen; its
route is not agreed yet (see B7/N1)."_ Both answers already exist in merged code, so this is a
notification rather than a decision.

## N1 — Trace detail URL shape

**The route is `/audit?trace=<trace_id>`.** Merged in PR #11 (`2032c93`), live on `main`.

- `trace_id` is the uuid straight from the envelope — no encoding, no prefix.
- The screen validates the identifier itself: a malformed value renders
  `This trace is not available.` without calling the gateway, so a deep link can never crash the page.
- It works today. Until the audit endpoints exist (T03), it shows the gateway's own 503 state,
  `Reporting state is unavailable.` That is the honest answer for a trace that cannot be read yet, and
  it is better than no link during a rehearsal.
- `/audit` without the parameter is the personal dashboard, so the link always lands somewhere real.

No cross-feature import is involved: a URL is not a module, so `next/link` with that href passes
`scripts/check-rules.mjs`. One line in `OutcomeNotice.tsx`:

```tsx
<Link href={`/audit?trace=${outcome.traceId}`}>{outcome.traceId}</Link>
```

This is the `0:00–0:25` beat of `docs/demo/runbook.md:19` — "show trace link".

**If a path segment is wanted instead** (`/audit/<trace_id>`), that is an app route and belongs to
Bartosz; it is item 1 in [06-integrator-requests.md](06-integrator-requests.md), where the recorded
default is the search parameter. I will follow whatever he decides, but nothing is blocked while the
parameter form stands.

## N2 — Shared boundary

**Confirmed, and already true in the merged code.** The workbench shows the decision, the reasons and
the trace identifier; the audit feature owns the trace detail — stages, findings, assessment, usage —
and the dashboards. No stage rendering in the workbench, no chat composition in the audit feature.

Nothing is shared between the two features. Each has its own envelope reader because the screens answer
different questions: the workbench classifies the response of an operation it just ran, and the audit
feature classifies a read of records about operations that already finished. If a genuinely common piece
appears later, it goes through Bartosz into `src/shared/**`, not sideways.

## Message to send

```text
N1: the trace route is /audit?trace=<trace_id>, merged in PR #11 and live on main. trace_id is the raw
uuid from the envelope; the screen validates it and a malformed value renders "This trace is not
available." without calling the gateway. It works now — until T03 lands it shows the gateway's 503 state
instead of a trace, which is the honest result and still good enough to rehearse the link. A URL is not
an import, so `<Link href={`/audit?trace=${traceId}`}>` passes check-rules.

N2: confirmed. You show decision, reasons and the trace id; I own stages, findings, assessment, usage
and the dashboards. Neither feature imports the other, and anything genuinely shared goes through
Bartosz into shared/.

If you would rather have /audit/<trace_id> as a path segment, that is Bartosz's app route (item 1 in my
integrator request list). Nothing blocks you in the meantime.
```
