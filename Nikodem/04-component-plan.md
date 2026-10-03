# 04 — Component plan: what the shared blocks can express, and what is missing

Rule from `src/shared/ui/index.ts:5`: features build screens **only** from the shared blocks plus token
classes; a missing block is requested from the integrator, never written locally. No feature-private CSS
(`scripts/check-rules.mjs` rejects `.css` under `src/features/`).

## 1. Available blocks

`PageHeader(title, description, actions)` · `Card(variant)` / `CardHeader(title, description, actions)` ·
`StatCard(icon, label, value: string, hint?, change?, trend?, highlight?)` · `Badge(tone)` ·
`BarChart(data[{label,value,compare?}], valueLabel?, compareLabel?, height?)` ·
`ProgressBar(value, label?, valueLabel?, tone?)` · `Notice(tone)` · `EmptyState(title, description, action, icon)` ·
`ErrorState(title?, description?, action?)` · `LoadingState(label?)` / `Skeleton(className)` ·
`IconTile(icon, tone)` · `Field` / `Input` / `Select` / `Textarea` · `Button(loading)`.

Layout recipes to imitate rather than reinvent:

- Dashboard: `src/app/ui/page.tsx:43-127` — `grid gap-6 xl:grid-cols-[2fr_1fr]`, a `sm:grid-cols-2`
  `StatCard` grid with exactly one `highlight`, `Card` + `CardHeader` + `BarChart`, a `ProgressBar` group.
- List row: `src/app/ui/page.tsx:108-123` — `<ul className="flex flex-col gap-4">` with
  `<li className="flex items-center gap-3">`, `IconTile`, a `min-w-0 flex-1` truncating text column, a
  trailing `Badge`.
- Divider list: `src/features/example/components/ExamplePage.tsx:23` —
  `<Card className="flex flex-col divide-y divide-border p-0">` with `px-5 py-3` rows.
- Feature shape: `index.ts` exports `meta` and the default page; `meta.ts` is `{slug, title, description}`;
  `queries.ts` starts with `import "server-only"`; `actions.ts` is `"use server"` returning
  `ActionResult<T>`; the route file is one line, `export { default } from "@/features/audit";`.

## 2. View composition

### View C/D — dashboards

```
PageHeader "Activity and usage"            actions: [Select scope] [Select UTC day] [Button export]
Notice (only when degraded: 503 / stale / denied scope)
grid xl:grid-cols-[2fr_1fr]
├── left
│   ├── Card "Security decisions"   → sm:grid-cols-2 StatCards: root requests (highlight),
│   │                                  blocked attempts, stopped loops, review cases,
│   │                                  confirmed test failures
│   └── Card "Recent activity"      → list-row pattern, one row per AuditProjection, Badge = decision
└── right
    ├── Card "Resource use — generation"  → StatCards: input, output, duration;
    │                                       ProgressBar "Reserved vs actual" (no implied total budget)
    ├── Card "Resource use — Laya"        → StatCards: semantic input tokens, semantic duration
    ├── Card "Context reduction"          → BarChart permitted vs selected + percent or N/A + source trace link
    └── Card "Illustrative cost"          → StatCard + disclaimer + rate version
```

Equal visibility is satisfied by giving controls and resources the same card weight and by keeping the
single `highlight` on a neutral counter (root requests), not on money.

### View A/B — trace list and detail

```
PageHeader "Trace detail"                 actions: [Button back to activity]
Card "Summary"      → decision Badge, state Badge, operation, UTC time, policy/feed versions, reason codes
Card "Usage"        → three labelled columns: Actual | Reserved | Unknown  (see 01 §4)
                      + Notice "Gateway overhead breakdown is not exposed by this endpoint."
Card "Stages"       → divider list, one row per event:
                      stage · event_type · UTC time · versions · Badge per finding severity
                      each row expandable → findings table-ish list, Assessment block, stage usage
Card "Assessment"   → status Badge, three scores, checkpoint revision, windows completed/planned,
                      coverage_complete warning, truncated text hash
```

## 3. Gaps, with a fallback for each

| Need                                | Closest block                                                                                                                                   | Fallback that needs nothing new                                                                          | Ask integrator?                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Tabular trace list with headers     | none — no `<table>`, `<thead>`, `<dl>` or `role="table"` exists anywhere in `src/`                                                              | list-row + divider-list pattern with a labelled local scroll region (`DESIGN.md` permits this)           | yes, non-blocking                    |
| Key/value detail list               | none                                                                                                                                            | `divide-y` rows with a `text-muted` label column                                                         | yes, non-blocking                    |
| Stage timeline                      | none                                                                                                                                            | divider list ordered by `created_at`, elapsed caption per row                                            | no                                   |
| Expandable subcalls                 | none                                                                                                                                            | native `<details>`/`<summary>` styled with tokens, or a `Button` toggling state with `aria-expanded`     | no                                   |
| English number formatting in charts | `BarChart` hardcodes `toLocaleString("pl-PL")` at `src/shared/ui/BarChart.tsx:28`, with no formatting prop                                      | avoid `BarChart` for any number a judge reads; use `ProgressBar` with a `valueLabel` the feature formats | **yes, blocking for the chart**      |
| English loading/error copy          | `LoadingState` default `"Ładowanie…"` (`src/shared/ui/LoadingState.tsx:5`), `ErrorState` defaults Polish (`src/shared/ui/ErrorState.tsx:14-15`) | always pass explicit English `label`/`title`/`description`                                               | no — but T01 should fix the defaults |
| `Not measured` in a stat tile       | `StatCard.value` is a pre-formatted `string`, no unknown variant                                                                                | the feature produces the string `Not measured`, consistently                                             | no                                   |
| Scope and day controls              | `Field` + `Select` exist                                                                                                                        | `Select` for scope, `Input type="date"` for the UTC day                                                  | no                                   |
| Download control                    | `Button loading` exists                                                                                                                         | anchor-styled `Button`, or a server action returning bytes — delivery mechanism is `06` item 5           | yes, blocking                        |

Decision: the trace list ships as the list-row/divider pattern. A real table is requested as a
non-blocking improvement, so a refusal costs nothing.

## 4. Routes and entry points

`npm run new-feature audit` is run by the **integrator** (`scripts/new-feature.mjs:1`) and generates
`src/features/audit/{index,meta,queries,actions,types}.ts`,
`src/features/audit/components/{AuditPage,AuditForm}.tsx`, `src/app/audit/page.tsx`, and inserts the
`nav.ts` import and entry at its markers. It creates exactly **one** page.

T08 needs more than one view, so the route shape is an integrator decision (`06` item 1):

- option A — a second route `src/app/audit/[traceId]/page.tsx` plus an organisation route;
- option B — one route with a search parameter (`?trace=`, `?scope=`) and the feature switching views.

Option B needs no new app routes and is the default assumption until Bartosz answers. Either way the
feature exposes its views through `src/features/audit/index.ts`; `src/app/**` stays integrator-owned.

## 5. Accessibility and responsiveness commitments

From `DESIGN.md` and `hackyeah-browser-qa`:

- single-column flow at ~375 px with no horizontal page overflow; tables/wide rows use a labelled local
  scroll region.
- visible keyboard focus; semantic `button`/`a`; every control labelled; errors associated with controls.
- status never by colour alone — each `Badge` carries text.
- `aria-expanded` on stage toggles, accessible names such as `Open trace 3f2a…b41c`.
- reduced motion respected; no animation needed in this feature.
- empty, loading, error, permission-denied and incomplete states all implemented, with
  `Not measured` distinct from `0`.
