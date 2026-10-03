# Contract reference for workbench screens

Working extract, verified against merged main `50606ca` on 2026-10-03. Authority stays with
[OpenAPI](../../docs/contracts/openapi.json), [protocols](../../docs/contracts/protocols.md),
[policy schema](../../docs/contracts/policy.schema.json) and
[fixtures](../../docs/demo/fixtures.json). If this page disagrees with those, they win.

## Response envelope

Every JSON response at every status code carries all ten fields, with
`additionalProperties: false`:

`trace_id` (uuid) · `decision` · `reasons` · `policy_version` · `feed_version` · `semantic` ·
`usage` · `timings` · `data` · `error`

All responses are `Cache-Control: no-store`. Verified live against the current 503 seam:
`POST /api/v1/chat` returns HTTP 503, `cache-control: no-store`, `decision: null`,
`semantic.status: "unavailable"`, `error.code: "STATE_UNAVAILABLE"`, `error.retryable: true`.

- `reasons` is `string[]`, each 1–80 chars, max 20 items, **no enum**. Render as opaque labels; never
  branch on a fixed list.
- `policy_version` / `feed_version` may be `null` before policy lookup succeeds.
- Unknown usage and timings are `null`, **never zero**. Zero means measured zero. The 503 seam's
  zeros are true values because nothing executed.

## Enums

