---
name: hackathon-readme
description: "Write or refresh the hackathon submission README and the submission-form description, grounded in the repository rather than in chat. Use before a hackathon submission deadline, or when the README overstates or understates what actually ships."
---

# Hackathon submission README

## Check this first

The event's own submission spec overrides everything below. Before writing, establish from the task
brief or submission panel what is actually required and scored: repository, form fields and their
character limits, demo video length, deck, deadline. If the user has that brief, read it. If the
README is not a required artifact, say so and ask whether to write it anyway as backup for technical
jurors, rather than assuming.

At most in-person hackathons the README is the second artifact a juror meets, after the pitch. It
earns its place by surviving scrutiny the pitch cannot: a juror who opens the repo is checking
whether the demo was real. Write it for that moment.

## The reader you are writing for

A judge with roughly three minutes, thirty other projects queued behind yours, no context on the
team, and a scoring rubric in front of them. They are not a user and not a future maintainer. They
are deciding whether this is real.

That reader changes everything. A normal project README optimises for someone who already decided to
use the software. This one optimises for someone deciding whether to believe it. Write for belief,
verified in minutes.

## What a finished README has to achieve

Judge these outcomes, not the presence of sections:

- **Thirty second comprehension.** After the first screenful the judge can say what the project does,
  who it is for, and which challenge it answers, without scrolling.
- **Proof before claims.** Something runnable or watchable (demo video, hosted link, screenshot of
  real output) appears above the fold. A judge who stops reading there has still seen the product.
- **A clean-machine start path.** Someone who has never seen the repo gets it running with
  copy-pasteable commands. Every command has actually been run by you.
- **Honest scope.** What works, what is partial, what is faked for the demo, stated by the team
  rather than discovered by the judge mid-demo. Overclaiming is the single most expensive mistake in
  hackathon judging; a judge who catches one inflated claim discounts all the others.
- **Explicit challenge mapping.** Each requirement of the task maps to where it is implemented, with
  file paths. This is the section that converts a good build into a good score, and it is the one
  teams skip.
- **Defensible technical choices.** Two or three decisions with the reasoning and the tradeoff
  accepted. Judges probe design rationale in Q&A; the README should pre-load the answers.

## Ground yourself in the repo first

Do not write a single line from the conversation alone. The gap between what a team believes it
shipped at hour 22 and what is actually in the tree is wide, and the README is where that gap becomes
visible to a judge.

Before drafting, establish from the repository itself:

- What actually exists: directory structure, entrypoints, services, how many of them there are and
  how they talk to each other.
- What actually runs: package manifests, lockfiles, Dockerfiles, compose files, scripts, Makefile
  targets, CI config.
- What the real setup surface is: required environment variables, external services, API keys, seed
  data, migrations, ports.
- What is stubbed: hardcoded responses, mocked clients, TODO markers, commented-out calls, fixtures
  standing in for live data.
- What the team actually built during the event: the commit history tells you, and it tells the judge
  too if they look.

Then run the setup path yourself, from the state a fresh clone would be in. A quickstart that fails on
the judge's machine is worse than no quickstart, because it converts uncertainty into a demonstrated
negative.

Timebox this. You are working against a submission deadline, and fixing the build is not your job. If
the setup path fails after one honest attempt, stop, write the quickstart as the commands that are
known to work, mark the failing step in the status table, and tell the user exactly what broke so a
human can decide whether to fix it or document around it. Never silently rabbit-hole into debugging,
and never publish an unverified quickstart as though it were verified.

## Anti-hallucination rules

These are hard constraints, not preferences.

- Every feature claim must be traceable to code you have read. If you cannot point to the file, the
  claim does not go in.
- Every command must have been executed or read verbatim from a script. Never infer a command from
  convention.
- Every dependency, version, and port must come from a manifest or config file, not from what is
  typical for that stack.
- Never invent benchmarks, latency numbers, accuracy figures, user counts, or cost savings. If the
  team has a real measurement, cite how it was produced. If not, leave the number out entirely rather
  than estimating.
- Never invent links. Demo video, deployment, Devpost or submission page, Figma, docs: if the URL is
  not in hand, leave a clearly marked placeholder and tell the user which links are missing, as a
  list, so they can fill them before submitting.
