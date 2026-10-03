# Builder A task sequence (W0–W6)

Order follows [developer handoffs §3](../../docs/team/developer-handoffs.md) and the
[implementation plan](../../docs/team/implementation-plan.md): minimal controlled chat, then imports,
review, policy/feed, public summary. Written against merged main `50606ca`.

Each task is one small reviewable PR limited to `src/features/workbench/**` and its tests. **No task
creates app routes, shared components, dependencies or database files.** Where a prerequisite is
missing, the fixture-safe part still ships.

Status against merged main `15f5b88`. "Built" means the screen and its tested logic exist and behave
correctly against the live 503 seam; it does **not** mean the workflow has run end to end, because no
gateway endpoint has landed yet.

| Task | Slice             | Prerequisite                        | Status                                                                 |
| ---- | ----------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| W0   | Testable core     | G1 only                             | **Built**                                                              |
| W1   | Chat (T06)        | chat/run routes live                | **Built**, awaiting a live endpoint                                    |
| W2   | Imports (T05)     | source/import routes + parser       | **Built**, awaiting a live endpoint                                    |
| W3   | Review (T07)      | review routes + findings projection | Blocked on **B8** (contract decision)                                  |
| W4   | Policy/feed (T07) | policy/feed routes                  | **Built** (policy + feed), awaiting endpoints                          |
| W5   | Export (T09)      | export routes + PDF service         | Blocked on **B16** (contract decision)                                 |
| W6   | Browser QA        | deployed app + prepared accounts    | **Run 1 done** (admin, fail-closed); run 2 needs other roles + phase 6 |

Views live on one route, selected by `?view=`, following the precedent the audit feature set — see
**B2** in [02-open-questions.md](02-open-questions.md). W3 and W5 render a named "waiting on a
contract decision" state rather than a guess at the wrong shape.

---

## W0 — testable core (fixture-safe, start immediately)

**User outcome:** none directly. This is the structural decision that makes every later task
testable and reviewable.

**Why it exists:** `vitest.config.mts` is `environment: "node"` with `include:
["src/**/*.test.ts"]`. There is no jsdom, no `@testing-library/react` and no Playwright, so
`.tsx` components cannot be unit-tested today. Keeping decision logic in pure `.ts` modules means
every later PR ships real passing tests under the existing `npm run test`, regardless of which
endpoints exist.

**Prerequisite:** G1 only (`f04054b`). Already merged.

**Work, all under `src/features/workbench/`:**

- `lib/envelope.ts` — map `{httpStatus, decision, error.code}` to a single discriminated UI state:
  `progress` · `result` · `review-reference` · `denied` · `conflict` · `refused` ·
  `service-unavailable` · `incomplete` · `invalid-input`. Encode the traps from
  [00-contract-reference.md](00-contract-reference.md): 202 is never approval, 404 must not reveal
  existence, 409 never auto-retries, 503 carries no verdict.
- `lib/runState.ts` — `Run.state` + server `stage` → safe progress copy and a terminal-state
  predicate that drives poll stop. Display the server's `stage` string; never invent stage names.
- `lib/citations.ts` — `Citation` → display string (`source_label`, `source_date`, `period`,
  `locator`, `excerpt_version`); reject a citation whose `excerpt_id` is not in the permitted set
  returned with the answer.
- `lib/forbidden.ts` — dev/test guard asserting none of the canary strings appear in rendered
  output. Used by tests, not shipped behaviour.
- `lib/fixtures.ts` — clearly labelled development fixtures for every state above.
- `components/WorkbenchPage.tsx` — replace the placeholder with the real shell using `PageHeader`
  and `Card`.
- Tests: `lib/envelope.test.ts`, `lib/runState.test.ts`, `lib/citations.test.ts`.

**Required states:** n/a (logic only), but the state union must cover all five DESIGN-mandated states.

**Acceptance:** no scenario directly. Supports AT06, AT07 and AT16 later.

**PR evidence:** `npm run check` output, `npm run test` counts, and the state-mapping table asserted
in tests against the live 503 envelope captured from `POST /api/v1/chat`.

---

## W1 — minimal controlled chat (live-required for G2)

**User outcome:** an authenticated user asks one question and sees safe progress, then a checked
answer with exact citations and a trace link. An analyst may receive assigned-deal material; an
employee must not learn restricted deal facts, including through source labels or error text.

**Brief:** [minimal-controlled-chat/](minimal-controlled-chat/README.md).

