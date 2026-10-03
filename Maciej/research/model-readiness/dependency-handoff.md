# Dependencies — researched candidates for Bartosz

Researched 3 October 2026. T01/T04; R01/R19. Outcome: a small reproducible model/parser environment with clear ownership. Only Bartosz commits dependency manifests, locks, environment examples and launch wrappers. No dependencies were installed or changed by this research.

## Baseline, candidates and compatibility constraints

Merged main `8c1484b` retains the starter dependency set. Unmerged G1 `0773c59` proposes AJV 8.20.0, ajv-formats 3.0.1, openapi-fetch 0.17.0, openapi-typescript 7.13.0 and Vitest 4.1.11. Its manifest does not yet include csv-parse, pdfjs-dist or a Python lock. Consume the eventual merged runner rather than introducing a competing test stack because older task text mentioned tsx.

The following candidates were read from official package metadata on the research date. Availability and declared constraints are verified; installation, resolver success, model execution and Next bundling are not.

| Package/runtime  | Exact candidate                                | Basis and remaining proof                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Python           | 3.13.14 candidate; installed default is 3.14.6 | Original Laya report used 3.13.14. Prefer an isolated 3.13 environment for the first reproduction, subject to Bartosz verifying interpreter availability and ARM64 wheels. Do not replace the system Python.          |
| Laya             | `laya[serve]==0.3.24`                          | Required by protocol; [release metadata](https://pypi.org/pypi/laya/0.3.24/json), checksum verified. Python >=3.10.                                                                                                   |
| torch            | 2.14.1                                         | [Metadata](https://pypi.org/pypi/torch/2.14.1/json); matches the reported M4 experiment, not a verified M5 result.                                                                                                    |
| transformers     | 5.18.0                                         | [Metadata](https://pypi.org/pypi/transformers/5.18.0/json); matches the report. Requires tokenizers >=0.23.1,<0.24, hub >=1.31,<3 and safetensors >=0.8.                                                              |
| tokenizers       | 0.23.2                                         | [Metadata](https://pypi.org/pypi/tokenizers/0.23.2/json); satisfies the stated transformers range. Verify offsets with the actual checkpoint.                                                                         |
| huggingface-hub  | `>=1.31,<2` until the full graph is resolved    | `transformers==5.18.0` permits this range, but `tokenizers==0.23.2` requires `<2.0`; the former `2.1.1` candidate is incompatible. Let the resolver select an exact version in the intersection, then lock and smoke-test it. [Tokenizers metadata](https://pypi.org/pypi/tokenizers/0.23.2/json), [Transformers metadata](https://pypi.org/pypi/transformers/5.18.0/json). |
| safetensors      | 0.8.0                                          | [Metadata](https://pypi.org/pypi/safetensors/0.8.0/json); satisfies declared lower bound.                                                                                                                             |
| FastAPI          | 0.142.2                                        | [Metadata](https://pypi.org/pypi/fastapi/0.142.2/json); candidate for Laya serve and bridge. No broad `standard` extras required by this research.                                                                    |
| Uvicorn          | 0.54.0                                         | [Metadata](https://pypi.org/pypi/uvicorn/0.54.0/json); candidate ASGI runner, test single-worker lifecycle and shutdown.                                                                                              |
| python-multipart | 0.0.32                                         | [Metadata](https://pypi.org/pypi/python-multipart/0.0.32/json); included by Laya serve extra, not permission to add bridge upload routes.                                                                             |
| HTTPX            | 0.28.1                                         | [Metadata](https://pypi.org/pypi/httpx/0.28.1/json); proposed bridge HTTP client for explicit timeouts and bounded provider reads.                                                                                    |
| Ollama           | installed 0.20.5                               | Homebrew directory evidence only; server response/version and qwen digest remain unverified. No upgrade proposed.                                                                                                     |
| csv-parse        | 7.0.3                                          | [Registry metadata](https://registry.npmjs.org/csv-parse/7.0.3); no declared dependency or Node engine constraint. Must still test strict parsing on Node 24.                                                         |
| pdfjs-dist       | 6.3.289                                        | [Registry metadata](https://registry.npmjs.org/pdfjs-dist/6.3.289); engine `>=22.13.0                                                                                                                                 |     | >=24`, compatible with installed Node 24.14.1 by declaration. Optional `@napi-rs/canvas:^1.0.0` affects the resolved package graph. |

This is not a transitive lock. Laya's metadata has broad lower bounds, so pinning only Laya leaves behavior mutable. Bartosz must resolve and lock all transitive versions and hashes for the selected Python/OS, including numpy, pydantic, Starlette and native wheels. If the candidate graph fails, record the resolver evidence and smallest compatible change rather than upgrading unrelated packages.

## Recommendation and alternatives

Retain selected Python/PyTorch Laya, FastAPI/Uvicorn, Node csv-parse/PDF.js and native HTTP adapters. This follows the accepted stack and avoids ONNX/MLX conversion, an Ollama SDK, a second gateway framework or a separate parser service. CPU fallback and alternative package versions require measured evidence; they are not silent compatibility escapes.

PDF.js 6.3.289 source lacks the older `isEvalSupported` option in its document-init API. Do not copy an outdated flag and call the input safe. Investigate current rejection APIs and import behavior using the [parser brief](../bounded-parsers/csv-and-text-pdf.md). The installed Next 16.3.8 guide says Route Handler dependencies are bundled unless externalized; PDF.js is not in that guide's automatic externalization list. ESM worker assets, optional native packages, and production output tracing require a minimal build/runtime smoke before choosing any Next configuration change. That change belongs to Bartosz.

## Manual handoff request

Ask Bartosz to confirm the G1 merge SHA, public import path and runner; resolve the candidate graph in an isolated environment; supply the locked Python manifests and model wrappers; and approve the two parser dependencies after compatibility checks. Ask Julian to identify existing model environments/caches and reserve Mac time. Neither request was automatically sent.

Environment requirements are the [existing setup names](../../../docs/team/setup.md), plus an explicit mapping from `LAYA_CHECKPOINT_REVISION` to upstream `LAYA_REVISION`. Recommend explicit `LAYA_JEV_STRICT=0`, the checkpoint/tokenizer hash manifest, and a private durable ledger location. Queue bounds, ledger retention and parser worker configuration need agreed configuration ownership; no values should be invented in feature code. Never give the bridge a Supabase secret key.

## Compatibility checks still required

- Resolve exact dependencies on the target architecture, verify wheel hashes, import packages, load the pinned tokenizer/checkpoint and confirm actual MPS/CPU behavior.
- Start the bounded authenticated services and exercise synthetic assessment/generation, cancellation and shutdown; no runtime result is inferred from a successful import.
- Parse a small valid CSV and text PDF in the chosen Node runtime, including worker asset discovery; then build and run the same operation in preview.
- Verify the full dependency lock is unchanged by repeat installation and publish commands/exit codes. Model scripts named in setup and semantic tests named in acceptance are still planned, not commands claimed to exist on main.
