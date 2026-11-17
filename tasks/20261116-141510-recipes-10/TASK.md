# pi-llm and pi-dolly both hold Pi's settings.json, so the order of two installs decides the model; pi-llm brings no Pi

- STATUS: OPEN
- PRIORITY: 150
- TAGS: audit,recipes,amy,local-llm,pi,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`).

## State (2026-11-17)

Fixed on `ws/recipes` (f66240630), as Do says: `Dollyfile-pi-llm` installs
`demos/pi/Dollyfile-pi-dolly` before llama and qwen3.5-2b, with pi-dolly's `REQUIRES HOST` lines
(`download@0`, `html@0`, `http@0`, `threads@0`, `upload@0`), so its own settings, which name the
`webgpu` provider, replace pi-dolly's in every order of installs, and Pi comes with it;
`Dollyfile-pi-local` drops its own pi-dolly row (pi-llm brings it) and its comment says so;
`demos/local-llm/README.md`'s line for pi-llm says "Pi with its provider". `npm run -s
lint:dollyfiles` passes (it checks an `INSTALL`'s host modules against the installer's).

Left for the 0.1.8 round: pi-dolly's Pi brings ripgrep and fd, built on the Rust chain, which this
tree does not rebuild; once built, in a fresh `default` session `amy install pi-llm` alone must
give `pi` and settings naming `webgpu`, and `amy install pi-dolly` afterwards must say it is
already installed. Rebuilds pi-llm and pi-local.

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
