# Local models for Dolly: what fits, what runs, what to package next

Investigation, 2026-10-23, read-only, in `work/x11fix` (branch `core/npm-packages`). "Measured" means a number in a record or in `dist/`; "inferred" means arithmetic or code reading. Paths are relative to `/home/daug/dev/dolly/work/x11fix`.

## 1. The limits

| Limit | Value | Where | Status |
| --- | ---: | --- | --- |
| Image or package snapshot | 2 GiB = 2,147,483,648 B | `src/snapshot-records.mjs:3` (`MAX_SNAPSHOT_BYTES`), `src/fs-record.h:32` (kernel), `host/packages/service.mjs:7` (`amy install` response cap) | code |
| Package overhead above the GGUF | 126,974 B (`qwen3.5-2b`: snapshot 1,396,325,470 vs GGUF 1,396,198,496), 126,604 B (`minicpm5-2b`: 1,561,444,972 vs 1,561,318,368) | `dist/` sizes | measured |
| Largest GGUF one package holds | about 2,147,350,000 B | 2 GiB minus the overhead | inferred |
| One `SOURCE` | 1 GiB | `src/dollyfile.c:25` (`MAX_SOURCE_BYTES`); weights are staged in 1 GiB parts (`demos/local-llm/prepare-local-llm-weights.mjs:14`, loop at 20-27) and joined with `cat` (`Dollyfile-qwen3.5-2b:13`) | code |
| Bundled model in `pi-local` | at most about 1.90 GB | `dist/dolly-pi-local-system.snapshot` 1,636,733,528 B holds the 1.396 GB model, so Pi and the engine are about 240 MB | inferred from measured sizes |
| Browser memory during `amy install` | 6.6 to 8.2 GB for a 1.40 to 1.56 GB package, "four to five times the package"; the page crashed in 2 of 3 tries under the 6 GB browser slot | `tasks/20261012-130814-packages/TASK.md:194-199`; cause: `amy` keeps the artifact beside the installed file, the page holds the response (`tasks/20261006-145958-builder-artifact-copies/TASK.md:40-44`) | measured |
| `amy install` time, local server | 7.9 s Chromium / 9.4 s Firefox (1.40 GB), 8.6 / 10.7 s (1.56 GB) | same record | measured |
| GPU buffers (`gpu@0`) | 4 GiB in total, 1 GiB per buffer, for weights, KV cache and scratch together | `host/gpu/worker.mjs:15` (`maxBytes`, `bufferCeiling`); the device is requested with `min(adapter.limits.maxBufferSize, 1 GiB)` (`worker.mjs:38-43`); `docs/gpu.md:25-28` | code |
| Largest single tensor | 1 GiB: Gemma 4 E2B's `per_layer_token_embd.weight` at 1,260 MiB failed | `tasks/20261005-215557-local-models/TASK.md:260` | measured |
| Chromium and Firefox adapter `maxBufferSize` | not recorded anywhere; both browsers created devices at the 1 GiB ceiling (Chrome 151, Firefox 156, RTX 5070), so the adapters report at least that | `docs/gpu.md:63-71` | inferred |
| Shader precision | Chrome on NVIDIA Linux (driver < 615.71) has no `shader-f16`: `webgpu.cpp` widens WGSL to f32 and the engine keeps the KV cache in f32 with flash attention off (`demos/local-llm/main.cpp:209`); Firefox has f16. A description must carry both `gpu.f16` and `gpu.f32` (`demos/local-llm/test/models.test.mjs:18`) | `docs/gpu.md:67-71` | measured |
| Quantizations the WebGPU backend multiplies | F32, F16, Q1_0, Q4_0, Q4_1, Q5_0, Q5_1, Q8_0, Q2_K to Q6_K, IQ1_S/M, IQ2_XXS/XS/S, IQ3_XXS/S, IQ4_NL/XS, MXFP4, NVFP4 (MUL_MAT, MUL_MAT_ID and GET_ROWS alike); KV cache types F32/F16/Q4_0/Q8_0 | pinned `ggml/src/ggml-webgpu/ggml-webgpu.cpp:4249-4277, 4394-4444` | code; only Q4_K_M has run in Dolly (measured) |
| Context | engine default 8,192, descriptions 16,384; Pi's prompt and compaction need at least 16,384 (`models.test.mjs:19`); the 2B ran a task at 32,768 in 2,730 MiB and failed to load at 131,072 | `main.cpp:205`, `tasks/20261005-215557-local-models/TASK.md:393-399` | measured |

