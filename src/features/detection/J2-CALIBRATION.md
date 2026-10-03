# J2 semantic calibration evidence — 4 October 2026

Owner: Julian, detection. This report contains scores and aggregate decisions only; no generated
answer text, protected source text or credentials. The run used live local Laya and Ollama on the
Mac (`mps`) and policy/feed v1 from the current controls file. It is development evidence for
Bartosz's decision. No policy, semantic protocol, shared contract or frozen case file changed.

## Inputs and interpretation

- Canonical dataset: `docs/testing/semantic-cases.json`, SHA-256
  `09c323bcc0917ceb99aecf879388a111359a9dab8b229a3e5478b4c440caa532`;
  12 development and 12 held-out cases. The held-out split was assessed only after the
  candidate was frozen.
- Controls: `/Users/julian/Downloads/message.txt`, SHA-256
  `ad570ed9bf5e52bacaf11476570e6e74a9fa5e65e9b4708e2c9a45d6baf2ddc6`;
  policy v1/feed v1; balanced mode; all three risks review at 0.30 and block at 0.65.
- Laya: `typed-decisions` revision
  `55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851`. Qwen:
  `qwen3:8b` digest
  `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`.
- Laya state was compact JSON in `operation`, `audience`, `content` order, with the three fixed
  `noul` questions in `docs/contracts/semantic-protocol.md`. The runner required explicit
  `typed-decisions` routing, no reported truncation or dropped state tokens, and finite
  in-range scores. Short canonical cases were each assessed once with their frozen operation
  and audience. J1 diagnostic scores came from the private three-run J1 measurements.
- Bartosz confirmed the labels, including D07, before this run. The frozen file still says
  human review is required and retains `development-benign-02` as benign with `audience:
public`. Proposed D07 interpretation for Bartosz: the _request language_ is benign, while
  public clearance does not permit retrieval of an internal reconciliation. A semantic ALLOW
  cannot grant that access. The review decision and rationale should be recorded in the
  versioned dataset before a release claim; Builder B did not edit it.
- Extra development diagnostics were nine private J1 answers (three each for S01/S02/S07),
  three J1 input case/actor scenarios, seven fixture import texts and the G2 synthetic public
  report: 20 benign diagnostic assessments. They are separate from the canonical denominator;
  their labels do not make a restricted import or answer automatically publishable. J1 repeated
  input scores and import scores were reused; no answer text entered this report.

## Development comparison, before held-out

Selection rule was written before reading development scores: require 0/4 canonical attacks
auto-ALLOW; then maximize canonical benign ALLOW, minimize benign BLOCK/REVIEW, and prefer
the smallest single setting change. Diagnostics could veto a clear unsafe regression, but could
not compensate for a canonical attack miss. The threshold grid changed only
`sensitive_exposure.review` to 0.25, 0.35, 0.40 or 0.45; all block thresholds remained 0.65.

| Development rule                              | Canonical benign ALLOW/REVIEW/BLOCK (n=8) | Canonical attack ALLOW/REVIEW/BLOCK (n=4) | Diagnostic benign ALLOW/REVIEW/BLOCK (n=20) |
| --------------------------------------------- | ----------------------------------------- | ----------------------------------------- | ------------------------------------------- |
| Policy v1                                     | 5/3/0                                     | 0/2/2                                     | 15/5/0                                      |
| Threshold 0.25                                | 5/3/0                                     | 0/2/2                                     | 6/14/0                                      |
| Threshold 0.35                                | 5/3/0                                     | 0/2/2                                     | 19/1/0                                      |
| Threshold 0.40                                | 6/2/0                                     | 0/2/2                                     | 20/0/0                                      |
| Threshold 0.45                                | 6/2/0                                     | 0/2/2                                     | 20/0/0                                      |
| Audience as enforced clearance, v1 thresholds | 5/3/0                                     | 0/2/2                                     | 12/8/0                                      |
| Qwen temperature 0, seed 42, v1 thresholds    | 5/3/0                                     | 0/2/2                                     | 17/3/0*                                     |

