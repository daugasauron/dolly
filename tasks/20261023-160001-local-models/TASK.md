# More local models that run in Dolly and install with amy

- STATUS: OPEN
- PRIORITY: 150
- TAGS: local-llm,packages,0.1.4

Owner (2026-10-23): "search for other interesting local models you can make work in dolly
that can be installed from amy."

Today: `qwen3.5-2b` and `minicpm5-2b`, model packages that `pi-local` installs and selects
with `/local`, run by llama.cpp over `gpu@0` (`demos/local-llm/`). Qwen3.5-4B left the
catalog (2026-10-13: its four parts, and about 9 GB to build). A model package of 1.4 to 1.6
GB peaks at 6.6 to 8.2 GB in a browser while `amy install` runs.

Done when: candidates are measured against what Dolly's llama.cpp and a browser's WebGPU
take (architecture support at the pinned llama.cpp, file size and parts, memory, tokens per
second in Chromium and Firefox, quality on Pi's tool calls), and the ones worth it are amy
packages with a test each, chosen with `/local` in `pi-local`.

## Work (2026-10-23, branch `demo/local-models`)

Plan: `investigation.md` section 4. The owner's rule from 2026-10-13 stands: one model,
one package, under the 2 GiB package limit. LFM2.5 is not packaged (its licence is the
owner's decision).

### Sources, pinned

| Model | Repository at revision | File | Bytes | SHA-256 | Licence |
| --- | --- | --- | ---: | --- | --- |
| Qwen3.5-4B | `unsloth/Qwen3.5-4B-GGUF` `e87f1764…` | `Qwen3.5-4B-Q3_K_S.gguf` | 2,105,791,648 (2 parts) | `7e2dd96b…` | Apache-2.0 (Qwen) |
| Qwen3.8-2B-Distill | `empero-ai/Qwen3.8-2B-Distill-GGUF` `f4f73582…` | `Qwen3.8-2B-Q4_K_M.gguf` | 1,312,164,224 (2 parts) | `4aa0fb13…` | Apache-2.0 (Empero, from Qwen3.5-2B) |

From the Hugging Face API (`/api/models/REPO/tree/REVISION`, LFS oids); both files
fetched with `scripts/fetch-verified-file.sh` into `.cache/ID-SHA256.gguf`, the path the
staging script reads. Q3_K_S is two 1 GiB parts, not three as the investigation counted.

GGUF headers (`build/models-evidence/gguf-meta.py`): the 4B is `qwen35`, 32 blocks, 8 of
them attention (4 KV heads of 256), tensors Q3_K (176), Q8_0 (48), Q4_K (24), Q6_K
(`token_embd`, 497 MiB, under the 1 GiB buffer); no `general.sampling.*`; unsloth's chat
template (7,816 characters, not the 2B's). Qwen3.8-2B has
the bundled 2B's exact shape (25 blocks with one next-token layer, 2 KV heads, the same
chat template byte for byte), Q4_K and Q6_K, no `general.sampling.*`.

### Builds: no model package fits the 9 GB `bigbuild` slot

Measured with `build/models-evidence/cgroup-sample.sh` and `cgroup-procs.sh` (the
scope's `memory.stat` and each process's RSS, every 0.5-2 s), `DOLLY_IMAGE_JOBS=1`, one
image per build:

| Image | Package | Peak anon | Where it ended |
| --- | ---: | ---: | --- |
| `qwen3.5-4b`, Q3_K_S | 2.11 GB | 9.0 GB | OOM kill at "verifying completed image" (13:59), and with the parts removed before the capture at the snapshot upload (14:03) |
| `qwen3.5-4b`, UD-IQ3_XXS | 1.95 GB | 9.1 GB | OOM kill during the snapshot upload, twice (14:10, 14:13) |
| `qwen3.8-2b`, Q4_K_M | 1.31 GB | 8.9 GB | OOM kill during the snapshot upload, twice (14:17, 14:19) |
| `pi-local` (repinned for a new description) | 1.64 GB | 8.9 GB | OOM kill during the snapshot upload (13:57) |

Where the memory is, for the 1.31 GB package: the build page's renderer holds 3.3 GB
before the capture (the system image, the two parts and the joined GGUF), 6.5 GB after
it, and does not fall when the build Worker ends; during the upload of the snapshot in
64 MB `fetch` bodies (`scripts/build-snapshot-browser.mjs`) Playwright's driver process
grows by about the bytes uploaded (to 1.5 GB) and the renderer to 6.9 GB. So the
builder needs about five times a model package, and these images are built where the
cap is larger (the integrator's `hugebuild`). Nothing in a recipe changes that; the
builder's memory is the core's (reported, not changed here).
