# Give pi-local a model worth using

- STATUS: CLOSED
- PRIORITY: 190
- TAGS: pi,local-llm,demo,audit

Owner request (2026-10-01): the bundled local model is too weak to be
interesting; audit `pi-local` and upgrade to a better (likely larger) model.
Addition: one image per usable Qwen size plus the best open model of another
family ("Jev, or whatever equivalent open-source version"), each holding only
its weights, license and an export naming it, so `amy install MODEL` can pull
it later; `pi-local` bundles one as its default and can use any of them.

## Decision

- **Bundled default: Qwen3.5-2B Q4_K_M (1.40 GB)**, package `qwen35-2b`
  (`qwen3.5-2b` under DOLLY 6). It is the best Qwen that fits: `pi-local` is
  1,645,936,634 bytes of the 2 GiB image limit, and Studio, built on it, adds
  ~36 MB. Same family and prompt format as the recommended upgrade. MiniCPM5-2B
  scored higher on the Dolly path (23/48 against 15/48, not significant at this
  size) but prefills at 285 instead of 630 tokens/s and looped more (11 against
  4); both failed the real-Pi checks in Chrome below.
- **Recommended for real work: Qwen3.5-4B Q4_K_M (3.01 GB)**: 44/48 coding tasks
  against 15-23/48 for every 2B-class model. It cannot be an image (2 GiB limit;
  the 1.95 GB IQ2_M quant that would fit solves 19/48), so Pi downloads it on
  first use (`/model`), verified, into volatile `/run/dolly-llm`.
- **Other family: MiniCPM5-2B Q4_K_M (1.56 GB, Apache-2.0)**, package
  `minicpm5-2b`. Highest of the open 2B-class models on the Dolly path (23/48),
  newest (2026-09) and small enough for a package. "Jev" is TypeSafe's closed
  System-1 decision model (no weights); its open equivalents (Kev, LitJev, von,
  Laya) return typed choices/scores, not text or tool calls, so none can drive
  Pi.
- Dropped: Qwen3.5-0.8B (4/18 host tasks, loops), Qwen3.5-9B (6.2 GB, over the
  4 GiB GPU quota), Gemma 4 E2B (3.1 GB), Nanbeige4.2-3B (2.68 GB, not
  evaluated), Qwen3-4B-Instruct-2507 (2.50 GB, 3/11), granite-4.2-3b (2.24 GB;
  prefill 133 tokens/s), LFM2.5-2.6B (LFM Open License, not open source),
  SmolLM3-3B (never called a tool), Ministral-3-3B (2.15 GB, 12/18).

## Measurements

### Tool use with real Pi 0.84.4 (host, NVIDIA RTX 5070, CUDA llama.cpp b11320)

Six coding tasks in a scratch directory, each checked by a script: fix a C bug
and rebuild, find a definition (`path:line`), write and build a C program, edit
JSON config, rename a C function across files, fix code until a test passes;
plus two two-message tasks (ask, then fix/rename). Dolly's `SYSTEM.md` and
skill, temperature 0.2, top-p 0.9, top-k 20, thinking off, 16k context. A run
passes when the check passes and Pi finished on its own within 30 tool calls.
Q4_K_M unless noted.

Official templates through llama-server `--jinja` (grammar-constrained tool
calls), 6 tasks x 3 seeds:

| Model | Passed | Loops | Tool errors |
| --- | ---: | ---: | ---: |
| Qwen3.5-0.8B | 4/18 | 7 | 130 |
| Qwen3.5-2B | 8/18 | 2 | 23 |
| Qwen3.5-4B | 17/18 | 0 | 14 |
| MiniCPM5-2B | 11/18 | 4 | 75 |
| granite-4.2-3b | 11/18 | 1 | 34 |
| LFM2.5-2.6B | 12/18 | 0 | 16 |
| Ministral-3-3B | 12/18 | 1 | 85 |
| SmolLM3-3B | 0/18 | 0 | 0 |
| Qwen3-4B-Instruct-2507 | 3/11 | 0 | 15 |

Dolly's own provider and prompt rendering against llama-server `/completion`
(no grammar, as in the browser), 8 tasks x 6 seeds:

