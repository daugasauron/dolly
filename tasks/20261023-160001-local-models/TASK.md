# More local models that run in Dolly and install with amy

- STATUS: CLOSED
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
grows by about the bytes uploaded (to 1.5 GB) and the renderer to 6.9 GB.

The driver's part is a defect, reproduced alone (`build/models-evidence/upload/`): a page
that POSTs 1 GiB in 64 MiB `fetch` bodies leaves Playwright's client process at
1,779 MiB RSS (Playwright keeps each request's body); the same bytes as `Blob` bodies
fail at the eighth chunk (Chrome's blob storage). Reading the snapshot out of the page
instead, 16 MiB at a time as base64 through `page.evaluate`, moves 1 GiB in 11.4 s with
the client at 445 MiB. `scripts/build-snapshot-browser.mjs` now does that. Checked: `jq`
rebuilt by it is byte-identical to the snapshot the old upload wrote (`d5797591…`), and
after it `qwen3.8-2b` builds at 6.3 GB peak (OOM-killed at 8.9 GB before) and the 4B's
UD-IQ3_XXS at 8.0 GB.

What is left is the capture: the kernel's capture buffer and the page's copy of it come
on top of the image's files, so the build holds the model about four times at once. The
1.95 GB UD-IQ3_XXS fits when the recipe removes the two parts before the capture (with
the fix: killed at the capture at 8.4 GB without that line, built at 8.0 GB with it).
The 2.1 GB Q3_K_S, with that line and the fix, builds at 8.6 GB peak: a snapshot of
2,105,918,730 B, 41.6 MB under the 2 GiB limit (14:42).
`pi-local`, repinned for the new descriptions, builds at 8.4 GB (killed at the upload
at 8.9 GB before the fix).

### LFM2.5 (owner's decision above)

`LiquidAI/LFM2.5-2.6B-GGUF` at `e7caca5d…`, `LFM2.5-2.6B-Q4_K_M.gguf`, 1,674,455,040 B
(2 parts), `02a8b7e1…`; its `LICENSE` (10,574 B, `30adf9d6…`) is
`demos/local-llm/LFM-LICENSE`. The GGUF is `lfm2` (30 blocks, `head_count_kv` per layer),
carries `general.sampling.temp` 0.1 and `top_k` 50, so the description adds only
Liquid's `repetition_penalty` 1.1; the pinned llama.cpp has its own LFM2.5 template and
tool-call parser (`common/chat.cpp:1150`). The card: "a pure reasoning model that always
thinks", with no switch, so `pi.reasoning` is false.

The package is `lfm2.5`, not `lfm2.5-2.6b`: an image name's segments after a dot are
digits only (`validName`, `src/dollyfile-view.mjs:140`), so `2.6b` cannot be one. It is
the only LFM2.5 in the catalog.

Builds with the fixed builder (`DOLLY_IMAGE_JOBS=1`, one image each, 9 GB slot), all with
provisional `gpu` figures until the measurements below: `qwen3.8-2b` 1,312,291,228 B
(6.3 GB peak), `lfm2.5` 1,674,580,645 B (8.6 GB), `qwen3.5-4b` both quants (above).

### Measured in Dolly: Chrome 151, f32 shaders, RTX 5070 (15:03-16:30)

`build/models-evidence/measure.mjs` in `pi-local` on a private Xvfb display, under the GPU
lock: the GGUF and a description are fetched into `/usr/share/dolly/llm` with `curl` from
the test server (a model not bundled), then `perf.mjs` (Janis: `dolly-llama` at 16,384
tokens, a 3,593-token prompt, 384 generated tokens, a next turn that reuses it) and the
tasks in `tasks.mjs`, each a fresh `pi --provider webgpu --model ID --mode json -p` with
`pi-local`'s settings (thinking off). GPU MiB is the browser's processes in `nvidia-smi`,
sampled every 0.5 s. The tasks: the loop task of the GPU test (list, write `hello.c`,
compile, run, report), and the four of `20261005-215557-local-models`, rewritten
(that harness is gone): fix a division by zero in C and rebuild, give a definition as
`path:line`, write and build FizzBuzz, edit two fields of a JSON file. Each check runs
in Dolly on the files and the answer.

| Model | GPU MiB | Prefill tokens/s | Tokens/s | Next turn | Tasks | Loop | Four tasks | Tool errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Qwen3.5-2B Q4_K_M (bundled) | 2,239 | 690 | 76 | 0.69 s | 9 of 13 | 5/5 | 4/8 | 6 |
| Qwen3.5-4B Q3_K_S | 3,744 | 292 | 32.7 | 1.69 s | 10 of 12 | 4/4 | 6/8 | 15 |
| Qwen3.8-2B-Distill Q4_K_M | 2,175 | 728 | 75 | 0.69 s | 0 of 12 | 0/4 | 0/8 | 0 |
| LFM2.5-2.6B Q4_K_M | 3,338 | 442 | 69.5 | 0.28 s | 9 of 12 | 1/4 | 8/8 | 23 |
| Qwen3.5-4B UD-IQ3_XXS | – | – | – | – | 0 of 12 | – | – | – |

- **Qwen3.5-4B UD-IQ3_XXS does not run with f32 shaders**: "this shader stores f16 in a
  buffer and needs shader-f16, which the adapter lacks" at its first token (its 48 F16
  tensors). So the package is **Q3_K_S**, which runs on both kinds; the 4B solves more
  (fails: an answer of the literal `path:line`, a FizzBuzz printing 15) at less than
  half the 2B's speed.
- **Qwen3.8-2B-Distill calls no tool** with thinking off: it writes the whole session as
  prose, a listing, the program and its "output" (`runs/chromium-qwen3.8-2b-*`). Worse
  than the 2B on every task: not packaged (thinking on: below).
- **LFM2.5-2.6B runs on WebGPU with its ops on the GPU**: 31 of 31 layers offloaded, the
  KV cache of its 8 attention layers (512 MiB at f32) and the 30 short-convolution
  states (0.34 MiB) in WebGPU buffers, `graph splits = 2` as for the Qwen models (the
  token embedding is on the CPU for all of them). Its tool calls parse (Pythonic calls,
  llama.cpp's LFM2.5 parser); it always reasons, 100-1,450 tokens a turn. It failed the
  loop task three times out of four the same way: `hello.c` begins with
  `# Include standard I/O`, and it blames the compiler. Its GPU memory once read 4,931 MiB
  inside a task (an engine restarted while the previous one's memory was still held).
- The 2B's misses: `src:parse` and "line 14" for `path:line`, a FizzBuzz printing the
  numbers too, `server.debug` set instead of `debug`.

### f16 shaders: Chrome 156 with `--enable-dawn-features=vulkan_enable_f16_on_nvidia`, Firefox 157

(Chrome was updated on the machine to 156 between the two sessions.)

| Model | Browser | GPU MiB | Prefill tokens/s | Tokens/s | Loop task |
| --- | --- | ---: | ---: | ---: | ---: |
| Qwen3.5-4B Q3_K_S | Chrome + flag | 3,155 | 254 | 33.1 | |
| Qwen3.5-4B UD-IQ3_XXS | Chrome + flag | 2,987 | 249 | 23.0 | |
| LFM2.5-2.6B | Chrome + flag | 2,205 | 417 | 78.8 | |
| Qwen3.5-4B Q3_K_S | Firefox | 4,059 | 80 | 5.0 | 2 of 2 (66-76 s) |
| LFM2.5-2.6B | Firefox | 3,060 | 131 | 5.0 | 0 of 1 (1,155 s) |

- The descriptions carry Chrome's peaks, MiB / 1000 rounded up as for the other models:
  `qwen3.5-4b` 3.2 / 3.8 GB, `lfm2.5` 2.3 / 3.4 GB.
- IQ3_XXS runs with f16 shaders, a third slower than Q3_K_S: a second reason for Q3_K_S.
- **Qwen3.8-2B with thinking on** (`pi --thinking medium`, Qwen's thinking sampling):
  0 of 4 (loop 0/2, fix-c 0/1, json 0/1), one tool call in four runs. **Decided: not
  packaged**, and it should not replace the model `pi-local` bundles: it is a reasoning
  distillation that does not use tools here, with or without thinking. Its recipe,
  description and rows are gone from the tree; the measurements stay here.
- LFM2.5 in Firefox: its reasoning at 5 tokens/s made the loop task take 19 minutes
  (and fail as in Chrome). It is a Chrome model.

### The packages as built (15:47-16:00, final descriptions)

| Image | Snapshot | Build peak |
| --- | ---: | ---: |
| `qwen3.5-4b` (Q3_K_S) | 2,105,918,730 B | 8.8 GB |
| `lfm2.5` | 1,674,580,645 B | 8.7 GB |
| `pi-local` (the two new descriptions in `provider.tar`, still bundling Qwen3.5-2B) | | 8.6 GB |
| `dollyfile-studio` | | 8.7 GB |

`pi-local` was killed at the capture twice at 9 GB (15:53, 15:54) before it built with an
emptied builder profile: `.cache/snapshot-browser-profile-0` had grown to 7.3 GB of cached
artifacts. These builds sit 0.3-0.4 GB under the slot's cap: a model package near 2 GiB
needs the builder's capture to hold less, or a larger slot.

### The GPU test with each package as the model installed with `/local` (16:21-)

`demos/local-llm/test/local-llm-browser.mjs` now takes the model the user installs from
`DOLLY_LLM_SECOND` (default `minicpm5-2b`, as before): one run per package, since three
installs in one page would not fit the browser's memory. Run with
`DOLLY_LLM_IMAGES=pi-local` under the GPU lock, `MemoryMax=12G`, on the rebuilt
`pi-local` (`build/models-evidence/session-test.sh`, log `session-test.log`):

- `DOLLY_LLM_SECOND=qwen3.5-4b`, Chrome 156: passed (16:21-16:28): the engine proof, the
  agent task on the first attempt (4 tool calls), session save, restore and fresh boot,
  then `/local` listing `qwen3.5-4b` as not installed, `amy install qwen3.5-4b` of the
  2.1 GB package, Pi switched to it, temperature 0.35 and context 12,288 set and seen by
  the engine, a context too large refused, the task again, no request off the origin.
- `DOLLY_LLM_SECOND=lfm2.5`, Chrome 156: passed the same way (16:28-16:32); the test's
  scope peaked at 10.1 GB of anonymous memory.
- `DOLLY_LLM_SECOND=qwen3.5-4b`, Firefox 157: passed (16:32-16:40), the agent task on
  the first attempt (101 s), the install, switch, parameters and the task again.
- `DOLLY_LLM_SECOND=qwen3.5-4b DOLLY_LLM_IMAGES=dollyfile-studio`, Chrome: passed
  (16:40-16:43). The scope peaked at 11.8 GB of anonymous memory, 0.2 GB under the
  12 GB cap the rules give a GPU run: the 2.1 GB package is about the largest a page
  installs there. (Firefox's processes run in the snap's own cgroup and are not in that
  figure.)
- Not run: LFM2.5 in Firefox (its loop task alone took 19 minutes there) and in Studio.

Also passed on the rebuilt images, headless: the test's two start screens (`/local`
opens through the new provider) and `npm run test:demos -- studio` (47 s).

## Closed 2026-10-23

Done-when against the evidence above: four candidates measured in Dolly on the RTX 5070
(all four architectures load at the pinned llama.cpp; sizes and parts; GPU memory with
f32 and f16 shaders; tokens per second in Chrome and Firefox; Pi's tool calls against the
bundled 2B). The two worth it are one package each, `qwen3.5-4b` (Q3_K_S, 2.11 GB) and
`lfm2.5` (LFM2.5-2.6B, 1.67 GB), and the GPU test installed and chose each with `/local`
in `pi-local` (the 4B also in Firefox and in the Studio). Qwen3.8-2B-Distill is not a
package and should not replace the bundled model. Commits on `demo/local-models`:
`a79ccf35` (the builder), `2e75b609` and `eafa3034` (the packages), notes in between.

For the integrator:

- `scripts/build-snapshot-browser.mjs` changed (core build tooling, no image input): it
  is what lets a model package or `pi-local` build in the 9 GB slot at all. The builds
  still peak at 8.6-8.8 GB.
- Not run here: the core suite (`test/amy-browser.mjs` gains `qwen3.5-4b` and `lfm2.5` in
  its list of packages tested elsewhere). The plain `npm run image` stops in this tree in
  another demo's staging after `tools` (an input this worktree lacks); the registry was
  restored with `node scripts/generate-routes.mjs` (161 images, all cache hits in the plan).
- Rebuilt here and to rebuild in the round: `qwen3.5-4b`, `lfm2.5`, `pi-local`,
  `dollyfile-studio`.
