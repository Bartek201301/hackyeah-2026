# 06 — One request to the integrator (Bartosz)

Send as a single message, not a drip. Each item states the question, why it blocks, **the default I will
assume if there is no answer**, and what changing it later costs. Ordered: blocking first.

Context line to include: _Owner Nikodem, Builder C, scope `src/features/audit/**`, task T08. Waiting on
G1. Also reviewing your audit/budget interfaces as asked in `docs/team/developer-handoffs.md`._

## Answered by the G1 merge (`f04054b`, PR #7) — kept for the record

- **Item 1, route shape.** Settled as assumed: one route, `src/app/audit/page.tsx` re-exporting
  `@/features/audit`. A `[traceId]` segment still does not exist, so item 1 now asks only whether I may
  have one.
- **Item 2, exported symbols.** Answered, with one difference that matters: the envelope type is
  **`ApiResponse`**, not `Response`, because the DOM global holds that name. Also exported:
  `AuditProjection`, `Metrics`, `Usage`, `Decision`, `Finding`, `Assessment`, `ErrorCode`, `ActorContext`.
- **Item 8, `0` versus `null`.** Confirmed in code at `src/shared/gateway/unavailable.ts:30` — "Nothing
  was executed, so these zeros are true values, not unknowns." The `Not measured` rule stands.
- **Item 10, test runner.** Partly answered: `npm run test` (vitest) exists. See new item 16.
- **Item 6, role discovery.** Answered by T02 phase 3 and by Bartosz directly: features add no Supabase
  auth, cookie handling or role checks, and a screen that needs the role for display asks him to pass it
  as a prop from the app page. This feature needs no such prop — no screen branches on a role. Verified:
  `src/features/audit/**` imports only `@/shared/contracts`, `@/shared/contracts/client`, `@/shared/ui`,
  `@/shared/cn`, `lucide-react`, `next/link` and `react`, and contains no reference to Supabase,
  cookies, `getActor` or a role comparison. The refusal half of the item is shipped: the scope control is
  offered to everyone and the gateway's 403 is a rendered state.

## Blocking

**1. Route shape for multiple views.** `npm run new-feature audit` creates one page
(`scripts/new-feature.mjs`), but T08 needs a personal dashboard, an organisation view and a trace detail.
Do you add `src/app/audit/[traceId]/page.tsx` (and an organisation route), or do I switch views inside one
page using search parameters?
Blocks: the component tree and the trace link that chat must point at (`docs/demo/runbook.md:19`).
Default: one route, `?scope=` and `?trace=` search parameters, everything exposed through
`src/features/audit/index.ts`.
Cost of changing later: moving components between route segments, plus rework of the chat trace link.

**2. Exported symbols — mostly answered, one question left.** Does the typed client get per-operation
wrappers, or do I call `client.GET("/audit", …)` from `createGatewayClient()` directly in the feature?
Original question, kept for context: exact names for the schema-derived types (`ApiResponse`, `AuditProjection`,
`Metrics`, `Usage`, `Decision`, `Finding`, `Assessment`) and for the typed client functions covering
`audit_list`, `audit_read`, `metrics_read`, `audit_export`. Does the client return the whole envelope, or
does it throw on a non-2xx? I need the envelope in both cases, because `decision` and `error` must be
rendered.
Blocks: every import in the feature.
Default: types exported from `@/shared/contracts`, client returns the full envelope and never throws for
a governed refusal.

**3. Gateway overhead per trace.** `AuditProjection` has no `timings` object, so
`deterministic_ms`, `provider_ms` and `persistence_ms` are unreachable from `/audit`. AT15 asks for
"provider versus overhead timings" (`docs/testing/acceptance.md:23`) and `DESIGN.md` asks the trace screen
for measured timings. Will you add a safe timings projection to `AuditProjection` or to a stage event, or
should the trace screen state that the breakdown is not exposed?
Blocks: AT15 completeness, not the screen itself.
Default: show `generation_ms` and `semantic_ms` only, plus the sentence
`Gateway overhead breakdown is not exposed by this endpoint.` I will not estimate it.

**4. Pagination signal on `/audit`.** `after` is a request parameter and the response carries no
`has_more` or next cursor. Do I infer "more exist" from `items.length === 100`?
Blocks: the paging control and the AT10-8 cap assertion.
Default: infer from `items.length === 100`, label the footer
`Showing the 100 most recent records.`

**5. CSV delivery.** Is `/audit/export` fetched as a direct authenticated link, or through a server
action returning bytes? Is `X-Trace-ID` exposed to the browser (it must be, since the export trace is
displayed)? What is the filename and `Content-Disposition`, and what is returned above the 1000-row cap?
Please also confirm in writing that leading `=`, `+`, `-`, `@`, tab and CR neutralisation is server-side
(`docs/demo/scenarios.md`, Dashboard proof).
Blocks: the export interaction and AT10-6.
Default: direct authenticated link, `X-Trace-ID` readable, over-cap returns a JSON envelope with a
narrowing instruction.

**6. Scope refusal and role discovery.** For a non-admin requesting `scope=organisation`: 403 with
`ACCESS_DENIED` that I render, or a redirect? And how does the feature learn the actor's role so it can
render the scope control at all, given that the client must not treat a role as authorisation?
Blocks: View D and AT10-2.
Default: 403 envelope rendered as `Organisation reporting is not available to your account.`, and the
scope control is shown to everyone but its refusal is handled.

