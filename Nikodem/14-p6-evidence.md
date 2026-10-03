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

No viewport was measured, no keyboard path was walked, no console or network panel was read, and no
screenshot exists.

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

## 4. What is still unobserved

| Gate   | Missing                                                                            |
| ------ | ---------------------------------------------------------------------------------- |
| AT16-1 | a session per role; login exists, so this is purely a browser task                 |
| AT16-2 | the full per-role scan; the trace screen itself is asserted in the DOM             |
| AT16-3 | the keyboard walk; every interactive element carries a focus ring in code          |
| AT16-4 | 375 px and 1440 px. One overflow was already found and fixed at 375 px (`50d8975`) |
| AT10-1 | two sessions, to show that own scope excludes another actor                        |
| AT10-2 | a real 403, which needs `/metrics`                                                 |
| AT10-6 | the CSV bytes, which need the export backend                                       |

Nothing on this list is work I can write. Four need a human with a browser; three need endpoints that
are still the 503 seam.

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
