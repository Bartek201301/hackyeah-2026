# AI Control Gateway — shared agent instructions

Read [docs/README.md](docs/README.md), [PRD](docs/product/requirements.md), the relevant
[architecture](docs/product/architecture.md) section and your assigned
[task](docs/team/implementation-plan.md) before editing. Detailed knowledge is in linked specs,
not earlier chat. Code, active documentation, reports and UI are English.

## Scope and security

- The product is a generic server-side gateway; the fictional company chat is its reference app.
- AI assesses risk; deterministic code and central policy enforce. A prompt is not an access boundary.
- Live Laya is required for the judged demo; provider-neutral interfaces do not make it optional.
- Trusted server records supply identity/roles/deal membership. No caller/model-supplied permissions.
- Every managed data/model/tool/export operation passes through the gateway and durable audit.
- Required semantic, policy, identity, budget or durable-state failure withholds protected operations.
- Private originals stay quarantined; classification is separate from processing status.
- Reserve budgets atomically before calls; unknown timeout usage is not zero. No in-memory-only enforcement.
- Never bypass safeguards for known judge prompts. No secrets/raw protected text in browser bundles or logs.
- Existing code is a starter. Do not claim a feature works without running its relevant checks.

## Ownership and modules

- Integrator: `src/shared/**`, `src/app/**`, `supabase/**`, scripts, dependencies/lockfiles,
  configuration, docs, CI, MCP, deployment and integration tests. Explicit shared-work requests
  authorize that scope as integrator.
- Builder A: `src/features/workbench/**`; B: `src/features/detection/**`; C: `src/features/audit/**`.
- Confirm assigned role/task before code edits. One owner per scope; parallel sessions need separate
  branches/checkouts. Do not switch a branch under another active session or revert others' edits.
- App imports features only via `index.ts`. Features import self/shared, never another feature/app.
  Shared never imports app/features. Integrator injects feature adapters at the app composition boundary.
- Request shared changes through integrator with input/output contract; do not duplicate shared code.
  Breaking contract changes require coordination with all consumers. Builders may run npm ci;
  only integrator changes dependencies/tooling. Do not refactor outside scope.
- Existing `ActionResult<T>` remains for conventional Server Actions; public gateway routes use the
  OpenAPI envelope. Validate all inputs server-side; never expose database exceptions to UI.
- User-scoped queries use createSupabaseServer; privileged gateway repository checks actor/org explicitly.
  Browser Supabase access is limited to auth/safe projections; no direct raw/excerpt retrieval.
- Use shared/ui and tokens, lucide-react, thin routes, explicit client components, loading/empty/error states.
  No feature-private CSS. Read [DESIGN.md](DESIGN.md) for screens.

## Database and deployment

- Local/preview/production share one Supabase project. A branch does not isolate data.
- Only integrator applies migrations or coordinates demo resets. Commit and review migrations first,
  apply before dependent code merges, record result in supabase/APPLIED.md. Never edit applied migrations.
- Use additive changes and synthetic data. Coordinate shared writes; freeze test writes before judges.
- Enable RLS on every new table with explicit operation/role policies; user projections use auth.uid().
  Service credentials stay server-only and do not replace access checks. Never commit .env.local or keys.
- Do not delete existing files without human approval. Archive superseded specifications.

## Verification and Git

1. Work on `codex/<task>` from current origin/main; preserve an existing assigned branch.
2. Fetch then merge origin/main on your branch after saving changes. No shared rebase or force push.
3. Format only owned changed files: `npm run format -- <files>`.
4. Before a small commit run `npm run check:fast`; after significant edits/before PR run `npm run check`
   (includes build). Run task acceptance tests; build does not prove DB/RLS/model or demo behavior.
5. Commit verified changes as `type(scope): description`, without Co-Authored-By.
6. PR to main lists owner/scope/shared changes/evidence/preview; progress belongs in PR, not PRD.
   Unfinished work stays draft. No direct main push. Integrator merges one PR at a time with merge commit,
   green team-check and peer approval; integrator PR needs another person's review.
7. After each merge, next PR updates main and reruns checks. Regression: reviewed revert of exact merge
   SHA (`git revert -m 1 <SHA>`), never blind HEAD; database repair needs an additive migration plan.

If stuck after two attempts at the same issue, stop that path, explain the blocker and alternatives,
then continue independent authorised work. Do not weaken checks. State not-run gates explicitly.

## Relevant skills and evidence

Use hackyeah-db-review for SQL/RLS/contracts, hackyeah-security-review for access/validation/integrations,
and hackyeah-browser-qa for UI/demo checks. Sources are `.agents/skills/`; Claude wrappers point there.
Their examples do not change ownership/contracts or authorize migrations, installations or delegation.
English reporting here supersedes legacy language in historical support material. See docs/ai/ecc/README.md.

Done requires green checks/CI, acceptance evidence, peer review, preview workflow and production rehearsal.
No automatic schema/test skips or fabricated performance/savings claims.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
