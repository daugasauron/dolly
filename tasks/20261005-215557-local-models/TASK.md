# Local models as packages: more models, per-model setup, configuration from Pi

- STATUS: OPEN
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
