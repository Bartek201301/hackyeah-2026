# Interface design contract

Read before building screens. The existing `/ui` page demonstrates shared components, not the completed gateway. UI, documentation, errors and accessibility labels are **English**. Existing Polish starter copy is migrated by T01/T06; it is not the target product language.

## Application

Calm, neutral, light-only system inspired by familiar AI chat products: a white content column, a very light grey sidebar, near-black text, thin light-grey borders, near-black primary buttons with white text, subtle grey hover, small radii and almost no shadows. Typeface is Geist. Colour is reserved for decisions and always sits next to a text label: BLOCK = `danger` (red), ALLOW = `success` (green), REVIEW/withheld = `warning` (amber). `border` is decorative (cards, dividers); `border-strong` is only for form-control outlines. Use existing tokens from shared UI; no feature-private CSS or raw color overrides. The standalone pitch may use its specified black/white/cobalt style.

Token contrast (WCAG 2.x, computed from the oklch values in `globals.css`): `fg` on `surface`/`bg` 17.9/17.2; `muted` on `surface`/`bg`/`surface-muted` 6.0/5.8/5.5; `on-brand` on `brand` 17.9; `fg` on `brand-soft` 16.0; `on-brand` on `danger` 5.4; `danger` on `surface`/`danger-soft` 5.4/4.9; `success` on `surface`/`success-soft` 5.6/5.2; `fg` on `warning-soft` 16.3; `warning` on `surface` 3.2 (non-text only); `border-strong` on `surface` 3.1. Do not use `warning` as text colour.

Use `PageHeader` on each page, `Card`/`CardHeader` for sections, `StatCard` for measured totals, `Badge` for status, `Notice` for errors, `EmptyState`, `LoadingState`/`Skeleton`, and labelled `Field` controls with `Button loading`. Request missing shared primitives from the integrator. Use lucide-react icons with text labels where meaning is not obvious.

## Screens and information

- Login: four prepared accounts, no public signup. Never display passwords on a public page.
- Workbench: question, safe progress stages, checked answer, citations, trace link. No unchecked streaming text.
- Sources/import: configured source, accepted formats, classification/deal, upload progress, outcome and review reference. No direct original download.
- Review: admin-only candidate version, findings, edited extract, audience, reason and approve/reject actions. Display conflict/rescan failure clearly.
- Policy/feed: admin-only validated settings and current versions. No toggle to bypass required Laya or access checks.
- Dashboard: security and resource cards equally visible. Own activity for every account; separate admin organisation view. Distinguish actual, estimated and unknown. No fake zero breaches or estimated invoice.
- Trace: stage, decision, reasons, versions, measured usage/timings and incomplete status; no denied text or raw prompts.
- Export: public-only summary, citations, readiness and authenticated PDF download.

## Interaction and accessibility

Visible keyboard focus, semantic buttons/links, labelled inputs and errors associated with controls. Do not communicate status only by color. Keep English sentences short and actionable. Responsive single-column flow on phones; no horizontal page overflow. Tables can use a labelled local scroll region where necessary. Respect reduced motion. Provide empty/loading/error/permission-denied/incomplete states; “not measured” differs from zero. Use English number/date formatting with explicit currency and units, UTC timestamps labelled or localized with zone.

Browser validation follows the project browser-QA skill. A source review or green build is not visual verification. The pitch's six-slide layout is separately verified at desktop/tablet/phone sizes.