| Model, prompt | Passed | Loops | Tool errors |
| --- | ---: | ---: | ---: |
| Qwen3.5-4B, official template | 44/48 | 2 | 52 |
| Qwen3.5-4B, previous custom preamble | 41/48 | 5 | 125 |
| Qwen3.5-4B IQ2_M (1.95 GB), official | 19/48 | 3 | 53 |
| Qwen3.5-2B, official template | 15/48 | 4 | 62 |
| Qwen3.5-2B, previous custom preamble | 21/48 | 3 | 28 |
| MiniCPM5-2B, official template | 23/48 | 11 | 95 |

The template comparison is a wash overall (59 vs 62 of 96, opposite per model),
so the provider now renders each model's own template exactly. Keeping the
empty think block in earlier rounds (which would let the engine reuse the whole
conversation across user messages) scored the same on the two-message tasks
(10/12 vs 10/12 for 4B) but is not shipped; see Remaining.

### Chrome 151 on Xvfb :126 (RTX 5070 via Vulkan, Dolly runtime of 2026-10-01)

`perf-in-dolly`: a Janis script in `pi-local` that runs `dolly-llama` directly
with 16k context on a 3.6k-token ChatML prompt, then continues the conversation
as an agent turn would. No other GPU load; the machine was otherwise busy with
catalog builds. Downloads come from a local server through the HTTP broker.

| Model | Load | Prefill | Generation | Agent turn with reuse | GPU | Chrome RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Qwen3.5-2B (bundled) | 2.9 s | 630 tokens/s | 55 tokens/s | 139 ms | 2.0 GB | 3.8 GB |
| MiniCPM5-2B (+1.56 GB download, 11 s) | 2.3 s | 285 tokens/s | 48 tokens/s | 296 ms | 2.4 GB | 4.9 GB |
| Qwen3.5-4B (+3.0 GB download, 21 s) | 4.1 s | 265 tokens/s | 43 tokens/s | 263 ms | 3.9 GB | 6.9 GB |

"Agent turn" is the prompt time of the next request (3,933 tokens, 3,904 of them
reused). GPU is the Chrome GPU process from `nvidia-smi` (Dolly's quota is
4 GiB); RSS covers the whole Chrome process tree. The old bundled
Qwen3.5-0.8B with the old engine prefilled ~500 tokens/s (1,250 with 512-token
micro-batches) and generated ~40-62 tokens/s.

Real Pi (`pi -p`, Dolly's prompt, tools and Slop) inside `pi-local` in Chrome,
on `fix-c` and the two-message `two-step-fix`, checked inside Dolly:

| Model | Passed | First prompt | Later prompts evaluated | Generation |
| --- | ---: | ---: | --- | ---: |
| Qwen3.5-2B | 0/2 (fixed the bound, not the division) | 1,768 tokens, 2.6 s | 19-209 tokens; 2,031 at the second message | 55-62 tokens/s |
| MiniCPM5-2B | 0/2 (225 s of edits on one) | 1,714 tokens, 4.5 s | 19-572 tokens | 19-55 tokens/s |
| Qwen3.5-4B | 2/2 (106 s incl. download, 55 s) | 1,768 tokens, 6.1 s | 21-209 tokens; ~2,100 at the second message and once more | 14-33 tokens/s |

The second full evaluation in the 4B run is a tool call whose re-rendered text
differed from what the model generated; hybrid models cannot roll back, so it
re-evaluated from scratch.

Firefox 155 exposes `navigator.gpu` on Xvfb but returns no adapter (also with
the blocklist ignored, GPU sandbox off and forced WebGPU), so Firefox could not
be measured here; the display with a GPU is off limits for agents.

## Engine and provider audit

- **Prompt reuse.** `dolly-llama` cleared its context for every request, so each
  agent turn re-evaluated the whole conversation. It now keeps the previous
  request's matching token prefix (attention models roll back to the first
  difference; recurrent/hybrid models such as Qwen3.5 reuse only a full prefix).
  Agent turns then evaluate only the new tool result: 3,904 of 3,933 tokens
  reused, 139 ms instead of ~5.7 s for the 2B. Greedy outputs with reuse equal a
  fresh context (host check, Qwen3.5-0.8B and MiniCPM5).
- **Micro-batch** 64 → 512 tokens: prefill 1,250 instead of ~500 tokens/s for
  Qwen3.5-0.8B (+400 MB GPU).
- **Overflow** now reads "The request exceeds the available context size",
  which Pi recognises and answers by compacting; before, a long session failed
  every turn. Context is 16,384 (was 8,192) and `pi-local` sets compaction to
  reserve 4,096 and keep 6,144 tokens (Pi's 16,384 default reserve exceeded the
  whole old window).
