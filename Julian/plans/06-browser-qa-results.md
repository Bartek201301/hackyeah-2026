# Browser QA results — run 1 (fail-closed pass)

Run of [03-browser-qa.md](03-browser-qa.md). This file records what was actually observed; where a
check could not be performed it says so rather than leaving it implied.

| Field    | Value                                                                         |
| -------- | ----------------------------------------------------------------------------- |
| Date     | 2026-10-03, 18:05–18:25 UTC                                                   |
| Build    | PR #27 preview, head `5efb24d` (`codex/workbench-envelope`, main merged in)   |
| Browser  | Chrome, signed in as **admin**                                                |
| Viewport | 1440×900 and 500×860                                                          |
| Tooling  | Driven through the Claude in Chrome extension; DOM assertions in page context |

**Headline:** every workbench view behaves correctly in its fail-closed state, and no new workbench
defect was found. The chat route is now live but still withholds, because
[composition.ts](../../src/app/api/v1/composition.ts) passes `detection: null, generation: null`
until phase 6 — so no answer has been produced end to end yet, and none is claimed here.

## A — shell and navigation

| Check                              | Result                                         |
| ---------------------------------- | ---------------------------------------------- |
| `/workbench` heading is `Ask`      | pass                                           |
| Five nav links                     | pass                                           |
| Active link marked                 | pass — `aria-current="page"`, not colour alone |
| `?view=bogus`                      | pass — falls back to Ask, no error             |
| Back / forward                     | pass — Ask ↔ Sources and import                |
| Reload keeps the view              | pass                                           |
| Role-based hiding of Review/Policy | **not run** — needs a non-admin account (B21)  |

## B — ask (chat)

| Check                            | Result                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------- |
| Empty submit                     | pass — "Enter a question before sending." and **zero** network requests          |
| Character cap                    | pass — `maxLength=4000`, counter tracks (`48 of 4000 characters.`)               |
| Submit against the live route    | pass — red "Service unavailable", "This gateway operation is not available yet." |
| Trace id and **Try again**       | pass — e.g. `/audit?trace=df65891e-ec97-4480-853b-cf8f9e6cccde`                  |
| No progress card, no answer card | pass — nothing rendered without a releasing decision                             |
| Danger notice announced          | pass — `role="alert"`                                                            |
| One `POST /api/v1/chat` per send | pass — 503, no duplicate execute call                                            |
| Idempotency-Key rows             | **not run** — see [limitations](#limitations)                                    |

## C — sources and import

| Check                             | Result                                                                    |
| --------------------------------- | ------------------------------------------------------------------------- |
| CSV header stated                 | pass                                                                      |
| `.txt` refused                    | pass — "Only a CSV or a text PDF can be uploaded.", **zero** network      |
| `.pdf` reveals attribution fields | pass — source date, period, unit, fact key, basis                         |
| Each blank attribution field      | pass — its own message, e.g. "A text PDF needs its period."               |
| `.csv` hides attribution fields   | pass                                                                      |
| Classification required           | pass — "Choose a classification."                                         |
| Deal select                       | pass — disabled, "No assigned deal is available to this account." (B21)   |
| Valid CSV submit                  | pass — one `POST /imports/upload` 503, then `/sources` and `/imports` 503 |
| **No original-download control**  | pass — every link and button text swept, nothing matches                  |

## D — policy and threat feed

| Check                         | Result                                                                  |
| ----------------------------- | ----------------------------------------------------------------------- |
| Both panels render with 503   | pass — two `role="alert"` notices, each with a trace link               |
| **No bypass control**         | pass — **zero** checkboxes or switches exist on the page                |
| Action values                 | pass — only `REVIEW` and `BLOCK`; no `ALLOW`                            |
| Add indicator and count       | pass — `Indicators (2 of 100)`                                          |
| Expiry in the past            | pass — "The expiry must be in the future."                              |
| `domain` validation           | pass — rejects `not a domain`; the same string is accepted as `literal` |
| Duplicate indicator id        | pass — "Duplicate id; it is already used by indicator 1."               |
| Resolved UTC instant          | pass — `Submitted as 2026-10-03T16:12:00.000Z` for local 18:12 CEST     |
| Push with a valid draft       | pass — `POST /feeds`, 503 fail-closed                                   |
| Invalid draft never submitted | pass — no request leaves the browser until validation passes            |
| Policy form fields            | **not run** — `GET /policy` is 503, so the form never loads             |

## E — review and export

Both render the named waiting state, quoting the exact contract gap (B8 findings and locator; B16
checked summary text and citations). They read as deliberate, not broken.

## F — responsive, keyboard, accessibility

| Check          | Result                                                            |
| -------------- | ----------------------------------------------------------------- |
| 1440 px        | pass — no horizontal scroll                                       |
| 500 px         | pass — sidebar collapses to a top bar, nav wraps, nothing clipped |
| **375 px**     | **not run** — Chrome will not size a window below ~500 px wide    |
| Focus ring     | pass — `2px solid` outline on each tabbed control                 |
| Tab order      | pass — follows the visible nav order                              |
| Console        | pass — **zero** messages across every view and interaction        |
| Reduced motion | **not run**                                                       |
| English copy   | **fail — B18**, see below                                         |

## G — negative checks

| Check                                 | Result                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| Unauthenticated page request          | pass — `/workbench?view=policy` redirects to `/login`                        |
| Unauthenticated gateway call          | pass — anonymous `POST /api/v1/chat` → **403 `ACCESS_DENIED`**, generic text |
| Non-admin calling an admin operation  | **not run** — needs the Employee or Reviewer account                         |
| Sign out in one tab, act in another   | **not run**                                                                  |
| No password, token or secret rendered | pass                                                                         |

## Defects

**B18 — shell renders Polish (not Builder A's to fix).** `<html lang="pl">`
([layout.tsx:26](../../src/app/layout.tsx)), plus `MENU`, `NARZĘDZIA`, `Przykład` and `Klocki UI`
from [AppShell.tsx](../../src/shared/layout/AppShell.tsx) and [page.tsx](../../src/app/ui/page.tsx).
Visible on every screen including `/login`. **R20 and AT16 cannot pass while this stands.**

No new workbench defect was found.

## Live-path state at the time of the run

The chat route is deployed and its access checks run — an anonymous call is denied `403` with text
that reveals nothing. An authenticated admin call returns `503 STATE_UNAVAILABLE` because
`composition.ts` leaves the detection and generation ports null until phase 6. The audit read route
had not landed at the time of this run, so the trace link opened a fail-closed audit screen; it
merged shortly afterwards in PR #33 and should be rechecked.

**Nothing here is evidence that a governed answer works end to end.** The fail-closed behaviour is
the real, intended product behaviour, and that is all this run demonstrates.

## Limitations

- **Request headers are not observable** with this tooling, so the `Idempotency-Key` rows could not
  be checked in the browser. A `window.fetch` spy does not help: `openapi-fetch` captures
  `globalThis.fetch` when the module loads, before any patch can apply. The behaviour is covered by
  the `lib/idempotency.ts` unit tests instead.
- **375 px** needs either a device-emulation mode or a manual window resize by a human.

## What run 2 needs

1. The Employee or Reviewer account, for the exposure contrast and the non-admin denial.
2. Phase 6 composition, for any `ALLOW`/`BLOCK` evidence, citations, cancellation and server stage
   text.
3. A human at 375 px, and a reduced-motion pass.
