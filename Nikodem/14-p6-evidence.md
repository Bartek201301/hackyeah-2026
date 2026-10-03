# 14 — P6 evidence so far, and what is still unobserved

The report T11 and T12 will need, kept current rather than written at the end. It records what was
actually seen, by whom, and what has not been seen at all.

**Rule for this file:** an observation I did not make is attributed to whoever made it. I have no
browser tool in my session, and `hackyeah-browser-qa` is explicit that a missing tool is reported as a
specific lack, not replaced by reading the code.

## 1. What was observed, and by whom

| #   | What                                                                                          | Observed by                    | When       |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------ | ---------- |
| 1   | A real chat run through the gateway, withheld because the required assessment was unavailable | Nikodem, in the browser        | 2026-10-03 |
| 2   | The trace screen rendered for that run, read as pasted output                                 | me, from his paste             | 2026-10-03 |
| 3   | The raw `GET /api/v1/audit/{id}` envelope for a second trace                                  | Nikodem, pasted                | 2026-10-03 |
| 4   | Three live refusals: 503 seam, 401 unauthenticated, 400 invalid input                         | me, via curl without a session | 2026-10-03 |

| 5 | Three screenshots as `admin`: trace detail with the console open, the same at 1280x800 device emulation, and the dashboard at `/audit` | Nikodem, in the browser | 2026-10-03 |
| 6 | The raw envelope of the prompt-injection BLOCK from Julian's QA run 2 | Nikodem, pasted | 2026-10-03 |

### What the screenshots show

Read from the images, not from the code:

- **The three defect fixes are live.** The summary reads `No decision recorded` with
  "The operation did not complete, so no decision was stored and no result was released." — not
  `Pending`. The header reads `root request · recorded 2026-10-03 19:53:09 UTC`. The reserved column
  reads `No reservation is outstanding.` beside `0 tokens`.
- **Focus is visible.** The `Own activity` control carries a clear ring in the dashboard screenshot.
- **The dashboard refuses honestly.** `/audit` shows `Reporting state is unavailable.` with
  `Try again`, and no zeroed counters, which is the correct answer while `/metrics` is a seam.
- **The page is English throughout**, including the shell: nav, `Signed in as admin`, `Sign out`.
- **The console carries no JavaScript error.** On the trace screen DevTools reports `No issues`. On
  the dashboard it lists nine entries, all of them `503 (Service Unavailable)` for
  `/api/v1/metrics` and `/api/v1/audit` — the browser's own log of failed requests, from
  `Dashboard.tsx:54` and `:61`. Paired and bounded, four loads under React's development double
  invocation; not a retry loop. They will disappear when the endpoints exist, and if they do not,
  that is a finding.

Still unmeasured: 375 px, the keyboard path end to end, and any role other than `admin`.

## 1b. Checks I ran myself with a real session

`scripts/dev-session.mjs` (added by the integrator in `9c4380c`) signs in with a password held in
`.env.local` and writes **only** a cookie header file, so I could run authorised HTTP checks without
seeing, typing or storing the password. Both session files were deleted immediately after. This is not
browser QA — no rendering, no console, no viewport — but it is live data through the real routes.

| What                                       | Result                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `metrics?scope=organisation` as `analyst`  | **403 ACCESS_DENIED**, `data: null` — the refusal carries no figures (AT10-2)                                                   |
| `export?scope=organisation` as `analyst`   | **403**                                                                                                                         |
| `export` with a two-day range              | **400** "Select a range inside a single UTC day."                                                                               |
| `audit` as `analyst`                       | 200, 8 items, **one distinct actor**, no `events` key                                                                           |
| `audit?after=<admin's trace>` as `analyst` | **400** generic invalid-cursor; the id is not echoed                                                                            |
| `audit/{admin's trace}` as `analyst`       | **404**, not 403 — existence is not confirmed (AT10-1)                                                                          |
| `metrics` admin own vs organisation        | 12 vs 53 root requests, 1 vs 17 blocked — the scope really widens                                                               |
| `export` as `admin`, organisation          | 54 lines, 53 rows, **4 distinct actors**, no cell starting `=` `+` `-` `@` tab or CR, no cell containing a space (AT10-6 bytes) |
| the four response headers                  | `text/csv; charset=utf-8`, `attachment; filename="audit-own-2026-10-03.csv"`, `no-store`, `x-trace-id`                          |

The dashboard-to-export cross-check is now a committed test rather than a one-off reading:
`src/features/audit/live-metrics.test.ts` holds the captured pair and asserts that `root_requests`
equals the row count, that five totals equal the column sums exactly, and that
`semantic_input_tokens` is **null** because one row never recorded it — not the 1,060 the other rows
would add up to. That is `docs/testing/acceptance.md:63` verified through two independent endpoints
against the real database.

### The fifth defect, found the same way

One settled run records `reserved_generation_tokens: 2200`; the dashboard for that same UTC day
reports `0`. Both are correct — the row keeps what the run reserved, the window sums what is still
outstanding from the reservations table — but it is **one contract field with two meanings**, and the
shared caption said "Retained until the reservation is reconciled" for both. On the settled run that
described a retention that had already ended; a judge comparing the CSV with the screen would have
read 2,200 against 0 and called it a contradiction.