- **Templates.** The Qwen request used a custom tool preamble, compact JSON and
  merged user turns. `qwen.mjs` and `minicpm.mjs` now render the GGUF's own
  template; tests compare them byte for byte with llama.cpp's rendering
  (`test/fixtures/*-template.json`). MiniCPM5's template as rendered by llama.cpp
  drops list parameters (Pi's `edits`); ours writes them as JSON.
- **Downloads.** Janis `fetch` moves ~11 MB/s, so a 3 GB model took minutes, and
  any file growing past 2 GiB aborts (filed as
  `20261002-010000-fs-file-growth-abort`). The provider now sizes the file first
  and lets `curl` write it through the inherited descriptor: 3.0 GB in 26.5 s
  from a local server, verified by `sha256sum` (~50 s for 3 GB).

## Images

| Image (DOLLY 6 name) | Holds | Snapshot |
| --- | --- | ---: |
| `qwen35-2b` (`PACKAGE qwen3.5-2b`) | `/usr/share/dolly/llm/qwen3.5-2b.gguf`, license, export `qwen3.5-2b` | 1,556,483,662 B |
| `minicpm5-2b` (`PACKAGE minicpm5-2b`) | `/usr/share/dolly/llm/minicpm5-2b.gguf`, license, export `minicpm5-2b` | 1,721,603,383 B |
| `pi-local` | Pi, `dolly-llama`, provider, the `qwen3.5-2b` package | 1,645,936,634 B |

DOLLY 5 has no `PACKAGE` and no dots in names: each package is `FROM
Dollyfile-system` (only for `cat`/`sha256sum`), and `pi-local` copies the two
package paths. The DOLLY 6 migration renames the files, makes them `PACKAGE`s
and turns the copy block into `INSTALL`. Weights are staged from the pinned
upstream GGUF as 1 GiB parts (the most one `SOURCE` accepts) and reassembled;
the recipe checks the upstream SHA-256.

## Verification

Implementation: `340616d` on `work/pi-local-model` (Studio pins and these notes
follow it).

- `DISPLAY=:126 DOLLY_LLM_BROWSERS=chromium node demos/local-llm/test/local-llm-browser.mjs`:
  passed with the new `pi-local` (bundled qwen3.5-2b: inference, process reuse,
  cancellation and restart, session save of 133,686 bytes without the weights,
  restore, fresh boot, no external requests).
- `npm run test:demos -- studio`: passed (42.6 s) on the rebuilt Studio
  (1,682,216,463 bytes, built on the new `pi-local`).
- `node --test 'test/*.test.mjs'`: 259 passed; `node --test
  demos/local-llm/test/local-model.test.mjs`: 3 passed (both templates equal
  llama.cpp's rendering; tool-call round trips); `npm run lint:dollyfiles`: 44
  recipes.
- Built in Dolly: `local-llm-build`, `qwen35-2b`, `minicpm5-2b`, `pi-local`,
  `dollyfile-studio`. Model package contents checked in their snapshot
  manifests.
- Engine reuse: on the host build of `main.cpp` (CPU llama.cpp at the pinned
  commit), greedy outputs after reuse equal a fresh context for Qwen3.5-0.8B
  (full-prefix reuse) and MiniCPM5 (continuation); a mid-prompt rollback on
  MiniCPM5 changed one late token, as batching changes rounding.

## Remaining

- Qwen3.5-4B has no package: an image holds at most 2 GiB and a Q4_K_M 4B is
  3.01 GB. Options: two packages of `llama-gguf-split` shards (llama.cpp loads
  the first and finds the rest), or a larger image bound. Until then Pi
  downloads it per tab (HTTP cache permitting) and verifies 3 GB with
  `sha256sum` (~50 s).
- Hybrid Qwen3.5 cannot roll back its recurrent state, so each new user message
  re-evaluates the whole conversation (the template drops the previous round's
  empty think blocks): ~630 tokens/s for the 2B, ~200 for the 4B. Either keep
  those blocks (measured no worse, 10/12 vs 10/12 on two-message tasks, but off
  the model's template) or checkpoint the recurrent state at the last user
  message as llama-server does (`llama_state_seq_*_ext` with
  `LLAMA_STATE_SEQ_FLAGS_PARTIAL_ONLY`).
- Firefox measurements need a display with a GPU.
- The kernel abort on file growth past 2 GiB:
  `20261002-010000-fs-file-growth-abort`.
