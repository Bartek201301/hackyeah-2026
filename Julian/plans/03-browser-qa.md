# Workbench browser QA checklist

Builder A's slice of AT16, plus the browser halves of AT03, AT06, AT07, AT09 and AT11. Written
against merged main `c4a15b0`.

**Run this signed in.** `src/proxy.ts` redirects every page except `/login` and `/health` to
`/login` without a session, so an anonymous check proves nothing about these screens. Use the
prepared account handed over in person. **Never type the password into a file, a command, a test, a
screenshot or a commit** — type it into the browser only.

Record for each run: date, commit, browser, viewport, and every check you did **not** perform.
A green `npm run check` is not visual verification.

## Setup

```sh
git pull --ff-only origin main
npm ci
npm run dev          # http://localhost:3000
```

Four separate browser profiles, labelled Admin, Analyst, Employee, Reviewer. Never switch role by
editing anything client-side — log out and sign in as the other account.

## Current state: what can and cannot pass today

Every `/api/v1/*` operation returns 503 `STATE_UNAVAILABLE`, so today the only truthful result for
any data-dependent row is the **fail-closed state**. That is a pass, not a failure: it is what the
product promises when a required service is unavailable.

| View               | Built                   | Testable now                  |
| ------------------ | ----------------------- | ----------------------------- |
| `/workbench` (Ask) | yes                     | layout, validation, 503 state |
| `?view=sources`    | yes                     | layout, validation, 503 state |
| `?view=policy`     | yes                     | layout, 503 state             |
| `?view=review`     | **no** — blocked on B8  | the stated waiting state      |
| `?view=export`     | **no** — blocked on B16 | the stated waiting state      |

## A. Shell and navigation

- [ ] Signing in lands somewhere sensible and the sidebar shows the signed-in role.
- [ ] `/workbench` renders with `Ask` as the heading; the nav shows five links.
- [ ] Each nav link changes the heading and the panel; the active link is visibly distinct **and**
      carries `aria-current="page"` (not colour alone).
- [ ] `/workbench?view=bogus` falls back to Ask rather than erroring.
- [ ] As **Employee** or **Reviewer**, Review and Policy links are hidden — unless `role` is not yet
      passed from the app page (B21), in which case all five show. Either is correct today; note
      which you saw.
- [ ] Browser back and forward move between views.
- [ ] Reload keeps the current view.

## B. Ask (chat) — AT06, AT07

- [ ] Empty submit → "Enter a question before sending." inline, **zero** network requests.
- [ ] Over-long text is capped at 4000 characters; the counter tracks.
- [ ] Ask a question → red **"Service unavailable"** notice: "This gateway operation is not available
      yet.", a trace id, and a **Try again** button.
- [ ] **No** progress card and **no** answer card appear (no run was created).
- [ ] Network: exactly **one** `POST /api/v1/chat` → 503, with an `Idempotency-Key` request header.
- [ ] Click **Try again** → the key is **the same** as the first attempt.
- [ ] Change the question, submit → the key is **different**. _(This is the PR #22 fix; without it
      the second question 409s.)_
- [ ] The notice is announced by assistive tech — it is `role="alert"` for danger states.

Once the chat route lands, add:

- [ ] Progress shows the server's own stage text, never an invented one.
- [ ] No answer text appears until the decision releases it; nothing streams.
- [ ] `BLOCK` shows a safe reason with no hint that restricted material exists.
- [ ] Citations list source label, period, date, locator and excerpt version.
- [ ] Cancel appears only while pending or running, and stops further effects.
- [ ] The trace link opens `/audit?trace=<trace_id>`.
- [ ] S01 as **Analyst**: 120 public, 125 and 122 internal, 164 restricted forecast, 640 bid
      ceiling, each cited, and the FY2025 disagreement stated.
- [ ] S02 as **Employee**, same question: **no** 164, **no** 640, **no** `ASTER-BID-640`, and **no
      hint that a private bid exists**; it says the restricted details are unavailable to this
      account. Compare the two screenshots side by side — this contrast is the demo.
- [ ] Neither answer contains `BOREAL-ONLY-910` or `sk-demo-DO-NOT-EXPORT-ORCHID`.

## C. Sources and import — AT03

- [ ] Accepted formats are stated; the CSV header `text, source_date, period, unit, fact_key, basis`
      is shown.
- [ ] Choosing a `.csv` shows **no** attribution fields.
- [ ] Choosing a `.pdf` reveals Source date, Period, Unit, Fact key and Basis; submitting with any
      one blank shows that field's own error.
- [ ] A `.txt` file is refused with "Only a CSV or a text PDF can be uploaded."
- [ ] Classification must be chosen before submit.
- [ ] Deal is a select; it is disabled and says no assigned deal is available until B21 passes
      `dealIds`.
- [ ] Submitting a valid CSV → 503 fail-closed state; the lists still render their own 503 notices.
- [ ] **No control anywhere downloads an original.** Check every button and link.
- [ ] Changing a field and re-uploading mints a new `Idempotency-Key`.

Once the import route lands, add:

- [ ] Status and classification appear as **two separate badges**; an approved document is not
      labelled public.
- [ ] MIX-01 (S05) yields either a restricted safe candidate or an honest **review** — never a
      silent success, and never the personal, secret or injected content.

## D. Policy and feed — AT09

- [ ] Both panels render; policy shows "What this screen controls" with its 503 notice.
- [ ] **There is no toggle, anywhere, that disables assessment, access checks or budgets.** Semantic
      assessment reads as fixed text, not a control.
- [ ] Feed: adding and removing indicators works; the indicator count tracks.
- [ ] Each time field prints the resolved UTC instant beside it once valid.
- [ ] An expiry in the past is refused with "The expiry must be in the future."
- [ ] A `domain` indicator refuses `not a domain`; the same string is accepted as a `literal`.
- [ ] Two indicators with the same id are refused, naming the earlier row.
- [ ] Action offers only `REVIEW` and `BLOCK` — never `ALLOW`.

## E. Review and export

- [ ] Each shows the named "Waiting on a contract decision" state, naming B8 or B16 respectively.
      Confirm it reads as deliberate, not broken.

## F. Responsive, keyboard, accessibility — AT16, R20

At **375 px** and **1440 px**, on every built view:

- [ ] No horizontal page scroll. No clipped text or buttons.
- [ ] The nav wraps rather than overflowing.
- [ ] Tab order is sensible; every control is reachable; focus is always visibly ringed.
- [ ] Every input has a real label; errors are adjacent to their field.
- [ ] Status is never conveyed by colour alone — a text label always accompanies it.
- [ ] Reduced motion: with the OS setting on, nothing animates distractingly.
- [ ] All workbench copy is English. **Known shell defects (B18, not mine to fix):** the document
      declares `<html lang="pl">`, and `"Ładowanie…"` plus `"Klocki UI"` come from shared and app
      files.
- [ ] Console: no errors or React warnings on any view.

## G. Negative checks

- [ ] As Employee or Reviewer, open `/workbench?view=policy` directly. The screen may render, but
      every call must return a denial — **UI visibility is not authorization**, and this is the
      check that proves it.
- [ ] Sign out in one tab, then act in another → "Signed out" state with a link to `/login`.
- [ ] No page shows a password, token or secret. No screenshot you keep shows one either.

## Reporting

For each view: viewport, steps run, result, and any failure with repro. List not-run checks
separately. Do not claim a workflow works end to end while `/api/v1` returns 503 — say "fail-closed
state verified; live path not yet available".
