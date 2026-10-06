# Local models as packages: more models, per-model setup, configuration from Pi

- STATUS: CLOSED
- PRIORITY: 335
- TAGS: local-llm,packages,pi,studio,design

Owner (2026-10-06): "I also want you to add more local models as packages, I
want you to use fable to reflect on how to be able to use different local
models with different setups (parametrization etc) in the pi-local setup, use
amy to install them and have some better pi extensions for configuration. Test
this in playwright I want the local model experience for any user on a PC with
a decent GPU to be nice. Of course this should get added to the dollyfile
studio image as well."

State (release `2de39ded…`): `pi-local` bundles Qwen3.5-2B; `qwen3.5-800m`,
`qwen3.5-2b` and `minicpm5-2b` are packages; Qwen3.5-4B downloads on first use
because a package is an image and an image is capped at 2 GiB (decision on
`core/decisions`). A model's setup lives in `demos/local-llm/models.json` and
the provider (`local-model-provider.js`, `client.mjs`, `model.mjs`, `qwen.mjs`,
`minicpm.mjs`). `20261006-…-pi-local-loop` is open: Pi repeats its second tool
call forever with the bundled model.

## Work

1. Design first, recorded here: what differs between models and must be a
   parameter of the package rather than code in the provider (chat template,
   tool-call syntax, context length, sampling defaults, stop sequences,
   reasoning mode, quantisation, GPU memory, f16 or f32), where that
   description lives so `amy install MODEL` alone makes a model usable, and how
   a user changes a setting without editing files.
2. More models as packages, chosen by measurement on real tool-using tasks and
   by a licence that allows redistribution (each one in `config/upstreams.json`).
3. Configuration from inside Pi: an extension that lists installed and
   installable models with what each needs, switches model, shows and changes
   its parameters, and says plainly why a model cannot run on this adapter.
4. The same in `dollyfile-studio`.

## Done when

- A new user on a PC with a decent GPU reaches a working local agent, installs
  a second model with `amy`, switches to it and changes a parameter, without
  leaving Pi and without reading documentation; shown by Playwright in Chrome
  and Firefox on a hardware adapter, in `pi-local` and in `dollyfile-studio`.
- Adding a model is a recipe and its description; the provider names no model.
- Each packaged model completes a multi-step tool-using task; the numbers
  (tokens per second, GPU memory, tasks passed) are recorded here.

## Design (2026-10-06, before any code)

One sentence: the model's own files and the two upstreams already in the image
describe a model; Dolly adds one small description file per package and deletes
its hand-written copies of what upstream knows.

### What was read and measured first

- Today a model is one row of `models.json` plus code: `format` selects a
  hand-ported chat template and tool-call parser (`qwen.mjs`, `minicpm.mjs`,
  157 lines, two fixtures), and the provider sends temperature 0.2 and top-p
  0.9 to every model while `main.cpp` fixes top-k at 20. A new family is new
  code in the provider.
- The GGUF already carries most of it: `tokenizer.chat_template` (7,755 and
  9,060 characters), the special tokens, the trained context
  (`*.context_length`: 262,144 and 131,072) and, where the publisher set
  them, `general.sampling.*` (MiniCPM5: temp 1, top-p 0.95, which Dolly
  overrides with 0.2 and 0.9 today).
- The pinned llama.cpp (`093a2f86`) reads all of that itself: `common/chat.h`
  renders the embedded template with its own Jinja engine, derives the
  tool-call grammar and parser from the template, and
  `common_init_from_params` applies the GGUF's sampling defaults. Measured
  natively (`build/local-models-evidence/probe.cpp`): for both packaged
  families its rendering of the fixture conversation is byte-identical to the
  hand-written one, it yields a lazy tool-call grammar, and it parses a
  Qwen `<function=…>` call and a MiniCPM `<function name=…>` CDATA call into
  the same OpenAI tool calls. Dolly builds `llama` with
  `LLAMA_BUILD_COMMON OFF`, so none of it is in the image.