For the audience candidate, the 12 canonical records retain their frozen `public` audience.
The J1 diagnostics use `restricted deal team` for S01, `internal` for S02/S07, and the
fixture's intended clearance for imports; G2 remains `public`. The exact gateway change would
be to pass its already enforced clearance into `DetectionPort.assess` for `chat_input`,
`chat_output` and `import`, then serialize that value in the protocol state. This requires a
matching protocol/contract decision from Bartosz. The diagnostic outcome worsened: input
1/3 ALLOW, output 6/9, imports 4/7, G2 1/1. It was not selected.

The generation candidate would add Qwen `options.temperature: 0` and `options.seed: 42`
globally. Each of S01, S02 and S07 produced one unique answer hash across three repeats;
all nine fixed-seed outputs assessed ALLOW at v1 thresholds. `*` Its diagnostic row replaces
the original nine J1 outputs with these new outputs and leaves the other 11 diagnostics at v1;
it is a reproducibility observation, not an improvement in canonical request detection.
No adapter setting changed.

The frozen choice for held-out was **only** `sensitive_exposure.review: 0.30 → 0.40`.
The 0.45 candidate tied on every development count and changed the threshold farther.
The choice was written to a separate private file before any held-out assessment. It would
apply globally; no fixture, actor or prompt exception was considered. It also changes J1
diagnostic RES-01 import from REVIEW to ALLOW, so any adoption needs Bartosz's separate
access/publication review.

## Held-out, one pass after freezing the choice

Each of 12 held-out texts received one live Laya assessment. The same score vector was then
classified offline under policy v1 and the frozen candidate; the candidate changes policy
thresholds, not model input. No selection or retuning followed these results.

| Held-out rule         | Ordinary benign ALLOW/REVIEW/BLOCK (n=4) | Difficult benign ALLOW/REVIEW/BLOCK (n=4) | Attacks ALLOW/REVIEW/BLOCK (n=4) | Review rate (n=12) | AT14 small-set gate                                |
| --------------------- | ---------------------------------------- | ----------------------------------------- | -------------------------------- | ------------------ | -------------------------------------------------- |
| Policy v1             | 4/0/0                                    | 1/3/0                                     | 0/4/0                            | 7/12               | **Fail**: benign 5/8 ALLOW; harmful auto-ALLOW 0/4 |
| Frozen 0.40 candidate | 4/0/0                                    | 1/3/0                                     | 0/4/0                            | 7/12               | **Fail**: benign 5/8 ALLOW; harmful auto-ALLOW 0/4 |

Development v1 was ordinary benign 3/4 ALLOW and difficult benign 2/4 ALLOW; the chosen
candidate was 3/4 and 3/4, respectively. Its development review rate was 4/12 versus
v1's 5/12. Held-out false-positive/friction is 0/4 ordinary and 3/4 difficult under both.
All four held-out attacks were withheld for semantic REVIEW, but none was semantic BLOCK.

**Recommendation:** retain policy v1. The selected candidate did not improve held-out benign
utility and neither rule meets the 6/8 benign ALLOW gate. These held-out cases are now exposed
to evaluation; any further tuning needs separately authored held-out cases before a new
generalization claim. Do not ship a threshold or protocol change on these numbers alone.

## Limits and remaining gates

- These are semantic-only threshold outcomes. Full deterministic-plus-semantic gateway
  outcomes, feed matches, access checks, publication effects and durable audit were not run
  here. A deterministic denial remains binding even when the semantic result is ALLOW.
- The 24 cases are a small demo set, not a security estimate. J1 answer diagnostics were
  generated locally; their content stayed in a mode-0600 private scratch file and was neither
  printed nor committed. The fixed-seed comparison uses hashes, not answer text.
- Full-window/tail coverage, provider-package version, per-case end-to-end latency, mean and
  median latency, DB/RLS behavior, CI, peer review and deployed preview are not established
  by this report. The live run checked Laya/Qwen revision and digest and rejected reported
  truncated/dropped-state responses.
