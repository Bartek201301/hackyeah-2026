# Fixtures — development only

Hand-authored `Response` envelopes for building and testing the audit views before real endpoints exist.

- **Not evidence.** No value here was measured. Nothing in this folder may be presented as a run,
  a result or a demo artefact.
- **Not runtime data.** These files never reach the judged application. After G1 they move into the
  feature's tests under `src/features/audit/**` with the integrator's test convention.
- **Schema-shaped.** Each file is a complete `Response` envelope with no extra marker fields, so the
  shape is exactly what the client will return. The filename and the index in
  [../03-state-matrix.md](../03-state-matrix.md) carry the fixture label instead.
- **Synthetic.** Organisation and deal identifiers come from `docs/demo/fixtures.json`. Actor UUIDs in
  the `…-00000000040x` range are placeholders — real account UUIDs are auth-generated and live in the
  operational registry, never in a file.
- **Validated.** All files validate against `Response` in `docs/contracts/openapi.json`, including
  `additionalProperties: false`, required fields, enums and string limits.

Expected values derived from these fixtures are in [../05-test-plan.md](../05-test-plan.md) §5.