## Non-blocking, needed before the demo

**7. `Metrics.usage.reserved_generation_tokens` semantics.** All reservations made in the window, or only
unresolved ones? ([05 §5.2](05-test-plan.md) assumes unresolved-only.)
Cost if wrong: one fixture row and one caption.

**8. `0` versus `null` in usage.** Confirm that `0` means the provider call provably never happened and
`null` means the outcome is unknown. `docs/contracts/examples/blocked.response.json` uses zeros for a
refusal, which matches that reading.
Cost if wrong: the `Not measured` rule would be applied to the wrong fields — a correctness issue, not a
layout one.

**9. Event cap behaviour.** Is `events[]` returned only by `audit_read`? When a trace exceeds 200 events,
does the response carry `INCOMPLETE` plus a message, and may I show that message verbatim?
Default: `INCOMPLETE` with a narrowing instruction shown verbatim; a partial stage list is never rendered
as complete.

**10. Test runner.** `npm run test:unit` and `npm run test:e2e`, their dependencies, and the agreed
location and naming convention for tests inside `src/features/audit/**`. Until these exist I report those
gates as not run.

**11. Example responses.** Two real `/audit` and `/metrics` envelopes (one allowed, one blocked) under
`docs/contracts/examples/`. Only `blocked.response.json` exists today, so my fixtures are derived from
schemas rather than from your serialiser.

**12. Shared UI.** Two requests, both with working fallbacks:
(a) `BarChart` hardcodes `toLocaleString("pl-PL")` at `src/shared/ui/BarChart.tsx:28` with no formatting
prop, which conflicts with the English number formatting required by `DESIGN.md`. A locale or formatter
prop would fix it; otherwise I avoid the chart for judge-visible numbers.
(b) A table or definition-list primitive and a disclosure primitive would suit the trace list and stage
detail. No such block exists in `src/shared/ui`. Fallback: the list-row and divider-list patterns.
Also: `LoadingState` and `ErrorState` still default to Polish copy
(`src/shared/ui/LoadingState.tsx:5`, `src/shared/ui/ErrorState.tsx:14-15`); I pass English explicitly, but
T01's translation should remove the defaults.

**13. Actor identity in organisation scope.** `AuditProjection` exposes `actor_id` only, so organisation
rows show UUIDs. Is a safe display label available, or do UUIDs stand?

**14. Confirmation of the read path.** Confirming for the record: the audit feature reads only
`/api/v1/audit`, `/audit/{id}`, `/metrics`, `/audit/export` through your typed client — never
`actor_activity` or any other table directly, and never your gateway composition module.

**15. Navigation.** One nav entry (`Activity and usage`) or two (adding `Organisation reporting`)? You own
`src/app/nav.ts`.

## Raised after reading the G1 code

**16. A runner for component assertions.** `vitest.config.mts` sets `include: ["src/**/*.test.ts"]` and
`environment: "node"`, and neither jsdom nor `@testing-library/react` is a dependency. `.test.tsx` files
are therefore not collected at all, so AT10-4 (no prompt, excerpt, title or secret in any rendered state)
and AT10-5 (reason codes only) cannot be asserted against a render. I can cover formulas and `null`
handling in pure `.ts` modules, and [05 §1](05-test-plan.md) is now restructured to do exactly that, but
those two DOM-level security assertions need either jsdom plus a testing library, or the Playwright suite
of `docs/testing/acceptance.md:36`. Please also reconcile `:33`/`:34`, which still name `npm run test:unit`
and `npm run test:e2e`; neither script exists.
Default until then: pure-function tests only, with both DOM assertions reported as **not run**.

**17. Reading a refusal through `openapi-fetch`.** The client returns `{ data, error, response }` and does
not throw, so on a 403 or 503 our envelope arrives in `result.error`, not `result.data`. Please confirm
that reading, because rendering `decision`, `reasons` and `error` on exactly those responses is the point
of T08 — a feature that only read `result.data` would silently drop them. If you intend a helper that
normalises both branches into one envelope, I would rather consume it than duplicate the logic.
Default: read both branches and treat them as one envelope.

**18. How a tool subcall is marked in `events[]`.** `docs/contracts/data-model.md:58` requires root
traces to be counted separately from subcall decisions, and `:33` says a suboperation carries its parent
trace and operation in the audit payload. But an element of `AuditProjection.events[]` has only
`stage`, `event_type`, `created_at`, `policy_version`, `feed_version`, `findings`, `semantic` and
`usage` — no parent reference and no subcall flag. Is a subcall a separate trace with a parent pointer
(so it never appears in `events[]` at all), or an event whose `stage` names the tool?
Blocks: nothing; the labelling is already shipped on a heuristic.
Default: a stage whose name contains `search_excerpts` or `read_excerpt` — the two names in
`RegisteredTool` — is labelled a tool subcall and folded into a disclosure. The header count stays
`root request` and stages are never summed into a request count, so a wrong heuristic mislabels a group
but cannot corrupt a figure. A one-field answer would replace the guess with a fact.

## What I do not need

Raw document access, excerpt text, review candidate contents, policy write access, budget RPCs, or any
model credentials. If a field would require any of those, I would rather not display it.
