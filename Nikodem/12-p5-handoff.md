# 12 — P5 delivered: audit CSV download, plus the focus fix and the coverage table

Branch `codex/audit-focus-and-export`, from `main` after PR #18. Three commits, deliberately separable:
the focus fix stands alone, the coverage table is documentation, and the export is the feature work.

## 1. Visible keyboard focus — a defect, not a feature

`DESIGN.md:24` requires visible keyboard focus, and `src/app/globals.css` sets no global focus rule, so
an element that does not carry the classes relies on the browser default. A survey of `src/features`
found that the shared `Button` and both of Julian's interactive components already use one pattern
(`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`) and that **the
only interactive elements missing it were four of mine**: the scope links, the activity-row trace links,
the reduction source link and the subcall disclosure summary. Fixed with the established pattern rather
than an invented one. The reduction source link also became `next/link`, like the feature's other
internal links.

Worth raising with Bartosz: a single rule in `globals.css` would make this impossible to forget, since
every feature now repeats the same four classes.

## 2. Coverage table — `05-test-plan.md` §7

Every AT10, AT15 and AT16 assertion mapped to the test that covers it, in three honest states: asserted
by vitest, satisfied by construction, or not run. It names the assertions that nothing this feature can
add will satisfy — AT10-1, AT16-1, AT16-4 and the byte-level half of AT10-6 — because they need the T03
routes, a session per role, or a browser. This is the table the T11/T12 report will be built from, and
keeping it current is cheaper than reconstructing it at the end.

## 3. The export

| File                          | Role                                                                   |
| ----------------------------- | ---------------------------------------------------------------------- |
| `export.ts`                   | request path, filename, `Content-Disposition` parsing, response states |
| `export.test.ts`              | 12 assertions                                                          |
| `components/ExportButton.tsx` | the control, its result notices and the download itself                |

### Decisions, and why

**A fetch, not an anchor.** `GET /audit/export` returns `text/csv` with an `X-Trace-ID` header on
success and the JSON envelope on refusal. An anchor can read neither, and the agreed copy requires both
the export trace identifier and the row-cap instruction. So the request is a fetch, and the blob becomes
an object URL handed to a download that is revoked immediately.

**The CSV body never reaches the page.** It is never parsed, never rendered and never logged — the
response goes from `blob()` straight to the download. That is the half of AT10-12 that can be guaranteed
by construction.

**Nothing rewrites a byte.** Neutralising a cell that begins `=`, `+`, `-`, `@`, tab or CR is the
gateway's job. A client that quietly fixed such a cell would hide a server that had stopped doing it, so
this layer asserts the outcome and changes nothing. The byte assertion stays **not run** until the real
route exists.

**One request per double click.** The button is disabled while a request is in flight, and an in-flight
ref also blocks a programmatic second call, so neither a fast double click nor a second handler can issue
two exports.

**A filename from the server is accepted only when it is plain.** `Content-Disposition` is parsed, and
any name containing `/`, `\` or `..` is discarded in favour of `audit-<scope>-<YYYY-MM-DD>.csv`, so a
crafted header cannot steer where a browser writes.

**The row cap is a refusal, never a truncated file.** It arrives as `INVALID_INPUT` carrying the
narrowing instruction, and is told apart from an ordinary range error by the row count in the message —
so a range error still reads as a range error. The gateway's own sentence is shown verbatim.

## Evidence

| Check                                   | Result                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run`                        | **264 passed** (22 files); 103 in this feature                                                                                    |
| `npx tsc --noEmit` after `next typegen` | 0 errors                                                                                                                          |
| `npx eslint src/features/audit`         | 0 problems                                                                                                                        |
| `npx prettier --check .`                | clean                                                                                                                             |
| `node scripts/check-rules.mjs`          | `✅ struktura OK`                                                                                                                 |
| `npx next build`                        | success                                                                                                                           |
| Live on `localhost:3000`                | `/api/v1/audit/export?scope=own` → 503 `application/json`, so the button reports the unavailable state instead of offering a file |

One test-helper bug was caught and fixed while writing this: the success helper used `??`, so a test
asking for an explicitly absent `X-Trace-ID` silently received the default one. It now distinguishes
"absent" from "not provided", and the no-header case genuinely asserts the no-header behaviour.

**Not verified.** No browser pass: the download was never triggered, no file was ever written, the
double-click guard was not observed in a network log, and the focus ring was not seen. The export seam
answers 503, so no CSV has ever existed to inspect — AT10-6 remains the one assertion in this phase that
only T03 can unlock.
