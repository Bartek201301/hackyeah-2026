# Deterministic findings and mixed-file extraction

Researched 3 October 2026. Builder B's T04/T05 slice; R03/R05/R06/R16; AT03/04, S05 and supporting AT05/09. Outcome: preserve useful attributable material when separation is justified, while keeping originals private and classification unchanged.

## Authority and ownership

The [technical specification](../../../docs/product/technical-spec.md) requires full-text deterministic checks, semantic coverage, whole risky-unit removal, candidate rescanning and private originals. Maciej supplies parser provenance and findings. Bartosz applies identity, active feed/policy, classification, review and publication. Julian displays only the safe outcome projection. Removing a secret is not declassification; a model saying safe is not a release authorization.

[S05](../../../docs/demo/scenarios.md) allows recovery of a restricted pipeline sentence only if clean separation is established. Otherwise an honest REVIEW is valid. This is a test oracle, not a string to recognize in feature logic. Generalize by source units and risk behavior, never fixture IDs or expected output sentences.

## Deterministic matching research

The accepted scope is intentionally limited: NFKC and case normalization for signatures; literal substrings; parsed URL hostnames with dot-boundary subdomains; conservative PEM/token-prefix/contact patterns and declared synthetic fields. No caller regex, downloaded code, link fetching or unrestricted DLP claim. [Unicode normalization](https://www.unicode.org/reports/tr15/) explains why compatibility normalization can change representation; it does not establish that every visually similar character becomes equivalent.

Recommend maintaining original text plus a derived normalized scan view. A finding identifies category, safe code, stage and original unit locator; it must never include the matched secret or contact value. For unit-level removal, scanning normalized units alongside the normalized whole document reduces the need for fragile exact-character reverse mapping. Cross-unit matches must conservatively implicate all contributing units. If exact positions cannot be mapped because normalization composes/expands characters, return a broader original span or uncertainty, not a wrong precise range.

Examples for future general tests: a compatibility ligature; decomposed accent; astral symbol before a match; a domain's real subdomain versus a suffix lookalike; a URL whose userinfo resembles an allowed host; repeated identical text in different units. NFKC is not complete confusable detection. Parsed URL host checks must have defined case/IDNA/trailing-dot behavior and must never initiate network access. Recommend platform URL parsing and a shared normalization rule approved by Bartosz.

The [feed schema](../../../docs/contracts/threat-feed.schema.json) supports literal/domain indicators, REVIEW/BLOCK action and bounded entries. `DetectionPort.assess` currently accepts policy but no feed snapshot. Recommend the central gateway own feed matching and versioning, with Maciej contributing pure bounded matcher behavior through an agreed server-only handoff if needed. An alternative is an explicit trusted feed input to detection; that is a shared contract change. Do not fetch mutable feed state from inside a provider adapter or hardcode the example feed (D03).

## Separation choices and recommendation

| Approach                                                       | Research conclusion                                                                                                                                             |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delete matched substrings                                      | Insufficient: surrounding text can retain credentials, reassemble an instruction or lose meaning/provenance. Not recommended for automatic mixed-file recovery. |
| Remove entire validated CSV row or PDF paragraph within a page | Recommended candidate strategy where the risky unit is independent. Costs more benign text but provides a reviewable boundary and source locator.               |
| Let a generative model rewrite the document                    | Adds an untrusted transformation and extra budget/citation burden. Outside the minimum selected extraction approach.                                            |
| Hold the document for review                                   | Appropriate when units depend on one another, attribution is unclear, or semantic findings cannot be localized safely.                                          |

A document-level maximum score does not locate the risky unit. Coverage windows identify spans, but overlapping windows and contextual instructions can implicate adjacent units. The current Assessment returns only aggregate risk scores. Recommend separate, budgeted candidate/unit assessments when required, retaining the original document finding; alternatively request a private localization contract. Never infer a clean unit solely because the aggregate API gives no locator (D08).

The semantic wording also says actor identifiers and secrets are excluded, while full mixed-file assessment includes credential-bearing content. Recommend a contract clarification distinguishing prohibited operational credentials/identity metadata from untrusted synthetic document text, and defining when deterministic hard findings short-circuit provider calls. Do not silently redact model input and label the original fully assessed (D10).

## Required behavioral evidence

Future verification should follow this sequence, without making publication a detection responsibility:

1. Parse every accepted byte/text unit with complete provenance. Parsing or coverage failures produce no approved candidate.
2. Preserve original whole-text findings, then identify candidate units. A whole-action signature blocks an executable request; an import signature can mark its containing unit unsafe under the accepted recovery rules.
3. Remove entire clearly risky units. If an instruction modifies neighboring facts, uses a preceding sentence as context or distributes a secret over units, hold the dependent material rather than declaring separation.
4. Keep remaining text at the original classification/deal. Preserve source dates/periods/units and exact locators; split long safe units into bounded excerpts without dropping tails.
5. Independently rescan the entire candidate, including new adjacencies introduced by removal. Each additional provider call needs a reservation and distinct logical call identity. No reuse of old scores for edited text.
6. Return findings/provenance to Bartosz. Empty result blocks; uncertainty reviews; unavailable semantics remains a service failure/held import. Only his gateway may publish vetted excerpts or resolve review.

The banking research contributes the principle that an authorized internal business fact is not automatically an exposure. Its historical outbox flow is not implemented here. [Fides](https://arxiv.org/html/2505.23643) provides supporting information-flow rationale, not a guarantee that paragraph separation solves indirect injection. Treat supported English semantics as a measured scope limitation; do not silently swap checkpoints for other languages.

## Verification and handoff

Feature tests should cover independent safe/risky rows, instruction spillover, cross-unit patterns, changed adjacency after removal, an all-unsafe file, uncertain paragraph boundaries, long safe-unit splitting, missing attribution and rescanning edited candidates. Test benign discussion of an attack to measure overblocking. Unit tests may use labelled controlled scores to cover REDACT deterministically; live MIX-01 may legitimately yield REVIEW.

Bartosz's integration tests must prove restricted safe material stays restricted, raw/candidate text remains inaccessible to ordinary users, approval cannot override unresolved block/unavailability, and final stored excerpts contain no secret/contact canaries. Julian needs safe reason categories, not snippets. Proposed categories include invalid format/limit, unreliable extraction, incomplete assessment, unsafe content, uncertain separation and service unavailable; exact codes remain a shared handoff decision.

Not run: deterministic detector, normalization/span mapping, live mixed-file assessment, candidate rescans, publication/access tests or UI outcome checks. No fixture-specific rule or canonical dataset change was made.