- Pi 1.0.3 already has the per-model and per-user vocabulary
  (`packages/ai/src/types.ts`, `docs/models.md`): a model definition holds
  `contextWindow`, `maxTokens`, `reasoning`, `thinkingLevelMap`,
  `compat.thinkingFormat` (`qwen-chat-template` sends
  `chat_template_kwargs.enable_thinking`), `samplingParams` and
  `samplingParamsByThinkingLevel` ("llama.cpp … `top_p`, `top_k`, `min_p`");
  `~/.pi/agent/models.json` `modelOverrides` changes any of them for an
  extension's model; `/model` and `/thinking` choose and save the model and
  the thinking level; and its OpenAI chat-completions adapter takes a `fetch`
  (`ProviderRequestOptions.fetch`), which is how its own llama.cpp provider
  talks to `llama-server`. Janis's `Response` accepts a `ReadableStream` body.
- `gpu@0` grants 4 GiB of buffers in total and 1 GiB per buffer. Weights, KV
  cache and scratch all count, so the largest loadable GGUF is about 3 GB
  (Qwen3.5-4B, 3.01 GB, fits only with an f16 KV cache). A 7 to 9B model at
  Q4 (4.6 to 5.5 GB) cannot load whatever the card has; "decent GPU" here means
  models of at most about 4.5 GB of GPU memory. The quota is the core's.
- Qwen3.5 is a hybrid (`qwen35.ssm.*`): its recurrent state cannot roll back,
  so a turn whose prompt diverges inside the cached prefix re-evaluates from
  an empty context.

### Decisions

1. **The engine speaks llama-server's chat-completions dialect over its pipe.**
   `dolly-llama` links llama's `common` chat and sampling code. A request line
   is the body `llama-server` accepts at `/v1/chat/completions` (`messages`,
   `tools`, `max_tokens`, `temperature`, `top_p`, `top_k`, `min_p`,
   `repeat_penalty`, `presence_penalty`, `frequency_penalty`, `seed`,
   `chat_template_kwargs`); the reply is the chunk stream it sends. The model's
   template, its tool-call syntax, how results return to it, its stop tokens
   and its thinking switch come from its GGUF through llama's code. A field the
   engine does not implement is an error naming it, not ignored.
2. **Pi consumes it with its own adapter.** The provider hands Pi's
   `openai-completions` implementation a `fetch` bound to the engine's pipe.
   Message conversion, tool-call assembly, thinking blocks and usage are then
   Pi's, as for any llama.cpp server. The provider keeps only: start, stop and
   restart the engine, and report progress.