Speed and memory of today's models, RTX 5070, 16,384 tokens, thinking off (`tasks/20261005-215557-local-models/TASK.md:323-338`, all measured):

| Model | Shaders, browser | Generation tokens/s | Prefill tokens/s | GPU MiB |
| --- | --- | ---: | ---: | ---: |
| Qwen3.5-2B Q4_K_M (1.40 GB) | f32 Chrome / f16 Chrome+flag / f16 Firefox | 63 / 65 / 5.0 | 610 / 585 / 120 | 2,235 / 2,037 / 2,057 |
| MiniCPM5-2B Q4_K_M (1.56 GB) | f32 Chrome / f16 Chrome+flag / f16 Firefox | 61 / 59 / 5.0 | 240 / 320 / 77 | 3,324 / 2,357 / 2,650 |
| Qwen3.5-4B Q4_K_M (3.01 GB, gone) | f16 Chrome+flag / f16 Firefox / f32 Chrome | 49 / 4.8 / refused | 250 / – / – | 3,873 / – / – |

Firefox generates 5 tokens/s whatever the model (its 100 ms GPU timer, `docs/gpu.md:76-78`); a larger model costs nothing there in generation, only in prefill.

## 2. What the pinned llama.cpp supports

Pin: `ggml-org/llama.cpp` commit `093a2f86` (`config/source-pins.sh:192-194`), committed 2026-09-14 ("common : move llama_n_rs_seq to before llama_decode (#28749)", GitHub API). Its `src/llama-arch.cpp` names 152 architectures, among them every family in play: `llama`, `qwen3`, `qwen35`, `qwen35moe`, `qwen4exp`, `gemma3`, `gemma3n`, `gemma4`, `granite`, `granitehybrid`, `lfm2`, `lfm2moe`, `smollm3`, `phi3`, `mistral3`, `mistral4`, `nanbeige`, `nemotron_h`, `minicpm`, `minicpm3`, `falcon-h1`, `olmo2`, `exaone4`, `gpt-oss`, `mellum`, `maincoder`. Master on 2026-10-23 adds only `beam`, `clef`, `flint`, `gemma-embedding2`, `glm5-next`, `hrm_text`, `k2-horizon`, `kolibri1`, `maion-coder`, `maple`, `muse-spark`, `sensenova_u1`, `vllm-decision2`: large models, decision models and one 3.7B that does not fit anyway (below). The hybrid ops the small candidates need have shaders in the pin: `gated_delta_net`, `ssm_conv`, `ssm_scan`, `solve_tri`, `mul_mat_id` (`ggml-webgpu.cpp:4569-4594`); LFM2's short convolution is `ggml_ssm_conv` (`src/models/lfm2.cpp:159`). **No llama.cpp update is needed for anything recommended here.** An update would cost: `prepare-local-llm.sh`'s two `sed` lines re-checked, `llama-build` (294 s measured on 2026-10-06), `local-llm-build`, `llama`, `pi-local`, `dollyfile-studio` rebuilt, the pin and `config/upstreams.json` repinned.

## 3. Candidates

Hugging Face API, 2026-10-23. KV cache at 16,384 tokens is 2 × attention layers × KV heads × head size × 2 or 4 bytes, from each GGUF header (8 MB range reads): inferred unless marked measured. "Fits" means under the 2 GiB package cap. The official `Qwen/*-GGUF` repositories are gated (HTTP 401), so bartowski and unsloth are the sources, as for today's 2B. No official small Qwen newer than 3.5 exists (Qwen3.6 and 3.8 are 27B and up); Gemma 4 starts at E2B; Granite 4.2 at 3B.

