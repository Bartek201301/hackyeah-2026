# Open questions, consolidated by owner

Deduplicated from the five per-screen briefs plus findings against merged main `50606ca`. Each entry
names the workflow it blocks. Send section 1 to Bartosz as a single message; do not wait on answers
before starting [W0](01-task-sequence.md).

Nothing here proposes a shared change made unilaterally. Where a question needs a contract decision,
it is Bartosz's to make and version.

## 1. Bartosz — integrator

### Blocking before W1

**B1. Component testing does not exist.** `vitest.config.mts` is `environment: "node"` with
`include: ["src/**/*.test.ts"]`; there is no jsdom, no `@testing-library/react`, no Playwright. Every
brief's "future evidence" section assumes browser and component checks that cannot run today.
Add jsdom plus `@testing-library/react` and include `*.test.tsx`, or should workbench keep all
testable logic in pure `.ts` modules and treat component behaviour as browser-QA only?
_Blocks: test evidence in every workbench PR (W0–W5)._
_Mitigation already taken: W0 puts decision logic in `lib/*.ts` so tests pass under the existing
runner either way._

**B2. Screen routing.** Only `/workbench` exists and `src/app/**` is yours. Chat, sources, review,
policy/feed and export are five screens, and the runbook jumps between them under time pressure. Add
four one-line route files `src/app/workbench/{sources,review,policy,export}/page.tsx` following the
existing `export { default } from "@/features/workbench"` pattern, or should workbench do in-page
view switching? Note there is **no tabs primitive** in `src/shared/ui`.
_Blocks: W2–W5 layout, deep links from audit traces, and browser QA._

**B3. Missing shared primitives.** No primitive exists for tabs, dialog/modal, table, file input,
checkbox/radio/switch, toast, stepper/stage list, accordion or pagination. Feature CSS is rejected by
`scripts/check-rules.mjs`, so these cannot be built privately. Which will you add to `src/shared/ui`,
and which should workbench compose from `Card`, `Field`, `Button` and `Badge`?
_Blocks: W2 file selection, W3 queue table and candidate editor, W4 indicator list._

**B4. Client call style, and multipart.** G1 exports a generic `createGatewayClient` and
`newIdempotencyKey`, but no operation-specific helpers. Should workbench call the typed paths
directly, or will you add helpers? And does `openapi-fetch` 0.17.0 carry a `multipart/form-data` body
for `import_upload`, or does that one call need a plain `fetch` with `FormData`?
_Blocks: W1 chat submission, W2 upload._

**B5. Endpoint landing order.** Which operation becomes the first non-503, and in what order do the
rest arrive? Every `/api/v1/*` path currently returns `STATE_UNAVAILABLE`.
_Blocks: sequencing W1–W5 and knowing when G2 can be attempted._

### Needed before the relevant screen

**B6. Deal choice and safe current-user context.** `deal_id` is optional on chat, search, upload and
export, but a browser-selected deal cannot grant access. T02 now grants `authenticated` SELECT on own
`memberships`, own `deal_memberships` and own `actor_activity`. Is reading `deal_memberships` through
the browser Supabase client the intended source for a deal selector and for presentation-only role
visibility, or will an API projection supply it?
_Blocks: W1 deal scoping, W2 upload deal field, W5 export scoping._

**B7. Trace link target.** The envelope returns `trace_id`, and runs have their own IDs. What is the
stable authorized route for a trace link, and does its URL key on `trace_id` or on run ID? The two
must not be assumed equal. Coordinate with Nikodem, who owns the trace view.
_Blocks: W1 trace link, W2 import outcome link, W4 "did the next request use the new version"._

**B8. Review findings and locator.** DESIGN requires the review screen to show findings, the original
locator and suggested safe text, but public `Review` carries only `id`, `version`, `candidate_text`,
`classification`, `status` and `document_id`. Will an authorized review-read response add a safe
findings projection, or should the design wording be revised? Maciej supplies findings; you own the
projection and authorization.
_Blocks: W3._

**B9. Evidence selection for review.** `review_resolve` requires `evidence_excerpt_ids`, and lowering
classification requires current public-approved provenance. What trusted route supplies selectable
public excerpt evidence with its citation context? Review must not accept arbitrary IDs as proof.
_Blocks: W3 approval with declassification, S06._

**B10. `classification` versus "audience".** The request field is `classification` while DESIGN says
audience. Confirm the UI label, and whether any separate audience field exists. Workbench will not
invent one.
_Blocks: W3 form labelling._

**B11. Admin access to the permitted original locator.** How does an admin receive a permitted
original locator or inspection reference without a raw download URL? `Review` contains neither.
_Blocks: W3 "original locator" requirement in DESIGN._

**B12. Policy and feed form baseline.** Should the forms use the complete document from `GET` as the
edit baseline, or a typed projection? Which version fields are read-only in the UI, given both the
document's own `version` and the request's `expected_version`? How should conflict feedback name the
current head?
_Blocks: W4._

