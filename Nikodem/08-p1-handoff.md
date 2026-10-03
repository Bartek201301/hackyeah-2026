# 08 — P1 delivered: minimal safe trace detail

Phase P1 of [07-build-order.md](07-build-order.md), built after the G1 merge (`f04054b`). Branch
`codex/audit-trace-view`.

## What exists now

| File                                          | Role                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/features/audit/copy.ts`                  | every English string, taken from [03 §2](03-state-matrix.md)                 |
| `src/features/audit/format.ts`                | value formatting; grouping is implemented locally, not via `toLocaleString`  |
| `src/features/audit/envelope.ts`              | HTTP status + body → exactly one screen state; audit payload shape validated |
| `src/features/audit/trace.ts`                 | view model: decision badge, three usage groups, stages, assessment, findings |
| `src/features/audit/test-support.ts`          | synthetic builders used only by the tests                                    |
| `src/features/audit/components/AuditPage.tsx` | the route: `?trace=<uuid>` selects the trace detail                          |
| `components/TraceDetail.tsx`                  | client component; reads `GET /audit/{id}` through `createGatewayClient()`    |
| `components/TraceSummary.tsx`                 | identity, decision, reason codes, trace-level resource use                   |
| `components/StageList.tsx`                    | stages in stored order with findings, assessment and per-stage use           |
| `components/UsageGroups.tsx`                  | the actual / reserved / unknown grouping                                     |
| `components/TraceStates.tsx`                  | one block per refused or failed read                                         |

Three test files hold 44 assertions: `format.test.ts`, `envelope.test.ts`, `trace.test.ts`.

## Decisions taken, and why

**The number logic lives outside the components.** `vitest.config.mts` collects only
`src/**/*.test.ts` in a Node environment, so a component is unreachable by the runner. Every formula,
`null` rule and state mapping therefore sits in a pure module that the components only call. This was
forced by the runner, and it is also the right shape — see [06](06-integrator-requests.md) item 16.

**`notFound`, `denied` and `invalidInput` render the same words on this screen.** A distinct "not
yours" message would confirm that the identifier exists. The states stay separate in the model because
the dashboards in P2/P3 must tell them apart.

**A rate-limited read gets no retry button.** Offering one there is how a client builds a loop against
its own gateway.

**A malformed identifier is answered locally.** `isUuid` guards the request, so a crafted path is never
forwarded to the gateway.

**The envelope root is never rendered.** `readProjections` returns `null` for a body without
`data.items`, which is deliberately different from an empty list; the audited trace is only ever
`data.items[0]`.

**Both client branches are read.** `openapi-fetch` puts a governed refusal in `result.error`, not
`result.data`, so the screen reads `data ?? error`. Reading only `data` would have dropped every
`decision` and reason code — the whole point of the view.

## Evidence

| Check                                   | Result                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npx vitest run src/features/audit`     | 44 passed                                                                                      |
| `npx vitest run`                        | 58 passed (5 files, including the shared contract tests)                                       |
| `npx tsc --noEmit` after `next typegen` | 0 errors                                                                                       |
| `npx eslint src/features/audit`         | 0 problems                                                                                     |
| `npx prettier --check .`                | clean                                                                                          |
| `node scripts/check-rules.mjs`          | `✅ struktura OK`                                                                              |
| `npx next build`                        | success; `/audit` listed as a dynamic route                                                    |
| Live call to the built app              | `GET /api/v1/audit/{uuid}` → 503 `STATE_UNAVAILABLE`, rendered as the state-unavailable screen |

The live 503 body is kept verbatim in `envelope.test.ts` (`describe("the gateway as it answers today")`),
so the current behaviour is asserted rather than assumed.

**Not verified.** No browser pass: there is no DOM or e2e runner, so the states were not walked in a
page, no screenshots exist, and the keyboard and 375 px / 1440 px checks of P6 are outstanding. No real
audit data exists either, because `/api/v1/**` is still the unavailable seam until G2.

## Two findings for the integrator

1. **The route-level loading boundary is in Polish.** `src/app/loading.tsx` renders `<LoadingState />`
   with its default label, so `Ładowanie…` appears in the payload for `/audit` even though this feature
   passes `Loading audit records…` explicitly. Integrator-owned file; adds weight to
   [06](06-integrator-requests.md) item 12.
2. **Gateway overhead per trace is still unreachable.** The screen states
   `Gateway overhead breakdown is not exposed by this endpoint.` and estimates nothing. Item 3 stands.

## Handoff message

```text
Handoff: T08 P1 — minimal safe trace detail
Ready commit/PR: see branch codex/audit-trace-view
Public exports or routes: src/features/audit/index.ts (meta + default page), mounted at /audit;
  the trace is selected with ?trace=<trace_id>
Inputs/outputs: GET /api/v1/audit/{id} through createGatewayClient(); ApiResponse envelope read from
  both the data and the error branch
Checks actually run: vitest 44 (feature) / 58 (all), tsc 0, eslint 0, prettier clean, check:rules OK,
  next build OK, live call to /api/v1/audit/{id} → 503 STATE_UNAVAILABLE
Real services used / fixtures used: real gateway seam only; no fixture reaches the runtime
Still unavailable: audit endpoints (G2), DOM/e2e runner, real audit data, gateway overhead timings
Unblocks: a chat answer can link to /audit?trace=<id> and reach a real view
```