| Candidate | Repository, file | Arch | Size | Licence | KV 16k f16 / f32 | Verdict |
| --- | --- | --- | ---: | --- | ---: | --- |
| **Qwen3.5-4B, 3-bit** | `unsloth/Qwen3.5-4B-GGUF` `Qwen3.5-4B-Q3_K_S.gguf` 2,105,791,648 B (41.7 MB under the cap, 3 parts) or `Qwen3.5-4B-UD-IQ3_XXS.gguf` 1,949,047,968 B (2 parts); bartowski's 3-bit files are 2.24 GB and over | `qwen35`, pinned, 8 of 32 layers attend | 2.11 / 1.95 GB | Apache-2.0 | 0.5 / 1.1 GB (Q4_K_M measured 0.4 / 1.0) | The only way to a 4B in one package. Q4_K_M solved 44/48 tasks against 15-23 for every 2B (`tasks/20261001-214000-pi-local-model/TASK.md:52-78`); IQ2_M at 1.95 GB solved 19/48; 3-bit is unmeasured and sits between. GPU about 3.3-3.6 GB with f32 shaders (inferred), so it would run on Chrome/NVIDIA where Q4_K_M was refused. Speed about the 4B's 49 tokens/s Chrome, 5 Firefox (inferred; IQ dequantization never run in Dolly) |
| **Qwen3.8-2B-Distill** | `empero-ai/Qwen3.8-2B-Distill-GGUF` `Qwen3.8-2B-Q4_K_M.gguf` 1,312,164,224 B (2 parts) | `qwen35`, pinned | 1.31 GB | Apache-2.0 (derivative of Qwen3.5-2B) | same as the 2B | Third-party distillation of Qwen3.8 into the Qwen3.5-2B architecture, 469k downloads; publisher's own numbers: MMLU-CoT 0.283 to 0.548, GSM8K 0.33 to 0.64 over the base. Tool calls unmeasured. Drop-in for the whole pipeline, same speed and memory as today's 2B (inferred), small enough to replace the bundled model later. Its 4B sibling ships only Q4_K_M at 2.78 GB: no package |
| **LFM2.5-2.6B** | `LiquidAI/LFM2.5-2.6B-GGUF` `LFM2.5-2.6B-Q4_K_M.gguf` 1,674,455,040 B (2 parts) | `lfm2`, pinned; 8 of 30 layers attend, the rest short convolutions | 1.67 GB | **LFM Open License v1.0** (`lfm1.0`): grants use, reproduction and distribution with the licence and attribution, limits commercial use by revenue; excluded on 2026-10-06 as not open source (`tasks/20261005-215557-local-models/TASK.md:151`) | 0.26 / 0.51 GB | Best small tool-caller measured on the host: 12/18, 0 loops, 16 tool errors against Qwen3.5-2B's 8/18 (`pi-local-model/TASK.md:52-62`). Never run on WebGPU. Template has tools, no thinking switch. Owner's licence decision first |
| Qwen3.5-2B Q8_0 | `bartowski/Qwen_Qwen3.5-2B-GGUF` Q8_0 2,080,140,384 B | `qwen35` | 2.08 GB | Apache-2.0 | as the 2B | Fits; twice the bytes a token reads, so slower generation and a small fidelity gain (inferred). Not worth a package |
| Nemotron-3-Nano-4B | `unsloth/NVIDIA-Nemotron-3-Nano-4B-GGUF`, smallest `UD-IQ2_M` 2,298,861,088 B | `nemotron_h`, pinned; 4 of 42 layers attend | 2.30 GB and up | NVIDIA Open Model License (redistribution with attribution; owner row) | 0.26 / 0.51 GB | Would run everywhere, but no quant under 2 GiB: out until a package above 2 GiB exists (the core question in `tasks/20261013-143039-qwen-4b-out/TASK.md:41-59`) |
| Gemma 4 E2B | `ggml-org/gemma-4-E2B-it-GGUF` Q4_0 2,841,481,184 B | `gemma4`, pinned | 2.84 GB | Apache-2.0 (HF tag) | small (sliding window) | Out twice: over the cap, and one tensor of 1,260 MiB over the 1 GiB buffer (measured) |
| Nanbeige4.2-3B | `bartowski/Nanbeige_Nanbeige4.2-3B-GGUF` Q3_K_S 2,069,273,760 B | `nanbeige`, pinned; 22 layers run twice (`num_loops = 2`, `src/models/nanbeige.cpp:25` duplicates them) | 2.07 GB | Apache-2.0 | 1.4 / 2.8 GB with 22 cache layers, double if the loop caches too | f32 cannot fit; two passes per token halve the speed of a 3B. Out |
| Granite 4.2 3B | `ibm-granite/granite-4.2-3b-GGUF` Q3_K_M 1,835,968,032 B (Q4_K_M 2.24 GB is over) | `granite`, pinned | 1.84 GB | Apache-2.0 | 1.3 / 2.7 GB measured | f16 only; 4 of 12 tasks, prefill 165-200 tokens/s measured (`local-models/TASK.md:261`). Not worth it |
| Ministral 3 3B | `mistralai/Ministral-3-3B-Instruct-2512-GGUF` Q4_K_M 2,147,023,008 B | `mistral3`, pinned | 2.147 GB, 334 KB under the cap after overhead | Apache-2.0 | 1.7 / 3.5 GB measured | f16 only, 2 of 4 tasks measured. Out |
| SmolLM3-3B | `ggml-org/SmolLM3-3B-GGUF` Q4_K_M 1,915,305,312 B | `smollm3`, pinned | 1.92 GB | Apache-2.0 | 1.15 / 2.3 GB | f16 only; 0/18 tool calls measured. Out |
| Llama 3.2 3B / 1B | `bartowski/Llama-3.2-3B-Instruct-GGUF` Q4_K_M 2,019,377,696 B; 1B 807,694,464 B | `llama`, pinned | 2.02 / 0.81 GB | Llama 3.2 Community License ("Built with Llama", licence copy; not OSI; owner row) | 3B 1.9 / 3.8 GB; 1B 0.5 / 1.1 GB | 3B f16 only; 1B is Qwen3.5-0.8B-class (dropped at 4/18). 2024 models. Not recommended |
| Phi-4-mini | `bartowski/microsoft_Phi-4-mini-instruct-GGUF` Q3_K_S 1,897,332,096 B | `phi3`, pinned | 1.90 GB | MIT | 2.1 / 4.2 GB measured | f16 only and tight. Out |
| Qwen3-1.7B, Jan-v3.5-4B, Jan-code-4b, Jan-nano | `unsloth/Qwen3-1.7B-GGUF` Q4_K_M 1.11 GB; the 4Bs 2.05 GB and up | `qwen3`, dense | | Apache-2.0 | 1.7B 1.9 / 3.8 GB; 4B 2.4 / 4.8 GB | Dense Qwen3 caches 36 or 28 full layers: f32 cannot fit at 16k; the 4Bs are over the cap. Out |
| MiniCPM5-1B, MiniCPM5-2B Q8_0 | `openbmb/MiniCPM5-1B-GGUF` 0.69 GB; 2B Q8_0 2.68 GB | `llama` | | Apache-2.0 | | The 1B "adds nothing over the 0.8B" (measured note); Q8_0 is over the cap |
| Decision models: LiquidAI d1-3B, ggml-org vllm-d3-nano/edge, Clef-Flash | | `lfm2`, `qwen35`, `clef` | 0.8-6.5 GB | mixed | | Answer typed questions in one pass, generate no tokens: cannot drive Pi |
| K2-Horizon-3.7B, Trinity-Nano, Ling-3.0-tiny, Dory1.0-4B, Flint, Kolibri-1 | | `k2-horizon` (master only), `afmoe`, `bailingmoe3`, `dory` (nowhere), `flint`, `kolibri1` | 2.5 to 47 GB | Apache, OpenMDW | | Over the cap or the GPU quota, or unsupported |