- Architecture diagrams describe the system as built, not as designed. If the queue was cut at 3am, it
  is not in the diagram.
- When something is ambiguous and the answer materially changes the README, ask. Under deadline, ask
  all questions in one batch rather than one at a time, and explain what each answer changes rather
  than offering bare options.

## What each section has to prove

Use these as obligations, not as a template to fill. Order and naming can adapt to the project, but
every obligation below must be met somewhere.

**Opening block.** Name, one sentence that a non-specialist judge understands, the challenge or track
it answers, the team, and the links that matter (demo video, live instance, deck). One screenful, no
preamble.

**The problem.** Who hurts, how badly, and what they do today instead. Concrete and specific beats
broad and important. Two or three sentences.

**What was built.** The actual solution, in terms of what it does for that person. Lead with the
capability that would be hardest to fake.

**Proof.** Demo video link with a runtime, screenshots or a short GIF of real output, and a hosted
link if one exists. Captioned so the judge knows what they are looking at.

Choose the proof artifact that would be hardest to fake for this category of project, and lead with
it. A consumer app proves itself with a recording of the real flow. A data product proves itself with
output on real input, not seeded fixtures. A security, policy or control-plane product proves itself
with adversarial test results: the attacks attempted, which were blocked, which got through, and the
command that reproduces the run. For that category, add a table mapping threat to control to the file
that enforces it, because a juror evaluating a safety claim is asking what it stops, not what it does.
Pasted terminal output of a passing suite outranks any screenshot of a dashboard.

**Status.** A table of feature against state: working, partial, mocked, planned. This section buys
credibility for everything above it. Be specific about what mocked means in each case.

**Quickstart.** Prerequisites with versions, clone, install, environment variables with an example
file, run, and the URL or command that proves it worked. Include the expected output of the last step
so the judge can tell success from silence.

**Architecture.** How the pieces fit, why they are separate, where the interesting engineering is. A
diagram in Mermaid or ASCII if the system has more than two moving parts. Point at the files that
implement each piece.

**Challenge mapping.** Each stated requirement of the task, the approach taken, and the path to the
implementation. A table works well here.

**Decisions and tradeoffs.** Two or three real ones, each with what was chosen, what was given up,
and why that was right for a 24 hour build.

**What is next.** What the team would build with a week. Short, concrete, and consistent with the
status table.

**Team.** Names, roles, and links.

Cut anything else. Licence, contribution guidelines, extensive API references, and badges for their
own sake cost the judge attention and return nothing.

## The second deliverable

The submission form almost always wants a project description in a single box, often with a character
limit, and that text is what jurors read during first-pass filtering before anyone opens a repo.
Produce it in the same pass as the README, as a separate block the user can paste: problem, what it
does, what is proven to work, why it answers the task. Ask for the limit if it is not known, and write
to it exactly rather than trimming afterwards. Do not just truncate the README opening; the form text
has to stand alone without links or headings.

## Style

- Plain declarative sentences. No marketing register, no superlatives, no "revolutionary" or
  "seamless" or "cutting edge". Judges read dozens of these and the inflated ones blur together.
- Never use dashes as punctuation in prose. Restructure the sentence, or use a comma, colon, or full
  stop.
- Front-load every section. The first sentence carries the point.
- Prefer a table over a paragraph wherever the content is parallel.
- Code blocks are copy-pasteable, with no leading prompt characters and no placeholder that silently
  fails.
- Match the language of the event and the jury. For a Polish event with an international jury, English
  unless the user says otherwise.
- Keep the whole document scannable in three minutes. Depth goes in linked files, not in the README
  body.

## Before handing it back

Verify, do not assume:

- Follow the quickstart from a clean state and confirm it ends where the README says.
- Confirm every internal path referenced exists.
- Confirm every external link resolves, or is flagged as a placeholder to the user.
- Reread the status table against the feature claims above it and reconcile any contradiction in
  favour of the more modest statement.
- Check that the challenge mapping covers every requirement of the task, including the ones the team
  only partly addressed. A requirement answered honestly with "partial, see X" scores better than one
  left out.
- Then tell the user, briefly, what is still missing and what you could not verify.
