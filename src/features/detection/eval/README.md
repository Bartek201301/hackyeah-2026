# T04 synthetic semantic evaluation

This runner measures the pinned Laya and Qwen adapters on synthetic cases. It sends no requests to
the app or database and records no prompt or generated-answer text. Its decisions are offline
replays of the gateway order, not live gateway approvals.

Before running, Julian and Bartosz review the development and held-out labels in
`docs/testing/semantic-cases.json` without editing the frozen cases. Bartosz supplies a non-secret
snapshot of the active controls as JSON at a private local path. The JSON has exactly five keys:
`policy_version`, `feed_version`, `feed_expires_at`, `policy`, and `feed`. The policy and feed objects
use the existing contract schemas. The runner validates them, requires a future feed expiry, hashes
the snapshot, and stops if the model choices differ from the runtime manifest. Do not use the
committed example as a substitute for active controls.

Julian supplies `LAYA_API_KEY` privately in the runner process environment. Do not pass it on the
command line, load `.env.local`, or paste it into results. In this isolated worktree, run:

```sh
node src/features/detection/providers/smoke.mjs --eval prepare --controls /private/tmp/t04-active-controls.json --out /private/tmp/t04-semantic-run --labels-reviewed-by Julian+Bartosz
```

The prepare command performs 120 development and 30 fixed demo attempts, then writes
`development.jsonl`, `demo.jsonl`, and `lock.json`. It stops on an incomplete attempt, preserves
the failure record, and never retries. Review the safe metadata and proposed thresholds before the
held-out step. Keep the code, controls, corpus, and demo fixture unchanged after this point.

```sh
node src/features/detection/providers/smoke.mjs --eval heldout --controls /private/tmp/t04-active-controls.json --out /private/tmp/t04-semantic-run
```

The held-out command checks all frozen hashes, consumes a one-time `heldout.started` marker, runs
each of the 12 held-out cases once, and writes `heldout.jsonl` and `report.md`. If it stops early,
record the incomplete result. Do not delete the marker or rerun held-out cases as a tuning loop.

Only case/run IDs, scores, decisions, reason/finding codes, hashes, revisions, usage, timings, and
error codes are saved. The report calls withheld benign requests friction; generated-output false
positives require a separate private human label review. A candidate demo question qualifies only
with 10/10 proposed ALLOW and at least a 0.05 margin. A question unstable under baseline controls
must be labelled as such until Bartosz decides on policy. Place the completed `report.md` in this
feature for the PR; do not publish the controls snapshot or generated text.