## 4. Recommendation

Package in this order; each is the existing recipe shape (`Dollyfile-minicpm5-2b`, `models/minicpm5-2b.json`).

1. **`qwen3.5-4b`, one package, unsloth Q3_K_S (fallback UD-IQ3_XXS).** The only candidate that can change what Pi completes. Measure first on the host with the 48-task harness of `tasks/20261001-214000-pi-local-model` (both files, against Q4_K_M's 44/48 and IQ2_M's 19/48), then in Dolly: GPU MiB with f32 and f16 at 16,384, tokens/s in Chrome and Firefox. Cost: `Dollyfile-qwen3.5-4b` (three `SOURCE` parts for Q3_K_S, two for IQ3_XXS, the json, the existing `Qwen-LICENSE`, `cat`, `sha256sum`), `models/qwen3.5-4b.json` (the 2B's `pi` block, `gpu` from the measurement, the unsloth URL pinned to a revision hash), rows in `config/upstreams.json` (a Qwen3.5-4B row naming unsloth), `docs/licences.md:52` (add "GGUF by unsloth"), `config/domain-pages-images.txt`, `test/amy-browser.mjs:443`, the README list and table, and `demos/local-llm/test/local-llm-browser.mjs:35`, whose `second` is one model: make it a list or an environment choice so the third model is installed once with `/local` on a GPU display. `models.test.mjs` covers the description without change. Expect the build to need the 9 GB `bigbuild` slot (the kernel holds parts, joined file and capture, about three times 2.1 GB; inferred, the 1.56 GB package built in the normal slot) and the install test to exceed the 6 GB browser cap (measured 6.6-8.2 GB at 1.4-1.6 GB). If only the f16 figure fits, `unmet()` must come back from `21cc75b4^` (`tasks/20261013-143039-qwen-4b-out/TASK.md:75-79`).
2. **`qwen3.8-2b` (empero-ai Qwen3.8-2B-Distill Q4_K_M).** Cheapest to try: same architecture, template, sampling and memory as today's bundled model. Measure tool-call quality against Qwen3.5-2B on the loop task (8 of 8) and the four tasks (4 of 8); package only if it is not worse. If clearly better, it is a candidate to replace the bundled model in `Dollyfile-pi-local` (fits with 580 MB to spare), which is a `pi-local` and `dollyfile-studio` rebuild. Cost as above with two parts; the upstreams row must name both Empero and Qwen.
3. **`lfm2.5-2.6b`, only after the owner accepts the LFM Open License v1.0** with a new `docs/licences.md` row stating its conditions (attribution, licence text shipped, the commercial-use cap). Technically the best small tool-caller measured; its first WebGPU run (short convolutions, 8 attention layers) must be measured for speed and ops staying on the GPU. `pi.reasoning` false.
4. Nothing else now. Gemma 4 E2B returns when the core raises the 1 GiB per-buffer ceiling (`host/gpu/worker.mjs:15`) and `MAX_SOURCE_BYTES`; Nemotron-3-Nano-4B when a package may exceed 2 GiB. Both are core decisions, not recipes.

Each candidate's measurement follows the recorded method: host llama.cpp with Dolly's provider and prompt (tasks passed, loops, tool errors), then the in-image table (Chrome f32, Chrome with `--enable-dawn-features=vulkan_enable_f16_on_nvidia`, Firefox f16; `nvidia-smi` peak; `timings.predicted_per_second`).

## 5. Not found out

- Chromium's and Firefox's adapter `maxBufferSize` (no record; only that both accepted the 1 GiB ceiling).
- Any 3-bit or IQ kernel's speed or correctness on Dolly's WebGPU backend: supported by code, never run.
- GPU memory of any candidate in Dolly: all figures above except today's models and the measured 2026-10-06 rows are arithmetic.
- Tool-call quality of Qwen3.8-2B-Distill, of Qwen3.5-4B at 3 bits, and of LFM2.5 under WebGPU.
- The official Qwen GGUF repositories (gated); whether the Nanbeige loop doubles its KV cache; the unsloth and empero-ai revision hashes for pinning (the API gives them; not fetched).
- Build memory of a package above 1.6 GB (no record; the "about 9 GB" in the task header is the owner's).
- The licences were read as an engineer: whether LFM, NVIDIA or Llama terms suit this catalog is the owner's call.

### Critical Files for Implementation
- `/home/daug/dev/dolly/work/x11fix/demos/local-llm/Dollyfile-minicpm5-2b` (the recipe shape to copy: parts, `cat`, `sha256sum`, `EXPORTS FILE`)
- `/home/daug/dev/dolly/work/x11fix/demos/local-llm/models/qwen3.5-2b.json` (description shape: `source`, `files`, `gpu`, `pi` sampling for Qwen)
- `/home/daug/dev/dolly/work/x11fix/demos/local-llm/prepare-local-llm-weights.mjs` (stages any number of 1 GiB parts; no change expected)
- `/home/daug/dev/dolly/work/x11fix/demos/local-llm/test/local-llm-browser.mjs` (line 35: the single `second` model the GPU test installs)
- `/home/daug/dev/dolly/work/x11fix/config/upstreams.json`, `/home/daug/dev/dolly/work/x11fix/docs/licences.md`, `/home/daug/dev/dolly/work/x11fix/test/amy-browser.mjs`, `/home/daug/dev/dolly/work/x11fix/config/domain-pages-images.txt` (the rows every new package needs)