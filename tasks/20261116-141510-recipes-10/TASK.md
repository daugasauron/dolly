# pi-llm and pi-dolly both hold Pi's settings.json, so the order of two installs decides the model; pi-llm brings no Pi

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: audit,recipes,amy,local-llm,pi,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`).

## Closed (2026-11-19)

Redone on `fix/rc-recipes` (935e46c5b), with the Done-when as amended below: pi-local, not a
package, chooses the model. `demos/local-llm/test/local-llm-browser.mjs` on the rebuilt pi-local
(display `:155`, the hardware GPU) passed in Chromium and Firefox: the agent task with the bundled
Qwen3.5-2B (4 tool calls; 19.6 s and 42.2 s), inference, cancellation, session restore and a fresh
boot, then minicpm5-2b installed and chosen with `/local`, its temperature and context changed,
and the task again (`build/rc-recipes-evidence/pi-local-gpu.log` in `work/rc-recipes`). Its
snapshot holds the same files as the round's pi-local, byte for byte, but for the records under
`/etc/dolly` (one 2 MB pack of its 52 differs, in those alone).

## How (2026-11-19)

Redone on `fix/rc-recipes`. Since this was written, `feature/npm-policy` (in `integrate/0.1.8`,
527426654) made npm's template start Pi unconfigured, with no provider written for the user; the
workstream's brief keeps that for packages too: a package chooses no model. So the Done-when's
"settings naming the `webgpu` provider" become pi-local's, the application's:

- `demos/local-llm/Dollyfile-pi-llm` keeps pi-dolly's `INSTALL` (Pi comes with its provider) and
  drops its `settings.json` and its `qwen3.5-2b` row: it holds the provider, `dolly-llama` (by
  `llama`) and every model's description, which `/local` lists and installs. Snapshot 375,480 bytes.
- `demos/local-llm/Dollyfile-pi-local` installs `qwen3.5-2b`, the model it bundles, and writes Pi's
  settings that choose it (`webgpu`, `qwen3.5-2b`, thinking off, compaction within its 16,384-token
  context: pi-llm's former file). The README says which does what; `models.test.mjs` checks every
  model's description is pi-llm's.
- `demos/local-llm/test/amy-cases.json`: in a fresh `default` session `amy install pi-llm` reports
  under a megabyte of its own and gives `pi`, the provider and the descriptions, no weights and no
  provider in Pi's settings, and `amy install pi-dolly` afterwards says it is already installed.
  Passed on the 0.1.8 round's images with pi-llm and pi-local rebuilt, in Chromium (10.8 s) and
  Firefox (17.4 s); before, the same case fails (pi-llm brought the weights and the provider).
- No two packages hold `settings.json` now (`tasks/20261116-141510-recipes-14`). Rebuilds pi-llm
  and pi-local.

## Done on ws/recipes (2026-11-17)

Fixed on `ws/recipes` (f66240630), as Do says: `Dollyfile-pi-llm` installs
`demos/pi/Dollyfile-pi-dolly` before llama and qwen3.5-2b, with pi-dolly's `REQUIRES HOST` lines
(`download@0`, `html@0`, `http@0`, `threads@0`, `upload@0`), so its own settings, which name the
`webgpu` provider, replace pi-dolly's in every order of installs, and Pi comes with it;
`Dollyfile-pi-local` drops its own pi-dolly row (pi-llm brings it) and its comment says so;
`demos/local-llm/README.md`'s line for pi-llm says "Pi with its provider". `npm run -s
lint:dollyfiles` passes (it checks an `INSTALL`'s host modules against the installer's).

## Found

Both packages hold `/home/dolly/.pi/agent/settings.json`, with different contents
(`overlaps.txt`):

- `pi-dolly` (`demos/pi/Dollyfile-pi-dolly`): the theme, `shellPath`, `tuiMode`, no provider.
- `pi-llm` (`demos/local-llm/Dollyfile-pi-llm`): the same plus `"defaultProvider":"webgpu"`,
  `"defaultModel":"qwen3.5-2b"` and its compaction settings.

An install replaces a file the session holds, so the last of the two decides Pi's model.
`pi-local` installs `pi-dolly` (line 30) before `pi-llm` (line 35) and works. In a session,
`amy install pi-llm` installs `llama` and `qwen3.5-2b` and no Pi (its record names only those
two), so the natural next step, `amy install pi-dolly`, replaces pi-llm's settings with pi-dolly's
and Pi starts without the local provider as its default. The README describes pi-llm as "Pi's
provider for the models `dolly-llama` runs in the tab, with the bundled Qwen3.5-2B, which Pi's
settings choose" (`demos/local-llm/README.md:10`).

Evidence: `work/audit-1116-evidence/recipes/overlaps.txt`, `debug3.jsonl` (case `pi-dolly-settings`),
`run-big.jsonl` (case `pi-llm`: its files and record).

## Do

`Dollyfile-pi-llm`: `INSTALL` `demos/pi/Dollyfile-pi-dolly` first (a provider of Pi is installed
with Pi), with pi-dolly's `REQUIRES HOST` lines (`download@0`, `html@0`, `http@0`, `threads@0`,
`upload@0`), so its own settings always come after pi-dolly's; pi-local's own row for pi-dolly then
comes with it.

## Done when

In a fresh `default` session `amy install pi-llm` alone gives `pi` and settings naming the
`webgpu` provider, and `amy install pi-dolly` afterwards says it is already installed.
