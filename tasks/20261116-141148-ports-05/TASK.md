# Demos' source pins and licence records live in the core's config: 159 of 186 pinned components only demos read, while five demos keep their own

- STATUS: OPEN
- PRIORITY: 100
- TAGS: audit,ports,demo,cleanup,0.1.8

## State (2026-11-16 night audit)

Measured by reading; nothing changed. A move of pins changes no staged byte, so no image
rebuilds for it.

## What

AGENTS.md: "Each demo owns its recipes, sources, staging hook, tests and docs in
`demos/DEMO/`." The upstream versions, URLs and digests of nearly every demo are in the core's
`config/source-pins.sh` (772 lines), and their licence records in the core's
`config/upstreams.json` (234 entries):

- Of the 186 components `source-pins.sh` pins (`DOLLY_NAME_*`), 159 are read by no file outside
  `demos/` (0AD, GODOT, MOJO, MODULAR, WINE, XONOTIC, LEAN, OCAML, about 30 X.Org libraries
  and clients, the Python wheels, ...); 27 are read by the core (AWK, CURL, GIT, GHOSTTY, LLVM,
  SEED, ZIG, ZLIB, ...; a name search that errs towards the core: TREE and CMAKE match words).
  Script and output: `work/audit-1116-evidence/ports/pin-components.sh`, `pin-components.txt`.
- `scripts/fetch-pinned-checkout.sh:10-12,41-42` names demo sources in its cases (`raylib`,
  `box3d`, `cpython`, `modular`, `mojo-llvm`, `quickjs`), so a demo's new Git source edits a
  core script.
- At the same time five demos keep pins of their own, as JSON, TSV or a `sha256sum` list:
  `demos/rust/config/sources.json` and `demos/rust/toolchain/bootstrap-sources.json`,
  `demos/photocraft/config/sources.json`, `demos/codex/config/codex-git.json`,
  `demos/zero-ad/build-sources.tsv`, and `demos/wine/mspaint.sha256`.
- Coupling it costs: `demos/zero-ad/prepare-build-sources.sh:7` keys its 1.4 GB extraction
  (`build/generated/zero-ad-build-KEY`) on the whole `config/source-pins.sh`, so a pin change of
  any demo prepares 0 A.D.'s build sources again. `source-pins.sh` had 61 commits from
  2026-10-16 to 2026-11-16, for single demos (Godot, SCons, rclone, ...) as well as the seed.

## Smallest fix

Each demo's pins move to one file in its directory (`demos/DEMO/source-pins.sh`), which the
fetch scripts source after the core's through a generic hook, as `prepare-image-sources.sh`
already runs every `demos/*/prepare-sources.sh`; its licence records move to
`demos/DEMO/upstreams.json`, read by `scripts/upstreams.mjs` beside the core's; and
`fetch-pinned-checkout.sh` takes a checkout's cache name and sparse paths from its pins instead of
a case list. The other per-demo formats become that one. `prepare-build-sources.sh` keys on
0 A.D.'s own pins.

## Done when

`config/source-pins.sh` and `config/upstreams.json` hold only components a core file reads,
`git grep -l -i 'raylib\|modular\|mojo' scripts/` finds nothing, and a fresh checkout still
stages every `dist/static` input of the full catalog with the digests its recipes pin
(`node scripts/update-recipe-pins.mjs --sources` changes no recipe).
