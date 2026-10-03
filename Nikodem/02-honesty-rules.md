# 02 — Honesty rules for the audit feature

These are the rules that decide whether T08 passes. Each has a source. A dashboard that looks complete
but breaks one of these is worse than an empty one, because it misreports security.

## 1. Label classes

Six classes, six distinct renderings. Never collapse them.

| Class                | Meaning                                                                  | Screen rendering                     |
| -------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| **M** Measured       | settled, provider-reported or persisted value                            | the number, plain                    |
| **E** Estimated      | formula-derived from estimates (tokenizer estimates, rate versions)      | number + `estimated` marker          |
| **R** Reserved       | `reserved_generation_tokens`, `unresolved_reservation` — held, not spent | separate column, warning tone        |
| **U** Unknown        | the record exists and the field is `null`                                | `Not measured`                       |
| **NM** Not measured  | no record at all for the selected scope/day                              | `Not measured` + empty-state caption |
| **NP** Not permitted | the actor's role does not allow this scope                               | `Not available to your account`      |

`null` is never rendered as `0`. `docs/demo/scenarios.md` "Dashboard proof": _Empty/unmeasured values
say "Not measured", not zero._ `DESIGN.md`: _"not measured" differs from zero_.

The one legitimate zero: `usage.semantic_ms` and `usage.reserved_generation_tokens` are non-nullable
integers, so `0` there is a real measurement and is displayed as `0`.

**`reserved_generation_tokens` is class R twice over, with two different meanings, and the caption must
say which.** On one operation it is what that run reserved, and the record keeps it after the
reservation settles. On a window (`metrics_read`) it is what is still outstanding, summed from the
reservations table. Live data has both at once: a settled run recording `2200` inside a day whose
dashboard reports `0`. Neither number is wrong, so "held, not spent" is true only of the window form —
a caption claiming a retention on the operation form describes something that already ended. The view
takes the meaning (`usageView(usage, "operation" | "window")`) and the caption follows it.

## 2. Envelope reading

- HTTP 200 alone is not approval. Read `decision` and `error` on every call
  (`docs/contracts/protocols.md:11-19`).
- `decision: null` with a 503 means the gateway could not complete the check — render _the trace record
  may be unavailable_, never _nothing happened_ (`docs/product/technical-spec.md:100`,
  `docs/demo/runbook.md:42`).
- Envelope `usage`/`timings` belong to the audit read, not to the audited run — see
  [01 §0](01-field-map.md).

## 3. Counters that must never be combined

`blocked_attempts`, `stopped_loops`, `review_cases`, `confirmed_test_failures` are four separate
counters (`docs/product/technical-spec.md:85`).

- A blocked attempt is **not** a breach prevented. Forbidden words on screen: _breach prevented_,
  _attack stopped_, _saved_, _prevented_.
- `confirmed_test_failures: null` is **Unknown**, not _0 breaches_.
- `root_requests` never includes tool subcalls; subcalls are expandable detail
  (`docs/contracts/data-model.md:58`, `docs/demo/scenarios.md` "Dashboard proof").

## 4. Resources and money

- Generation usage and Laya usage/latency stay in separate cards; they are never summed
  (`docs/product/technical-spec.md:75`).
- Reserved and unresolved amounts sit beside actual, never inside it. A timeout does not prove zero
  consumption.
- Money is always labelled **`Illustrative commercial equivalent; not an invoice`** and always shows
  `comparison_rate_version` (`docs/product/technical-spec.md:82`).
- Laya overhead is displayed separately, and the screen never implies a zero total operating cost
  (same line).
- `estimated_avoided_input_micro_usd` covers input only. No speculative output savings, no
  blocked-call savings (`docs/product/technical-spec.md:84`).
- `context_reduction_percent === null` renders **`N/A`**, never `0%`; the figure is labelled estimated
  and carries its `context_trace_id` (`docs/product/technical-spec.md:83`,
  `docs/contracts/protocols.md:120`).