`usageView` now takes what the number means (`operation` or `window`) and the caption follows:
"Reserved for this operation…" on a trace, "Still outstanding in this window…" on the dashboard, and
"Retained because the reservation was not reconciled…" only when one really is unresolved.

## 2. What the observations found

Four defects, none of which 117 passing assertions had caught, because each was a claim about meaning
rather than about mechanics.

1. **`Coverage incomplete: 0 of 0 windows assessed.` on every stage.** The gateway sends
   `coverage_complete: false` with `windows_planned: 0` for an assessment it never ran. A false alarm
   teaches a reader to ignore the real one.
2. **`Pending` for an operation stored with `state: "failed"`.** It told the reader to wait for a
   decision that would never arrive.
3. **`Retained until the reservation is reconciled` beside `0 tokens`.** It described a retention that
   was not happening.
4. **An unlabelled timestamp beside "root request"** that is in fact the projection's own
   `created_at`, and matched the **last** stored event in both traces seen — not the start.

All four are fixed. Items 1–3 are in `aed4d09`, item 4 in `feee57e`.

## 3. What the real data confirmed

- **No prompt, answer, excerpt, document title or citation appears in the payload or on the screen.**
  The question text from the live run appeared nowhere. This is AT10-4 seen rather than inferred.
- **The envelope root is not the audited trace, and in the wild they disagree.** The read returned
  `decision: "ALLOW"` with its own trace id while the audited operation held `decision: null` and
  `state: "failed"`; they even disagree on the rate version. A screen rendering the root would have
  announced "Allowed" for a withheld operation.
- **Displayed values equal the stored record.** `live-trace.test.ts` asserts all of them against the
  captured response, including the `+993 ms` and `+305 ms` gaps between the three stages. That is
  `docs/testing/acceptance.md:63` for one real trace.
- **The gateway is inconsistent about `decision` on refusals** — `BLOCK` on 401, `null` on 400. Raised
  as item 20; this feature is unaffected because it reads `error` first.
- **A real refusal stores the code, not the attempt.** The prompt-injection BLOCK carries
  `reasons: ["input_signature:SIG-001"]` and one finding — code `SIG-001`, category
  `prompt_injection`, severity `block`, `locator: null`. Every string in that record is a token:
  an identifier, a code, an enum or a timestamp. There is no sentence in it, so there is no injected
  instruction for a reader — or for a model reading the page — to be steered by.
  `live-blocked.test.tsx` asserts that, and asserts in the DOM that the decision, the reason code
  and the finding are all shown.

## 4. What is still unobserved

| Gate   | Missing                                                                            |
| ------ | ---------------------------------------------------------------------------------- |
| AT16-1 | a session per role; login exists, so this is purely a browser task                 |
| AT16-2 | the full per-role scan; the trace screen itself is asserted in the DOM             |
| AT16-3 | the keyboard walk; every interactive element carries a focus ring in code          |
| AT16-4 | 375 px and 1440 px. One overflow was already found and fixed at 375 px (`50d8975`) |
| AT10-1 | two sessions, to show that own scope excludes another actor                        |
| AT10-2 | a real 403, now reachable: `/metrics` refuses `scope=organisation` to a non-admin  |
| AT10-6 | the CSV bytes, reachable once `codex/gateway-audit-export` is merged               |

Nothing on this list is work I can write: every row needs a browser and a session.

**What the dev-server log of the current run already shows.** Not a browser observation and not an
acceptance gate — a server access log, which says what was requested and answered, never what was on
screen or who clicked:

- `GET /api/v1/metrics?scope=own&from=…&to=…` → **200**, and the same for `scope=organisation`
- `GET /api/v1/audit` → **200**
- `GET /api/v1/audit/export?scope=own&from=…&to=…` → **200**, with exactly the window the button sends
- the refusals still refuse: `GET /api/v1/audit/export` without a session → 401, `POST` → 503

So the three reads answer a real session, and the CSV was produced at least once. What nobody has
recorded is the **rendered** screen, the console, or the contents of that file. The log cannot show any
of those, so none of them is claimed here.

**The endpoint blocker is gone, which changes what the next observation is worth.** The dashboard
screenshot in §1 was taken while `/metrics` and `/audit` were the 503 seam, so it shows the honest
refusal and no figures at all. Both reads are now merged (PR #57, PR #62) and the export is pushed, so
the dashboard has never been seen with real numbers in it — and that screen is the one the demo's final
slot shows. The nine `503` console entries recorded in §1 should now be absent; if they are not, that is
the finding that paragraph promised to treat as one.

## 5. The demo beat, as it can honestly be run today

`docs/demo/runbook.md:25`, the `2:35–3:00` slot. With the dashboard endpoints missing, only the trace
half is demonstrable:

1. Ask a question in the workbench. It is withheld, because the required assessment is unavailable.
2. Follow the trace link. Say: **the result was withheld, and here is why** — the assessment stage
   reads `Assessment unavailable`, and the screen states that the operation was withheld.
3. Point at the decision: `No decision recorded`, not "Blocked" and not "Pending". Nothing was
   authorised and nothing is coming.
4. Point at what is absent: no question text, no document title, no excerpt anywhere on the page.
5. Say what is not being shown: the dashboard and the CSV export, because their endpoints are not
   built yet. Do not open them.

That is an honest three-step story about withholding. It is not the planned beat, which needed
organisation aggregates beside measured usage, and it should not be presented as if it were.
