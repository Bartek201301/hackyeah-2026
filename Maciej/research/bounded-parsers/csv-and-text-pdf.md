# Bounded CSV and text-PDF parsing

Researched 3 October 2026. T04/T05; R04/R05/R16; AT03 and S05. Outcome: all accepted text has reproducible provenance and can be assessed completely; invalid or partially extracted files never yield approved excerpts. Bartosz owns upload streaming limits, quarantine and publication. Maciej owns parsing and feature tests.

## Accepted contract and gaps

[Scenarios](../../../docs/demo/scenarios.md) require exactly `text,source_date,period,unit,fact_key,basis`, in that order. Fields are nonempty; dates are ISO; basis is actual/forecast/proposal/event. Quoted newlines are valid. Trusted source records supply classification/deal/audience evidence. PDF attribution comes from the upload/review context. [Policy defaults](../../../docs/contracts/policy.example.json) currently permit 2 MiB, 20 PDF pages, 500 CSV rows, 24,000 text characters and 180 seconds processing. Read these centrally; they are not feature constants.

`ParsedUnit` exposes text, locator and offsets, but no row attribution. `ParsedDocument` exposes units/hash/character count without canonical text or a joining rule. The prospective G1 implementation repeats this shape. Passing parser output alone would lose CSV source_date/period/unit/fact_key/basis unless Bartosz defines an additional path. Treat both as contract questions, not permission for a hidden side channel or a second parser in shared code (D02).

## CSV findings and recommendation

[csv-parse options](https://csv.js.org/parse/options/) support strict column counts, quoting, BOM handling, record-size limits and record/line information. Candidate 7.0.3 was verified in [official registry metadata](https://registry.npmjs.org/csv-parse/7.0.3); it was not installed or run.

Recommend fatal UTF-8 decoding, explicit comma dialect, optional single initial UTF-8 BOM removal, and exact header validation before converting rows to objects. Duplicate headers must fail rather than overwrite a previous value. Preserve text and attribution strings; do not infer numeric/date conversions or trim text in ways that change evidence. Distinguish physical lines from logical CSV records because one quoted field can span several lines.

Use `max_record_size` as an additional bound, not the only cell/text limit. Independently count rows, fields, cells, Unicode code points, decoded total size and elapsed time. Do not use row-limiting options to stop after the maximum and return success: encountering an excess row or malformed trailing record must reject the document. Likewise skip-errors/relaxed-column options are inappropriate for accepted complete coverage. No early publication while streaming.

Alternative: synchronous parse is simpler for tiny input, but a blocked synchronous call does not honor AbortSignal promptly. Recommend a bounded incremental parser with actual cancellation/error propagation; if CPU work cannot yield, evaluate a terminable worker. The exact worker integration is later implementation work and must fit the server runtime. Formula-like CSV content remains inert data; audit CSV formula escaping belongs to Bartosz's export path, not mutation of source text.

## PDF findings and recommendation

Candidate PDF.js 6.3.289 declares a Node engine satisfied by Node 24.14.1 and has optional native canvas dependency. Its [pinned display API](https://github.com/mozilla/pdf.js/blob/v6.3.289/src/display/api.js) exposes `getTextContent`/streaming extraction, `getAttachments`, document/page `getJSActions`, `getOpenAction`, annotations, and asynchronous destruction. `stopAtErrors:true` requests errors instead of certain partial-recovery results. The old `isEvalSupported` option is absent from this inspected release; don't claim protection by passing an ignored legacy option.

Recommend passing local bytes, extracting text without rendering/viewer or scripting facilities, checking every page, bounding emitted text/items and time, and destroying loading/document resources on completion or failure. Keep XFA disabled. Supply no untrusted external asset URLs and verify the parser causes no unexpected network requests. PDF signatures/MIME identify a candidate format; they do not establish safe contents.

Two limitations need explicit acceptance evidence before implementation claims:

- Disabling execution is different from rejecting active content. Inspect catalog/page actions, attachment/annotation paths and forms; test the selected narrow rejection policy against actual fixtures. No guarantee follows from calling just one JavaScript API.
- Password callbacks catch password-required files, but do not prove detection of every encrypted PDF, including empty-user-password encryption. The inspected public display API does not expose a simple `isEncrypted` document property. Ask Bartosz to approve a reliable encryption-inspection strategy or additional parser dependency after a focused spike. Raw `/Encrypt` substring searches are not a safe structural substitute.

Text extraction is not a proof that visible or embedded information was fully understood. Image-only pages, mixed text/scanned pages, broken font mappings, ambiguous multi-column ordering and hidden text require conservative rejection/review within the accepted no-OCR scope. Recommend document failure for a page without reliable extractable text, not publishing earlier pages. Include hidden extracted text in inspection; never drop it merely because it is visually inconvenient. No claim of OCR, universal malware detection or semantic completeness of arbitrary PDFs.

## Canonical text and provenance recommendation

Propose a versioned reconstruction rule to Bartosz: stable ordered units, explicit separators, code-point offsets into the reconstructed extracted text, SHA-256 of those exact UTF-8 bytes, and preserved per-unit attribution. Keep raw-file hash separate from extracted-text hash. Unicode NFKC scanning is a derived view and must not silently change that original hash.

For CSV locators, record logical data-row identity plus physical line range where useful. For PDFs, page and paragraph/unit identity remain stable within an extraction version; coordinates are optional evidence, not a substitute for textual spans. PDF text-item joining and normalization need a frozen extraction version. `disableNormalization` can change text extraction behavior; choose it through fixture evidence rather than assuming it reproduces original byte content. Repeated text must not be mapped by first substring match.

## Verification, integration and remaining evidence

Future cases: valid quoted commas/newlines and BOM; invalid UTF-8; duplicate/missing/reordered headers; empty metadata; invalid basis/date; overlong cell/row/file; malformed tail; Unicode astral/combining characters; CSV record versus physical line locators. Include exact-limit and one-over-limit cases.

For PDF: ordinary multipage text; encrypted with/without a user password; image-only/mixed pages; attachments, catalog/page actions and annotations; broken fonts; hidden text; overlimit final page; decompression/text growth; deadline/cancellation and cleanup. Assert `complete` never becomes true for partial output and no result is published on failure. Test hash/offset reconstruction independently.

Read the installed Next 16.3.8 serverExternalPackages guidance before a parser spike. A Node engine match does not prove ESM import, worker assets, memory limits or deployed bundling. Maciej supplies a safe parser reason catalog; Bartosz decides which categories reach Julian's UI. Raw parsing exceptions, paths and snippets must not be displayed.

Not run: parser imports, extraction, malicious-file fixtures, worker cancellation, Next parser build/preview or publication tests. Encryption/action coverage and the ParsedDocument attribution contract remain explicit blockers to claiming parser readiness.