**Prerequisite handoff:** `POST /chat`, `POST /runs/{id}/execute`, `GET /runs/{id}`,
`POST /runs/{id}/cancel` returning real envelopes; a prepared account to sign in with. Fixture-driven
UI and `lib` tests can land before that.

**API calls:** `chat_start` → `run_execute` (once) → `run_read` poll → `run_cancel`.

**Screen and failure states:** empty question · validation error · creating run · running with safe
stage · completed answer with citations · `REVIEW` reference with the answer withheld · `BLOCK` with
a safe reason and no restricted hint · 429 refusal · 503 service error · cancellation requested vs
confirmed · `incomplete` with uncertain usage · stale or missing run after reload · account change
while a response arrives.

**Hard constraints:** no streaming, no unchecked text, buffer until the server says checked. Disable
double-submit, retain the idempotency key for retry of the same action, recover by server run ID
rather than replaying execution. Poll at 1 s while visible, stop on terminal.

**Acceptance:** AT06, AT07 slices; S01 analyst citations and the FY2025 conflict; S02 employee
non-exposure; S07 attribution; S08 loop stop.

**PR evidence:** screenshots of analyst and employee answers to the same S01 question showing the
exposure difference, the blocked and 503 states, test output, and an explicit list of which
endpoints were live vs fixture.

---

## W2 — sources and imports (fixture-safe UI, live for outcome)

**User outcome:** an authorized person selects a configured dataset or uploads one CSV/text PDF, sees
what may be submitted, then receives a truthful quarantined / processing / approved / partial /
review / blocked / failed outcome.

**Brief:** [imports/](imports/README.md).

**Prerequisite handoff:** `GET /sources`, `POST /imports/upload`, `GET /imports`, plus Maciej's
parser reasons and stage strings. Needs Bartosz's answer on multipart through the typed client and on
a safe policy-limits projection.

**API calls:** `source_list`, `import_upload` (multipart `file` + `classification`, optional
`deal_id` and the five attribution fields), `import_list`.

**Screen and failure states:** no configured source · source list loading/error · unsupported or
over-limit file caught before submission · missing PDF attribution · upload pending · accepted but
quarantined · processing · approved · partial with safe retained units · review reference · blocked ·
parser or model unavailable · malformed CSV · encrypted or image-only PDF · run missing after
refresh.

**Hard constraints:** label `status` and `classification` separately. Client-side extension/size
checks are usability hints only. **No original-download control anywhere.** Show accepted formats
without promising a precise limit until a policy projection exists. Distinguish transfer progress
from processing; do not fake byte progress. Copy for an image-only PDF: "This PDF has no extractable
text; upload a text PDF or CSV."

**Acceptance:** AT03 slices, S05 (MIX-01 → restricted safe candidate or an honest review).

**PR evidence:** screenshots of accepted CSV, rejected malformed CSV, image-only PDF rejection and a
quarantined outcome; confirmation that no original download exists; test output.

---

## W3 — administrator review (live-required)

**User outcome:** an administrator inspects a held candidate, understands safe findings and
provenance, edits the proposed extract, picks an allowed classification, gives a reason, and approves
or rejects **the exact version** after a fresh scan.

**Brief:** [review/](review/README.md).

**Prerequisite handoff:** `GET /reviews`, `GET /reviews/{id}`, `PUT /reviews/{id}`; a decision on the
safe findings projection (public `Review` has no findings or locator field); a trusted route for
selectable public excerpt evidence.

**API calls:** `review_list`, `review_read`, `review_resolve` with all six required fields.

**Screen and failure states:** empty queue · loading/error · candidate pending · edited unsaved
draft · missing reason or evidence · rescan in progress · approved · rejected · expired · **409
version conflict** · server validation failure · scan or audit outage · role/session change during
review · non-admin denial without candidate text.

**Hard constraints:** render candidate text as inert text in a labelled editor — never interpret
PDF/HTML/Markdown from the original. Keep the visible version beside the editor and send the
server-provided `expected_version`. On 409, preserve the local draft separately, explain that the
candidate changed, and require a fresh authorized read; never auto-overwrite. Evidence is required
when lowering classification and may only come from current public-approved excerpts. Show the
outcome only after the rescan completes — no success banner before it.

**Acceptance:** AT05, S06 (approve exactly the public webinar sentence with PUB-02 evidence; attendee
list stays private; stale version rejected).