| Enum                   | Values                                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decision`             | `ALLOW` · `REDACT` · `REVIEW` · `BLOCK` · `null`                                                                                                                                                                                                               |
| `error.code` (15)      | `INVALID_INPUT` `UNAUTHENTICATED` `ACCESS_DENIED` `NOT_FOUND` `CONFLICT` `RATE_LIMITED` `BUDGET_EXHAUSTED` `POLICY_UNAVAILABLE` `SEMANTIC_UNAVAILABLE` `MODEL_UNAVAILABLE` `AUDIT_UNAVAILABLE` `STATE_UNAVAILABLE` `UNSUPPORTED_FILE` `CANCELLED` `INCOMPLETE` |
| `Run.kind`             | `import` · `chat` · `export`                                                                                                                                                                                                                                   |
| `Run.state` (9)        | `pending` `running` `completed` `review` `blocked` `failed` `cancel_requested` `cancelled` `incomplete`                                                                                                                                                        |
| `ImportSummary.status` | `quarantined` `processing` `approved` `partial` `review` `blocked` `failed`                                                                                                                                                                                    |
| `Review.status`        | `pending` · `approved` · `rejected` · `expired`                                                                                                                                                                                                                |
| `Assessment.status`    | `complete` · `not_required` · `unavailable` · `incomplete`                                                                                                                                                                                                     |
| `Finding.severity`     | `info` · `review` · `block`                                                                                                                                                                                                                                    |
| `classification`       | `public` · `internal` · `restricted` (on Review, Excerpt, ImportSummary, SourceSummary, SourceRequest)                                                                                                                                                         |
| `SourceSummary.kind`   | `dataset` · `upload`                                                                                                                                                                                                                                           |
| `audience_evidence`    | `verified` · `unverified` (SourceRequest default `unverified`)                                                                                                                                                                                                 |
| `basis`                | `actual` · `forecast` · `proposal` · `event`                                                                                                                                                                                                                   |

`status` and `classification` are independent dimensions and need separate visible labels — a
document's processing state never implies its sensitivity.

## HTTP status → UI state

| Status      | Meaning                                                     | Screen behaviour                                                      |
| ----------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| 200         | Completed governed result: `ALLOW`/`REDACT`, or terminal    | Show the checked result                                               |
| 202         | Run or review created, `decision: null`, `error: null`      | **Not approval.** Show progress only; never render generated text     |
| 400/413/415 | Invalid, oversized, unsupported; no side effect             | Field-level error associated with the control                         |
| 401         | Missing or invalid identity                                 | Send to sign-in; do not retry silently                                |
| 403         | Deterministic denial (`BLOCK`)                              | Safe reason category only; never hint that restricted material exists |
| 404         | Inaccessible object ID                                      | Generic not-found. **Must not reveal whether the object exists**      |
| 409         | Version or idempotency conflict; no new effect              | Preserve the local draft, require a fresh read, **never auto-retry**  |
| 429         | Budget / rate / loop refusal (`BLOCK` + reason)             | Show the specific refusal reason; no further submission               |
| 503         | Required state/provider/audit unavailable; `decision: null` | Service error, **no verdict**. Distinguish from a policy denial       |

`REVIEW` returns only a review reference to the requester. Candidate contents are admin-only — a
requester screen must never display them.

## Operations

Verified by extraction from the contract. All POST/PUT require header `Idempotency-Key: <UUID>`.

| Operation          | Method + path                           | Required request                                                                                                                                                       | Success `data`                                                                               |
| ------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `chat_start`       | POST `/chat`                            | `message` (1–4000); opt `deal_id`                                                                                                                                      | 202 → `Run`                                                                                  |
| `run_execute`      | POST `/runs/{id}/execute`               | no body                                                                                                                                                                | `Run`, or completed chat `{answer,citations}`, completed export `{download_path,expires_at}` |
| `run_read`         | GET `/runs/{id}`                        | —                                                                                                                                                                      | same union as `run_execute`                                                                  |
| `run_cancel`       | POST `/runs/{id}/cancel`                | no body                                                                                                                                                                | `Run`                                                                                        |
| `excerpt_search`   | POST `/search`                          | `query` (1–400); opt `deal_id`                                                                                                                                         | `{items: Excerpt[]}` max 5                                                                   |
| `excerpt_read`     | GET `/excerpts/{id}`                    | —                                                                                                                                                                      | `Excerpt`                                                                                    |
| `source_list`      | GET `/sources`                          | query `after`                                                                                                                                                          | `{items: SourceSummary[]}` max 50                                                            |
| `source_create`    | POST `/sources` _(admin)_               | `label`, `dataset` (const `demo_dataset_v1`), `classification`; opt `deal_id`, `audience_evidence`                                                                     | `{source_id}`                                                                                |
| `import_upload`    | POST `/imports/upload`                  | **multipart**: `file`, `classification`; opt `deal_id`, `source_date`, `period`, `unit`, `fact_key`, `basis`                                                           | 202 → `Run`                                                                                  |
| `import_connector` | POST `/imports/connector` _(admin)_     | `source_id`, `batch_id`                                                                                                                                                | 202 → `Run`                                                                                  |
| `import_list`      | GET `/imports`                          | query `after`                                                                                                                                                          | `{items: ImportSummary[]}` max 50                                                            |
| `review_list`      | GET `/reviews` _(admin)_                | query `after`                                                                                                                                                          | `{items: Review[]}` max 50                                                                   |
| `review_read`      | GET `/reviews/{id}` _(admin)_           | —                                                                                                                                                                      | `Review`                                                                                     |
| `review_resolve`   | PUT `/reviews/{id}` _(admin)_           | **all six**: `expected_version`, `action` (`approve`/`reject`), `candidate_text` (1–24000), `classification`, `reason` (1–500), `evidence_excerpt_ids` (uuid[], max 5) | `Review`                                                                                     |
| `policy_read`      | GET `/policy` _(admin)_                 | —                                                                                                                                                                      | `{policy}`                                                                                   |
| `policy_update`    | PUT `/policy` _(admin)_                 | `expected_version`, `policy` (complete document)                                                                                                                       | `{version}`                                                                                  |
| `feed_read`        | GET `/feeds`                            | —                                                                                                                                                                      | `{feed}`                                                                                     |
| `feed_import`      | POST `/feeds` _(admin or `feed:write`)_ | `expected_version` (≥0), `feed` (complete document)                                                                                                                    | `{version}`                                                                                  |
| `export_start`     | POST `/exports`                         | `topic` (1–1000); opt `deal_id`                                                                                                                                        | 202 → `Run`                                                                                  |
| `export_download`  | GET `/exports/{id}/download`            | —                                                                                                                                                                      | PDF bytes + `X-Trace-ID`; failures are JSON                                                  |

Note the asymmetry: `policy_update` requires `expected_version` ≥ 1 while `feed_import` allows ≥ 0
(no feed installed yet).

## Compare-and-swap on policy and feed

technical-spec §5: "Persist immutable snapshots and CAS head update. **Version supplied must equal
expected+1.**" Read together with the request shapes, that means two different numbers:

- `expected_version` — the head the client believes is current, i.e. the version it loaded.
- the submitted document's own `version` — that head **plus one**.

Sending the incremented value as `expected_version` would compare against a version that does not
exist yet and should always conflict. `toPolicySubmission` and `feedSubmissionVersions` encode this.

`feed_import` allows `expected_version: 0`, which is the no-feed-installed case; the first feed
document is then `version: 1`. `policy_update` requires `expected_version >= 1`, so a policy always
has a head. **Unconfirmed against a live endpoint — see B12.**

## Time values in forms

A `datetime-local` control yields `2026-10-03T15:00` with no zone, and `Date.parse` reads that as the
viewer's local time — so identical keystrokes mean different instants in different zones. The feed
form accepts it (that is what the control means) and prints the resolved UTC instant beside the
field, which is also what DESIGN's "UTC timestamps labelled" requires. Any test asserting on these
comparisons must use an explicit `Z`, or it passes or fails depending on the runner's timezone.

## Rules the schema itself pins

`docs/contracts/policy.schema.json` fixes two values with `const`, so the generated TypeScript type
makes them unassignable and no form can offer them as a choice:

- `semantic.required` is `const: true` — required assessment cannot be switched off.
- `execution.thinking` is `const: false` — generation runs with thinking disabled.

Keep the runtime guard anyway: a policy document arrives over the network as untrusted data, and the
type only protects code paths that already trust it.

Also fixed: `imports.connector_dataset` and `SourceRequest.dataset` are the constant
`demo_dataset_v1`, so a source form offers no free-text dataset field.

## Request and polling rules

- **Never send `role`, `actor_id` or `organisation_id`.** Unknown request fields are strictly
  rejected. Trusted server records supply identity; `deal_id` narrows scope and cannot grant access.
- One `Idempotency-Key` per user action, reused when retrying **that same action**. Same key with a
  different canonical request hash returns 409.
- Run execution is invoked **once** after creation. Disable double-submit in the UI, but rely on the
  server lease for correctness.
- Poll the server-returned run ID at **1-second intervals while the screen is visible**. Stop on any
  terminal state. No unbounded polling. Every poll re-verifies ownership and must not expose stored
  unapproved generated text.
- Browser abort stops the local request only; it does not prove the server stopped work.
- Upload is multipart with exactly one file. Uploaded metadata cannot declassify. For text PDFs,
  `source_date`, `period`, `unit`, `fact_key` and `basis` are required by business validation even
  though the schema marks them optional. CSV derives them per row.
- No direct raw or excerpt Supabase reads, no signed Storage URLs, no original download control. The
  download path is an authenticated gateway path.

## Supporting shapes

- `Run` — `id`, `kind`, `state`, `stage` (1–40 chars; display the server's string, do not invent).
- `Excerpt` — `id`, `version`, `text` (≤1600), `classification`, `citation`.
- `Citation` — `excerpt_id`, `excerpt_version`, `source_label` (≤120), `source_date`, `period`,
  `locator` (≤80).
- `Review` — `id`, `version`, `candidate_text`, `classification`, `status`, `document_id`. **No
  findings or locator field** — see [02-open-questions.md](02-open-questions.md).
- `Assessment` — `status`, three scores (`0–1` or `null`), `checkpoint_revision`, `windows_planned`,
  `windows_completed`, `coverage_complete`, `text_sha256`, `coverage_ranges`.

## Browser-readable projections after T02

`20261003152115_core_schema.sql` grants `authenticated` SELECT on exactly three tables, each scoped
by `auth.uid()`:

- `memberships` — own row, `active` only
- `deal_memberships` — own rows, within an organisation where the actor has an active membership
- `actor_activity` — own rows

Everything else is revoked from `anon` and `authenticated`. This is a candidate source for the deal
selector and for presentation-only role visibility, **pending Bartosz's confirmation** that reading
it from the browser is intended rather than an API projection. Reading it never authorizes anything.

## Fixture facts and forbidden strings

Accounts ([fixtures](../../docs/demo/fixtures.json)), no public signup, passwords never committed:
`admin@demo.example.invalid` (admin, no deals) · `analyst@demo.example.invalid` (analyst, deal
ASTER) · `employee@demo.example.invalid` (employee, no deals) · `reviewer@demo.example.invalid`
(external, no deals).

| Fixture | Class.     | Deal   | Key fact                                           |
| ------- | ---------- | ------ | -------------------------------------------------- |
| PUB-01  | public     | —      | FY2025 revenue USD 120 million (2026-03-15)        |
| PUB-02  | public     | —      | Public webinar 15 Oct 2026                         |
| INT-01  | internal   | —      | FY2025 revenue USD 125 million, finance (04-02)    |
| INT-02  | internal   | —      | FY2025 revenue USD 122 million, operations (04-04) |
| RES-01  | restricted | ASTER  | FY2026 forecast USD 164 million                    |
| RES-02  | restricted | ASTER  | Bid ceiling USD 640 million                        |
| OTH-01  | restricted | BOREAL | Bid ceiling USD 910 million                        |
| MIX-01  | restricted | ASTER  | Quarantined; pipeline USD 176 million + injection  |
| REV-01  | internal   | —      | Quarantined; ambiguous attendee-list publication   |

**Strings that must never render in a workbench screen, a PDF, or an error message:**
`ASTER-BID-640`, `BOREAL-ONLY-910`, `sk-demo-DO-NOT-EXPORT-ORCHID`, and the values 164, 640, 910,
176 outside an authorized context.

Exposure contrast to honour — S01 analyst sees 120/125/122/164/640 with citations and the FY2025
disagreement; S02 employee sees only public and internal FY2025 plus the conflict, must be told the
requested restricted details are unavailable to the account, and **must not learn that a private bid
exists**. Scope filtering happens before the model, not in the UI.

CSV upload header, exact order: `text,source_date,period,unit,fact_key,basis`.

## Shared UI available

From [src/shared/ui/index.ts](../../src/shared/ui/index.ts): `Badge` (`tone`:
neutral/brand/success/warning/danger), `BarChart`, `Button` (`variant`, `size`, `loading`), `Card`,
`CardHeader`, `EmptyState`, `ErrorState`, `Field`, `Input`, `Select`, `Textarea`, `IconTile`,
`LoadingState`, `Skeleton`, `Notice` (`tone`: info/success/danger), `PageHeader`, `ProgressBar`,
`StatCard`.

**`ErrorState`, `LoadingState` and `BarChart` ship Polish default strings** — always pass explicit
English props until shared is fixed. `StatCard.value` takes a pre-formatted string.

**No primitive exists** for: tabs, dialog/modal, table, file input, checkbox/radio/switch, toast,
stepper/stage list, accordion, pagination, tooltip. Request from Bartosz rather than writing a
private one; feature CSS is rejected by `scripts/check-rules.mjs`.

Use only token-derived classes from `globals.css` — `bg-surface`, `bg-surface-muted`, `bg-bg`,
`text-fg`, `text-muted`, `border-border`, `bg-brand`/`text-on-brand`, `*-danger`, `*-success`,
`*-warning`, `rounded-control`, `rounded-card`, `shadow-card`. No raw hex, no Tailwind palette
colours.

## Required states on every screen

[DESIGN.md](../../DESIGN.md) mandates all of: **empty · loading · error · permission-denied ·
incomplete**. Plus: never communicate status by colour alone; visible keyboard focus; errors
associated with their control; single-column on phones with no horizontal page overflow; respect
reduced motion; UTC timestamps labelled; explicit units and currency; and **"not measured" is not
zero**.
