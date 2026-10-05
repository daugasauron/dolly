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
