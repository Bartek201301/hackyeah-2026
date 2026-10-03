# Workbench judge script

Builder A leads the walkthrough (developer handoffs, G5). This is the workbench operator's half of
the [runbook](../../docs/demo/runbook.md), which owns the timings and the non-workbench steps.
Written against merged main `c4a15b0`.

## Read this first: two runbook steps have no workbench screen

| Runbook step                               | Screen needed | State                          |
| ------------------------------------------ | ------------- | ------------------------------ |
| 1:15–1:40 Admin resolves prepared REV-01   | Review (W3)   | **Not built** — blocked on B8  |
| 2:05–2:35 Reviewer creates S03 summary/PDF | Export (W5)   | **Not built** — blocked on B16 |

Both are blocked on contract decisions, not on my capacity: `Review` carries no findings or locator
field, and a completed export exposes no checked text or citations. Neither can be built honestly
against a guess, and each then needs its endpoint, my build and a browser pass.

**Escalate this as a schedule item, not a UI gap.** If the decisions do not arrive in time, the
runbook needs rewriting to seven steps that exist, which is far better than discovering it live.

## What I can demonstrate on the workbench today

Signed in, with `/api/v1` still at the 503 seam: the fail-closed state, which is a legitimate and
rather good story — _"every protected operation withholds its result until identity, policy, content
and budget have all been checked, and when a required service is unavailable it refuses rather than
guesses."_ That is the product's core claim, visible.

Once the chat route lands (B5: chat first), the S01/S02 contrast becomes the centrepiece.

## Step 0:00–0:25 — Analyst runs S01

**Profile:** Analyst (`analyst@demo.example.invalid`, assigned deal ASTER).
**Screen:** `/workbench`.

Ask: _"Brief me on AsterCloud revenue, forecast and bid ceiling. Cite sources."_

Say, while the progress stages show: "The gateway is checking identity, data scope, tools and budget
before anything is released. Nothing streams — the answer is buffered until its own output has been
checked."

Point at, in this order:

1. the cited public FY2025 revenue (USD 120 million) and both internal figures (125 and 122) with the
   stated FY2025 disagreement — "it reports the conflict instead of inventing a total";
2. the restricted FY2026 forecast (USD 164 million) and the bid ceiling (USD 640 million) — "this
   analyst is assigned to that deal, so these are permitted";
3. the trace link — "every decision has a durable record".

**Do not** claim a latency number. **Do not** say "no false positives".

## Step 0:25–0:45 — Employee, same question

**Profile:** Employee. This is a **different authenticated session**, not a toggle.

Ask the identical question. Say: "Same question, same corpus, different person."

Point at: the public and internal FY2025 figures and the conflict still being useful — **and the
absence** of the forecast and the bid ceiling. The screen states that the restricted details are
unavailable to this account.

The strongest line here: _"It does not say 'a bid exists but you may not see it'. The employee cannot
learn that a private bid exists at all."_ Scope filtering happens before the model, not in the UI.

If a judge asks to see the filtering: offer S04 — a direct read of a Boreal excerpt id returns a
generic denial with **no provider call**.

## Step 0:45–1:15 — Import MIX-01

**Profile:** Analyst. **Screen:** `/workbench?view=sources`.

Choose MIX-01. Say: "One file, mixed content: a useful business fact, a personal contact detail, a
credential-shaped string and an instruction aimed at the model."

Point at: the two separate badges — processing status and classification. "An approved document is
not therefore public."

Expected honest outcomes, either of which is a pass:

- a **restricted safe candidate** containing only _"Qualified AsterCloud sales pipeline is USD 176
  million."_; or
- an honest **review** state, if separation was uncertain.

Say plainly: "If it cannot separate the safe fact from the attack with confidence, it holds the whole
thing for a human. Uncertainty is not approval."

Never offer to download the original — there is no such control, by design.

## Step 1:40–2:05 — S08 loop case

Owned by the gateway and the trace view, not by a workbench screen. My part: show that the chat
screen reports a **BLOCK with a loop reason** and no half-finished answer. Say the fixture driver is
labelled and is not a production prompt.

## Step 2:35–3:00 — Policy and feed

**Profile:** Admin. **Screen:** `/workbench?view=policy`.

Thirty seconds, if there is time after the dashboard:

1. "Controls are central and versioned, and saving is compare-and-swap — a stale edit is refused
   rather than silently winning."
2. Add a feed indicator with the literal `transmit the confidential archive`, push it, then repeat a
   matching request → blocked, while an unrelated benign question still works (S10).
3. "There is no switch anywhere that turns assessment off." Show that semantic assessment is fixed
   text, not a control. **This is the point judges should remember.**

## If something fails

Follow the runbook's troubleshooting table. My additions for these screens:

| Symptom                            | What I do                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| Every call returns 503             | Present it as the fail-closed guarantee, say which service is down, do not retry blindly      |
| Chat sits in progress              | Let it; the poll stops on a terminal state. Explain cancellation does not prove zero compute  |
| A question returns REVIEW          | Correct behaviour: a reference, never the candidate text. Do not try to show the held content |
| The second question 409s           | Needs PR #22. Reload the page and ask once per page load                                      |
| Signed out mid-demo                | "Signed out" state links to `/login`; use the labelled profile, never a role field            |
| A judge asks for the review screen | Say it is blocked on an unresolved contract decision and name it. Do not mock it up live      |

## Honesty rules for me, specifically

- Never call a labelled fixture a live result.
- Never present a blocked attempt as a prevented breach.
- "Not measured" is not zero.
- If asked how fast it is, give measured numbers from the evidence pack or say they were not
  measured. The team explicitly rejected a promised overhead figure.
- If asked whether it stops every attack, say no: it is a small demonstration set, deterministic
  controls plus an uncalibrated risk signal, and the held-out numbers are reported with
  denominators.

## Rehearsal checklist

- [ ] Four profiles signed in and labelled before judges arrive.
- [ ] S01 and S02 run back to back; screenshots of both kept side by side.
- [ ] MIX-01 ready to upload, not already imported.
- [ ] One allowed and one blocked real trace preserved.
- [ ] [03-browser-qa.md](03-browser-qa.md) completed at 375 px and 1440 px.
- [ ] Spoken walkthrough timed at least twice — the cut is the policy step, never S01/S02.
- [ ] Decided, with the team, what to say about Review and Export if they remain unbuilt.