**B13. Field-level validation detail.** The envelope error carries only `code`, `message` and
`retryable`. What safe field-level detail will policy and feed rejections return? Without it, the
screen can show only one accessible summary message rather than per-field errors.
_Blocks: W4 usable administrator feedback._

**B14. Safe import limits projection.** Import limits live in active policy, and
`policy.example.json` is an initial value, not a UI constant. `policy_read` is admin-only. What safe
projection gives a non-admin uploader the accepted formats and current limits?
_Blocks: W2 pre-submission validation; otherwise the screen states formats without promising a
limit._

**B15. Import run to summary linkage.** `ImportSummary` has `run_id`, but a newly created run
response does not identify its eventual import-list entry. What is the safe outcome path and retry
behaviour? Also, `import_connector` requires `batch_id`, which does not appear in `SourceSummary` —
what authorized source supplies it?
_Blocks: W2 outcome display and the admin connector path._

**B16. Completed export payload.** DESIGN asks for a visible checked summary with citations, but the
completed export response specifies only `{download_path, expires_at}`. Will an authorized run-read
expose checked text and citations, or should workbench show readiness and citations only after
another documented call? This needs a coordinated contract decision before any summary preview.
_Blocks: W5 summary display._

**B17. Download authentication and ID semantics.** What exact mechanism and origin does
`download_path` use — is a same-origin cookie-authenticated link sufficient, or must the typed client
attach headers and build a blob? And does the path's ID denote export ID or run ID? Workbench will
use the returned path and never derive one.
_Blocks: W5 download interaction._

**B18. Polish strings reach a rendered page today.** Measured on `GET /workbench` (dev server,
2026-10-03): the served HTML contains **"Ładowanie…"** from `src/shared/ui/LoadingState.tsx:5`
(default `label`) and **"Klocki UI"** from `src/shared/layout/AppShell.tsx:15` (tools nav).
`ErrorState` ("Coś poszło nie tak", "Spróbuj ponownie za chwilę.") and `BarChart`
(`toLocaleString("pl-PL")`, "Wartość"/"Porównanie") carry the same defaults but did not render here.
The served document also declares **`<html lang="pl">`** (`src/app/layout.tsx:16`), so assistive
technology is told the whole English interface is Polish. All of these are in integrator-owned files.
Workbench copy itself is verified Polish-free.
DESIGN mandates an English interface (R20), so this is a release-gate item, not a preference.
_Blocks: nothing in workbench — every call site passes explicit English props — but AT16 and R20
cannot pass while the shell and the loading boundary render Polish._

**B19. Reload persistence.** What is the intended recovery when a create response is lost or the page
is reloaded mid-run? Recovering by server run ID is safe; starting a duplicate operation is not. Is
there a "my active runs" projection, or should workbench keep the run ID in session storage only?
_Blocks: W1 and W5 reload states._

**B20. Session and sign-in.** Where does workbench send an unauthenticated or 401 response, and what
does the login surface look like? DESIGN lists a login screen with four prepared accounts and forbids
displaying passwords. Prepared accounts, `demo:seed` and `test:db` do not exist yet.
_Blocks: any live W1 verification._

## 2. Maciej — Builder B, detection

**M1. Requester-safe parser reason categories.** Which parse and detection failure categories may be
shown to a requester without revealing held content, and which must stay admin-only? Specifically,
how do malformed CSV, encrypted PDF, image-only PDF, over-limit tail and incomplete coverage map onto
`UNSUPPORTED_FILE` versus `INCOMPLETE` versus a generic failure?
_Blocks: W2 error copy accuracy._

**M2. Exact `stage` strings.** `Run.stage` is a free 1–40 character server string and workbench will
display it verbatim. What stage strings will parsing and assessment emit, so progress copy matches
reality instead of inventing names?
_Blocks: W1 and W2 progress display._

Bartosz owns the safe projection of both answers; these are the source facts.

## 3. Nikodem — Builder C, audit

**N1. Trace detail URL shape.** What is the route and parameter for a single trace detail view, so
chat and import outcomes can deep-link to it? Pairs with B7.
_Blocks: W1 trace link, W2 outcome link._

**N2. Shared boundary.** Workbench will link to the trace view and not render trace stages itself.
Confirm that split so neither feature duplicates the other, and note that cross-feature imports are
rejected by `scripts/check-rules.mjs` — anything shared has to go through Bartosz.
_Blocks: nothing; prevents duplicated work._

## 4. Already answered — do not re-ask

- **Is G1 merged?** Yes, `f04054b`. Types, typed client, workbench entry point, nav entry and the 503
  seam all exist.
- **Is there a database?** Yes. T02 applied `20261003152115_core_schema.sql` at 2026-10-03 15:31 UTC:
  17 tables, RLS 17/17, anon probe denied 17/17.
- **What does an unimplemented endpoint return?** HTTP 503, `no-store`, `decision: null`,
  `semantic.status: "unavailable"`, `error.code: "STATE_UNAVAILABLE"`, `retryable: true`. Verified
  live.
- **Who generates the PDF?** Bartosz. Workbench only renders the download interaction.
- **Who decides access?** The gateway. UI role visibility is presentation only.