3. **A model package carries `/usr/share/dolly/llm/ID.json` beside its
   weights**, and the provider lists that directory; it names no model. The
   file holds what no upstream file knows, all measured here: display name,
   the weight files with their sizes (one, or llama's own shards), the
   packages that install them, the source pin and licence, GPU memory per
   shader path at the default context (`"gpu": {"f16": 2.1, "f32": 2.3}`; a
   missing path means it does not fit the 4 GiB), and `pi`: a Pi model
   definition passed through unread (default context that fits, output limit,
   reasoning switch, the publisher's sampling where the GGUF has none). The
   same file in `demos/local-llm/models/` drives the host-side weights
   staging; the image ships every description of its release, so a model that
   is not installed can still be listed with its size and memory. Installed
   means its weight files are present with the described sizes.
4. **A model above 2 GiB is the shard packages already decided**
   (`20261005-214159-large-packages`): its description lists the shard files
   and `"packages": ["qwen3.5-4b-1", …]`; the engine loads the first shard.
   The first-use download and `/run/dolly-llm` go.
5. **A user's settings are Pi's own files, changed from Pi.** Which model:
   `/model` (Ctrl+S saves). Reasoning: `/thinking`. Temperature, top-p, top-k,
   min-p, penalties, context and output limit: `modelOverrides` for the
   provider in `~/.pi/agent/models.json`, written by the extension. Nothing is
   stored per machine: adapter, shader path and buffer limit are what
   `dolly-llama --check` prints each time.
6. **One command in Pi, `/local`**, over those files and `amy`: every model
   with weight size, GPU memory and state (active, installed, installable, or
   the requirement this adapter misses); choosing an installable one runs
   `amy install PACKAGES` and switches to it; choosing an installed one
   switches; a parameters row shows each value against its default and takes
   a new one; an adapter row; unload. A shell user or an agent does the same
   with `amy`, `cat` and `dolly-llama --check`. A model that cannot run says
   which requirement fails, before loading: "Qwen3.5-4B needs shader-f16 to
   fit gpu@0's 4 GiB; this adapter runs f32 shaders".
7. **Studio** stays `FROM pi-local`: it inherits engine, packages, provider
   and extension. Its copy of the Pi settings goes.
8. **More models** are chosen by measurement in the real image (tasks passed,
   tokens per second, GPU memory, Chrome and Firefox on NVIDIA). First
   candidates, all Apache-2.0 or MIT with GGUFs from the publisher, ggml-org
   or a well-known converter, all at most 3.1 GB: Qwen3.5-4B (shards),
   Granite 4.2 3B, Ministral 3 3B, SmolLM3 3B, Phi-4-mini, Gemma 4 E2B,
   MiniCPM5-1B. Excluded before measuring: LFM2.5 (`lfm1.0` licence), Gemma 4
   E4B, Granite 4.2 8B and Qwen3.5-9B (over the quota).

### Deleted

`models.json`, `qwen.mjs`, `minicpm.mjs`, their two fixtures and the template
tests, the `format` key and table, the provider's message conversion, tool-tag
hold-back and event mapping, `main.cpp`'s tokenizer and sampler chain, the
download path in `model.mjs` with `curl` and `sha256sum` as image
requirements, `/local-unload`, Studio's duplicate settings.

### Added

llama's `common` chat sources in `llama-build`; the chat loop in `main.cpp`;
`models/ID.json` and a recipe per model; shard staging with upstream's
`gguf-split`; `/local`.

### Rejected

- A Dolly description of templates or tool syntax (a `format` per family, or a
  template file per package): the GGUF has it and llama reads it.
- A Dolly settings file or command for sampling: Pi's `modelOverrides` exists.
- Upstream's whole server core (`server-context`) behind the pipe: it would
  remove the engine's loop too, but it links multimodal input, MCP, built-in
  tools, cpp-httplib and a thread pool that nothing here uses.
- Fetching descriptions of uninstalled models at run time: a restricted
  embedding grants a session only the package service.

### The open loop bug (`fix/pi-local-loop`)

After this change a per-model behaviour has three homes: the GGUF template
(upstream), the description (`pi.compat`, sampling, context), and the engine's
prefix reuse in `main.cpp`. A rendering cause disappears with the hand-written
renderers; a cause in cache reuse is fixed in `main.cpp`; a context or
sampling cause is a line in the model's description. The provider's turn
handling is replaced last, after that agent reports.

### To measure during implementation

That llama's `common` chat sources compile and link with Dolly's `c++` (and
whether `log.cpp`'s worker thread needs `threads@0` in the engine), the build
time added to `llama-build`, and that Pi's adapter reads the engine's stream
through the pipe `fetch` under Janis.

## The loop's cause, forwarded 2026-10-06, and what it changes here

`fix/pi-local-loop` established that the transcript and the cache are correct
and the cause is sampling: temperature 0.2, top-p 0.9, no presence penalty and
the engine's fixed seed 42, so a self-similar context reproduces itself; and
nothing bounds identical repeated tool calls. Consequences in this design:

- **Sampling is per-model data in the description.** Checked what the files
  carry (`build/local-models-evidence/gguf-meta.mjs`): the MiniCPM5, Granite
  4.2 and Gemma 4 GGUFs hold `general.sampling.*` (temperature 1, top-p 0.95;
  Gemma also top-k 64), which llama's `common_init_from_params` applies, so
  their descriptions set nothing; the Qwen3.5 and Ministral GGUFs hold none,
  and their publishers' values exist only in the model cards, so those go in
  `pi.samplingParams`. The inherited 0.2/0.9 is not carried over.
- **The seed is llama's default**, a fresh one per request
  (`std::random_device`): the engine builds a sampler per request and sets a
  seed only when the request names one. Measured natively: two equal unseeded
  requests differ, two with `"seed": 7` are identical. A user pins one as
  `seed` in `modelOverrides`.
- **The repeat bound's home is a `tool_call` handler in the provider
  extension** (Pi's hook to block a call with a reason the model reads): with
  Pi's adapter doing the stream, the provider has no stream code to hold it.

## Implementation (2026-10-06)

Measured while building, all on the RTX 5070 under `Xvfb :134`:

- llama's `common` chat and sampling sources compile and link with Dolly's
  `c++` without changes (`llama-build` 294 s instead of ~190 s; the engine
  links without `-pthread`: common's logger is silenced with
  `common_log_set_verbosity_thold(-1)` so its worker thread never starts,
  and llama and ggml keep logging to stderr). The engine in the image: an
  agent turn costs 0.3 ms of sampling and 0.2 ms of parsing per token.
- Pi 1.0.3's `openai-completions` adapter runs over the pipe `fetch` under
  Janis: tool calls, tool results, `reasoning_content` thinking blocks
  (replayed into the next request), per-level sampling and usage all arrive
  as for a llama.cpp server. The real `pi-local` in Chrome on NVIDIA
  completed a five-call task with the bundled 2B on the first try.
- `gguf-split --split --split-max-size 1G` on the 4B is byte-identical across
  runs and gives four shards of 994.7, 996.2, 983.0 and 39.0 MB, each one
  `SOURCE` of a package `qwen3.5-4b-1` to `-4`; curl brings a 1 GB shard
  into a session in 6.6 s, and llama loads the model from the first.
- A selective `npm run image` regenerates `dist/dolly-packages.txt` for the
  selected images only, so `amy install` in a test needs every package in
  one `DOLLY_BUILD_IMAGES` selection; a recipe edit after a build makes the
  checkout server refuse to start until the rebuild.
- GPU memory of a model just unloaded is released lazily: the peak of a page
  that starts the 2B engine eight times in a row is 4.3-5.5 GB, not 2.2, and
  two browsers on one card made the 4B fail with "out of GPU memory" (the
  message now names the model's need and context).
- Qwen3.5's recurrent state: a checkpoint (`common_prompt_checkpoint`,
  `LLAMA_STATE_SEQ_FLAGS_PARTIAL_ONLY`, 19 MiB for the 0.8B) taken where
  each user message's prompt ends lets the next user message reuse
  everything before it; greedy output after the restore equals a fresh
  context (native). The engine keeps two.

### Candidates

All Apache-2.0 with publisher or ggml-org GGUFs, judged under `gpu@0`'s
4 GiB of buffers and 1 GiB per buffer at 16,384 tokens of context (Pi's
Dolly prompt is 2.2k tokens and `pi-local` compacts at 4,096 reserved, so a
smaller context is not usable):

| Candidate | Weights | KV cache at 16k, f16 / f32 | Verdict |
| --- | ---: | ---: | --- |
| Gemma 4 E2B (ggml-org Q4_0) | 2.84 GB | small (sliding window) | out: `per_layer_token_embd.weight` is 1,260 MiB, over the 1 GiB a buffer and a `SOURCE` hold |
| Granite 4.2 3B (IBM Q4_K_M) | 2.24 GB | 1.3 / 2.7 GB | runs with f16 only (3.57 GB peak); 4 of 12 tasks; prefill 165-200 tokens/s |
| Ministral 3 3B (Mistral Q4_K_M) | 2.15 GB | 1.7 / 3.5 GB | runs with f16 only; 2 of 4 tasks (second round pending); prefill 160-180 tokens/s |
| Qwen3.5-4B (bartowski Q4_K_M) | 3.01 GB | 0.4 / 1.0 GB | f16 only; 3 of 4 valid tasks; packaged as four shards |
| Phi-4-mini (MIT), MiniCPM5-1B | 2.49, 0.69 GB | 2.1 / 4.2 GB; small | not measured: Phi's KV cache does not fit at 16k; the 1B adds nothing over the 0.8B |
| LFM2.5-2.6B, Qwen3.5-9B, Granite 4.2 8B, Gemma 4 E4B | | | out: `lfm1.0` licence; 5.0-5.5 GB weights |

Four tasks, each checked by a script in the image (fix a C division by zero
and rebuild; find a definition as path:line; write and build FizzBuzz; edit
a JSON config), run by `pi -p` with Dolly's prompt and tools, thinking off.
The 3B candidates pass no more than the bundled 2B (which passed 8 of 13 at
the old sampling and 7 of 14 at the publisher's), need f16 (not Chrome on
NVIDIA under Linux) and prefill three to four times slower, so they are
measured, not packaged: by this evidence a user gains nothing over the 2B
except on an f16 adapter, where the 4B is the one to install.

### Departures from the design, with reasons

- `/local` names the shader kind, not the adapter: `gpu@0`'s open reply gives
  the guest the label `WebGPU`, never the adapter's name; the page's GPU
  indicator shows it. `dolly-llama --check` prints `{"ready":true,"shaders":…}`.
- The repeat bound (loop findings above) is a `tool_call` handler: the third
  identical consecutive call is blocked with a reason the model reads, the
  fourth also ends the turn (`terminate`), Pi's own mechanism.
- The engine keeps two recurrent-state checkpoints so that a new user message
  does not re-evaluate the whole conversation on Qwen3.5 (above).
- `pi-local` sets `defaultThinkingLevel` to `off`: the descriptions declare
  reasoning, and Pi's default level is `medium`.

## Merge and verification (2026-10-06, second agent)

The merge of `integrate/1005-seed` (`b6008122`, the loop fix) is `cc9ba278`.
The fix edited code this branch had replaced; its intent now lives here: the
repeat bound is the provider's `tool_call` handler, unchanged; the multi-turn
`pi -p` proof is in the `pi-local` part of the browser test; sampling is in
each description (Qwen3.5) or GGUF (MiniCPM5: the engine logs `temperature
1.00`); the seed is llama's fresh one unless the request names one (the engine
proof asserts two unseeded requests differ). One difference, measured: the fix
penalised presence over the whole response, llama's sampler over its last 64
tokens. On the fix's own task (list, write `hello.c`, compile, run, report;
`pi -p`, fresh session per trial) the bundled 2B completes 8 of 8 in Chrome in
11-13 s with llama's window and no run is stopped by the bound, as with the
fix (8 of 8), so llama's default stays.

Verified on the release line's seed: image inputs `047fc328…`, runtime
`5439ebe7…` after `npm run build:runtime` on the merged kernel. The branch
changes nothing outside `demos/local-llm/`, `demos/studio/`, `config/` (two
lists), `docs/licences.md` and `demos/README.md`.

### Models offered

Qwen3.5-0.8B is no longer a package: it completed 0 of 4 runs of the loop
task and ignored the repeat notice (`20261005-215204-pi-local-loop`) and 1 of
4 of the four tasks here, so `/local` must not offer it as an agent, and
nothing else used it.

NVIDIA RTX 5070, driver 580, Chrome 151 and Firefox 156 under `Xvfb :135`, one
browser on the card at a time, thinking off, 16,384 tokens of context. "Task"
is the loop task above; "four tasks" are the previous section's, two rounds.
GPU memory is the browser's peak in `nvidia-smi` after one run from a fresh
page (later runs in the same page read higher: memory of an engine that
exited is released lazily).

| Model | Shaders | Browser | Task | Seconds a run | Tokens/s | Prefill tokens/s | GPU MiB | Four tasks |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Qwen3.5-2B | f32 | Chrome | 8 of 8 | 11-13 | 63 | 610 | 2,235 | 4 of 8 |
| Qwen3.5-2B | f16 | Chrome + flag | 2 of 2 | 13-16 | 65 | 585 | 2,037 | |
| Qwen3.5-2B | f16 | Firefox | 4 of 4 | 99-115 | 5.0 | 120 | 2,057 | |
| MiniCPM5-2B | f32 | Chrome | 8 of 8 | 14-26 | 61 | 240 | 3,324 | 6 of 8 |
| MiniCPM5-2B | f16 | Chrome + flag | 1 of 2 | 16-23 | 59 | 320 | 2,357 | |
| MiniCPM5-2B | f16 | Firefox | 4 of 4 | 74-99 | 5.0 | 77 | 2,650 | |
| Qwen3.5-4B | f16 | Chrome + flag | 8 of 8 | 18-31 | 49 | 250 | 3,873 | 3 of 4 |
| Qwen3.5-4B | f16 | Firefox | not run (below) | | 4.8 | | | |
| Qwen3.5-4B | f32 | Chrome | refused before loading: "Qwen3.5-4B needs shader-f16 to fit the 4 GiB of GPU buffers Dolly grants, and this GPU adapter runs f32 shaders" | | | | | |

"Chrome + flag" is `--enable-dawn-features=vulkan_enable_f16_on_nvidia`.
Firefox generates 5 tokens/s whatever the model (its 100 ms GPU timer). The
descriptions' `gpu` values are Chrome's, in GB rounded up: 2B 2.1 / 2.3,
MiniCPM5 2.4 / 3.4 (its f16 figure was a copy of the f32 one), 4B 3.9.
`amy install` from the local server: MiniCPM5 10-12 s, the 4B's four packages
17 s.

More models: under 4 GiB of buffers at 16k of context nothing measured beats
these three (Candidates above); a larger model needs a larger `gpu@0` quota,
which is the core's.

### The user's path, by Playwright

`demos/local-llm/test/local-llm-browser.mjs`, keyboard only once Pi is up:
boot, a two-tool task with the bundled model, `/local` (rows asserted: the
bundled model in use, the second not installed), choose the second model,
confirm `amy install`, wait for "Using …", `/local`, Parameters, temperature
0.35, the task again on the second model, then in the shell: the packages are
in `amy installed`, the override is in `~/.pi/agent/models.json` and the
engine's log shows `temperature 0.35`; no request leaves the origin. The
second model is the most capable the adapter loads: MiniCPM5-2B on f32
(Chrome), Qwen3.5-4B on f16 (Firefox). In `pi-local` it first runs the
engine proof (reuse, cancel, restart, refused field, unseeded requests
differ), the multi-turn `pi -p` proof and a session save, restore and fresh
boot.

| Image | Browser, second model | Build | Result |
| --- | --- | --- | --- |
| `pi-local` | Chrome f32, MiniCPM5-2B | final | passed 19:23; `pi -p` proof on the first attempt, 26 s, 5 tool calls |
| `pi-local` | Firefox f16, Qwen3.5-4B (four packages) | before the last `/local` edit | passed 18:28; `pi -p` proof on the first attempt, 114 s, 6 tool calls |
| `dollyfile-studio` | Chrome f32, MiniCPM5-2B | final | passed 19:14 |
| `dollyfile-studio` | Firefox f16, Qwen3.5-4B | final | passed 19:18 |

"Final" is the build of 19:09 (rows without the redundant name, one `amy
install` per package with its number in the status line, f16 memory figures,
the corrected memory message); before it `pi-local` also passed in Chrome
(18:20) and Studio in Chrome (18:54). Logs and screenshots:
`build/local-models-evidence/final-*.log`, `llm-browser-*-2.log`,
`build/llm-proof/*.png`. Also on the final build: `npm run -s test:source`
358 of 358, `npm run -s lint:dollyfiles` 64 recipes,
`node test/core-browser.mjs chromium firefox` passed (40 s, 49 s).

Skipped when the machine ran short of memory during the seed round's catalog
build (integrator's instruction, 19:19): the Firefox runs of the loop task on
the 4B (so no "of 4" figure; it completed the test's two-tool task in Firefox
in both images at 4.8 tokens/s) and `pi-local` in Firefox on the final build
(Studio, which is `FROM pi-local`, ran the same provider there).

Prompt reuse across user messages, Qwen3.5-2B in Chrome, three messages in one
Pi session (`s-two.mjs`): the first request of the second message reuses
1,555 of 1,714 prompt tokens and of the third 1,707 of 1,861, from the
checkpoint at the previous user message; tool turns reuse all but 19-25.

### Context size (`20261006-093051-local-context-size`)

Already a parameter: `pi.contextWindow` in the description, replaced by
`modelOverrides.ID.contextWindow`, which `/local` → Parameters writes; the
engine is started with it and restarts at the next prompt when it changes.
Measured with the 2B in Chrome f32. Through `/local` on the final build
(`s-ctx.mjs`): the row reads `contextWindow = 32768 (shipped: 16384)`, Pi's
footer `5.2%/33k (auto)`, so its window and compaction threshold follow, and a
task completes at 2,730 MiB against 2,245. Through the override file:
32,768 completes the loop task; 131,072 fails at load with "Dolly WebGPU: out
of GPU memory (the device's, or gpu@0's 4 GiB)". The message then named the
default context's memory as if it were this one's; the corrected wording is
in the final build and was not triggered again. Not done for that task: a refusal before loading
(needs the memory per context token in the description), a bound at the
trained context, and Pi's compaction settings (`reserveTokens` 4096,
`keepRecentTokens` 6144, sized for 16k) following a smaller context; the
parameter accepts 1,024 and up.

### Left

- Firefox: the loop task on the 4B, and `pi-local`'s flow on the final build.
- The seed round (`integrate/seed-1006`): `REQUIRES HOST runtime@0` in this
  demo's recipes (new here: `Dollyfile-qwen3.5-4b-1` to `-4`), and the rebuild
  of the model packages, `pi-local` and `dollyfile-studio` there.
- More models: blocked by `gpu@0`'s 4 GiB, not by packaging.
- Context size: the three items above, and a restart of Pi with the override
  (it is a file Pi reads at start; not shown).

## Closed 2026-10-07

`work/local-models` (`2579350b`) is in the candidate; the four shard recipes
carry `REQUIRES HOST runtime@0`; the model packages, `pi-local` and
`dollyfile-studio` were rebuilt in the main round's catalog (67 images). The
done-when against the evidence:

- The user's path by Playwright: on the branch, `pi-local` and
  `dollyfile-studio` in Chrome (f32, MiniCPM5-2B) and Firefox (f16, the 4B
  as four packages), table above. On the candidate, `pi-local` passed in
  both browsers on the RTX 5070 (`work/next/build/next-evidence/gpu-local-llm-rerun.log`:
  engine proof, the agent task, session save and restore, `/local`, the
  second model installed with `amy`, temperature 0.35, the task again, no
  request leaving the origin). The `dollyfile-studio` half of that test did
  not run on the candidate: the run was cut by the 06:58 runtime rebuild
  ("runtime identity is stale") and the first run stopped earlier in Firefox
  on a terminal-selection timeout (`20261001-095000-terminal-text-flake`).
  Studio is `FROM pi-local` and ships the same provider; its demo suite
  passed on the candidate (`finish.log`).
- Adding a model is a recipe and `/usr/share/dolly/llm/ID.json`; the
  provider lists that directory and names no model.
- Each packaged model's numbers are in the table ("Models offered").

Context size items are `20261006-093051-local-context-size`. From
`20261005-214159-large-packages` (closed into this task): the bullet "during
the install the kernel holds the installed shards plus one shard's artifact
at most" was not measured; `amy` fetches, installs and unlinks one package's
artifact before the next (`src/commands/amy.c`, `unlink(path)` after each
`dollyfile install`), which is what it rests on.