**PR evidence:** before/after version, a reproduced 409 conflict with the draft preserved, non-admin
denial, test output.

---

## W4 — policy and threat-feed administration (live-required)

**User outcome:** an administrator sees current policy and feed versions, edits valid controls,
understands rejected changes, and can reach evidence that the next operation used the new version.

**Brief:** [policy-feed/](policy-feed/README.md).

**Prerequisite handoff:** `GET/PUT /policy`, `GET/POST /feeds`; the shape of safe field-level
validation errors (the envelope error carries only code/message/retryable).

**API calls:** `policy_read`, `policy_update` (CAS on `expected_version`, complete document),
`feed_read`, `feed_import` (`expected_version` ≥ 0, complete document).

**Screen and failure states:** loading current document and version · no feed or expired feed ·
editing · field error · submitting · accepted new version · stale-version conflict · invalid schema
or business rule · unauthorized · state/audit unavailable · a later operation showing the previous vs
new version.

**Hard constraints:** labelled form over the schema's existing fields, not raw JSON paste. **No
bypass toggle** for required Laya, access checks or budgets — the screen must make that impossible,
not merely discouraged. Client validation is a hint; the gateway's business rules (review threshold
below block, overlap below window, consistent budgets, allowlists cannot add tools/models, no URLs or
secrets) are authoritative and must not be reimplemented as a second validator. Distinguish "saved"
from "proved the next request used it". Avoid live policy/feed writes outside coordinated test
records — preview and production share one Supabase project.

**Acceptance:** AT09, S10 (new literal indicator blocks the matching request while an unrelated
benign request still succeeds; stale CAS rejected).

**PR evidence:** version before and after, a rejected stale update, a rejected invalid document, test
output.

---

## W5 — public summary and PDF download (live-required)

**User outcome:** any prepared account requests a fresh public summary and downloads its checked PDF.

**Brief:** [public-summary-download/](public-summary-download/README.md).

**Prerequisite handoff:** `POST /exports`, run execute/read, `GET /exports/{id}/download`, Bartosz's
PDF service; a decision on whether a completed export exposes checked text and citations or only
`{download_path, expires_at}`; confirmation of the download path's auth mechanism and origin.

**API calls:** `export_start` → `run_execute` → `run_read` poll → `export_download`.

**Screen and failure states:** empty topic · validation error · creating/running · completed and
ready with labelled expiry · review or blocked with no downloadable file · model/semantic/audit
unavailable · incomplete with unknown usage · download 401/403/404 · expiry and revocation ·
interrupted network · account switch · successful browser download.

**Hard constraints:** public audience regardless of the actor's wider chat rights. Use the
server-returned `download_path`; **never derive a URL from an ID**. Show the download control only
after a completed export with a valid path and expiry. A saved PDF proves transfer, not public-only
contents. No custom PDF preview.

**Acceptance:** AT11, S03 (external reviewer gets only public FY2025 revenue and the webinar notice
with citations; no internal, restricted or canary values in response, PDF text, metadata or
attachments).

**PR evidence:** screenshots of readiness and download, a denied guessed ID, an expired download.
Independent PDF text extraction is Bartosz's assertion, not a workbench screenshot.

---

## W6 — browser QA and judge script (T11/T12)

**User outcome:** the 3-minute [runbook](../../docs/demo/runbook.md) walkthrough runs without
surprises, and Julian leads it.

**Prerequisite handoff:** deployed app, four prepared accounts, live Laya/Ollama, seeded fixtures with
MIX-01 and REV-01 staged.

**Work:** role switching across four labelled browser profiles (never a client-side role selector);
keyboard-only passes; 375 px and 1440 px layouts; all five required states per screen; the exposure
contrast between analyst and employee; screenshots for the evidence pack. Use the
`hackyeah-browser-qa` skill. Manual until Playwright exists.

**Acceptance:** AT16 workbench slices.

**PR evidence:** dated screenshots from actual runs, with each not-run check listed explicitly.

---

## Fixture-safe vs live-required

**Can proceed with labelled development fixtures now:** W0 entirely; W1, W2 screen structure, state
rendering and `lib` tests.

**Cannot be claimed without real endpoints:** every decision outcome, any `ALLOW`/`BLOCK` evidence,
G2 exit, W3/W4/W5 end-to-end behaviour, and all of W6. A labelled fixture never becomes dashboard or
release evidence, and never substitutes fake success in the judged app.