- The UI formats server numbers. It does not compute money or reduction.
- Displayed totals must equal the persisted usage for the selected traces
  (`docs/testing/acceptance.md:63`). Organisation totals come from `/metrics`, never from one page of
  `/audit` (`docs/contracts/protocols.md:120`).

## 5. What must never reach the screen

`docs/product/architecture.md:37` — _structured safe reason codes and metrics; no prompts, secret
values, raw text or denied document titles in personal traces._

- No prompt text, no model output, no excerpt text, no chain-of-thought
  (`docs/product/technical-spec.md:100`).
- No document titles or source labels in a denied-operation projection
  (`docs/contracts/data-model.md:58`).
- A `Finding` has no value field; the UI never reconstructs one from `locator`.
- No credentials, tokens or account passwords anywhere, including screenshots
  (`docs/testing/acceptance.md`, release gate).
- Errors never reveal whether an inaccessible resource exists — a 404 renders the same for
  "absent" and "not yours" (`docs/contracts/protocols.md:7`).

## 6. Caps always carry a narrowing instruction

Silent truncation is a reporting failure (`docs/contracts/protocols.md:120`).

| Cap                    | Limit | Screen requirement                                                                   |
| ---------------------- | ----- | ------------------------------------------------------------------------------------ |
| `/audit` page          | 100   | explicit `Showing the 100 most recent` plus a way to page further                    |
| `events[]` per trace   | 200   | the server's narrowing instruction is shown; never render a partial list as complete |
| `/audit/export` rows   | 1000  | the server's narrowing instruction is shown instead of a partial file                |
| `reasons[]`            | 20    | `+N more` disclosed, never dropped                                                   |
| `findings[]` per event | 20    | same                                                                                 |

## 7. Scope and permission

- Default scope is `own`; `organisation` requires admin (`docs/contracts/protocols.md:120`,
  `docs/product/requirements.md:32-33`).
- Showing or hiding a control is presentation, never authorisation. The server decides; the UI renders
  the refusal (`AGENTS.md`, `DESIGN.md`).
- Every role has a personal dashboard; only admin has organisation reporting and export.
- Range is one UTC day in v1; a wider request is an `INVALID_INPUT` to surface, not to clamp silently.

## 8. Evidence discipline

- Fixtures are development-only and never appear in the judged runtime
  (`docs/team/developer-handoffs.md`, G1 paragraph).
- Replayed evidence is announced as replayed; live progress is never simulated
  (`docs/demo/runbook.md:27`).
- No measurement is reported that was not measured: no latency promise, no savings percentage without
  the formula and its inputs (`docs/product/requirements.md:78`,
  `docs/testing/acceptance.md` performance protocol).
- No WCAG conformance claim from automated tooling alone (`hackyeah-browser-qa`).

## 9. Self-review checklist for every audit PR

Paste into the PR body and tick honestly.

- [ ] Every number on screen traces to a contract field in [01](01-field-map.md); none is computed from
      another displayed number.
- [ ] No `null` renders as `0`; `Not measured`, `Unknown` and `N/A` are each used correctly.
- [ ] Generation and Laya usage are visually separate; reserved/unresolved is its own signal.
- [ ] A reserved figure says whether it is one operation's reservation or a window's outstanding
      total, and claims a retention only when `unresolved_reservation` is true.
- [ ] Every money figure carries the illustrative disclaimer and the rate version.
- [ ] `blocked_attempts` wording contains no breach/prevention claim.
- [ ] Root request count excludes subcalls.
- [ ] No prompt, excerpt, document title, secret or raw text appears in any rendered state or screenshot.
- [ ] Every cap shows its narrowing instruction.
- [ ] `decision` and `error` are read before rendering on every call; 403/404/503 have real states.
- [ ] Organisation figures come from `/metrics`; no client-side aggregation of a paginated page.
- [ ] Fixtures are confined to tests; the running app shows only server data.
- [ ] Checks actually run are listed, and checks not run are named as not run.
