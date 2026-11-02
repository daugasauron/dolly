# integrate/day-candidate: the day's branches merged and tested

- STATUS: OPEN
- PRIORITY: 200
- TAGS: integration

The day round's integration candidate, built in `work/proc-mem` on 2026-11-02 so the
integrator can merge one tested branch into `integrate/2026-11-02` when the round ends.
Evidence: `work/proc-mem/build/candidate-evidence/` (not committed).

## Merged, in order, onto `integrate/2026-11-02` = `fa949c1b`

| Branch | Head merged | Notes |
| --- | --- | --- |
| `integrate/html` | `d9fe83a3` | html@0 bridge on fix/boundary-hang `41c6a754` |
| `core/process-memory` | `761d0cb8` | |
| `fix/abort-own-definition` | `762433c7` | seed: libc `abort` weak again |
| `core/docs-audit` | `1cb873dd` | seed: tar reads pax archives without a path record; `docs/embedding.md` by hand |
| `demo/workaround-removal` | `d7294ff8` | built on core/docs-audit |
| `demo/lean-3` | `bdb49d4b` | |
| `core/stream-capture` | `14b36c24` | the commit, not the head: `5952d104` and `3dbf32ba` are proposals and stay out |

Image inputs: `a58af3f9…` on the base, `fe5261db7b3f17f6d24332acbd6adcfe2efd438c2fcd8ded1617d8a98601739c`
on the candidate (the two seed changes above). Source suite after the merges: 468 pass, 0 fail.

## How the recipes were merged

`work/integrate-merge.sh` takes the branch's side of a recipe conflict and repins. That
dropped integrate/html's recipe content: `core/process-memory`'s pin rows conflicted with
html's `REQUIRES HOST html@0` rows in twelve recipes and the docs recipe's
`dolly-html-0.wat` SOURCE, and the branch's side had none of them (found by running the
script's own CHECK for every branch against the integrate base; the script checks only the
branches of one invocation, and the first invocation stopped at `docs/embedding.md`).
The candidate was rebuilt from `fa949c1b` with `build/candidate-evidence/merge-chain.sh`:
a recipe conflict is merged three-way with the recipe pins zeroed (`work/merge-recipes.py`;
`work/merge-recipes2.py` for the docs recipe, whose SOURCE pins are document digests) and
repinned. Result: 0 CHECK lines for the seven refs.

Three staged-source pins were changed by more than one branch, so no side was right:
pi-dolly's `SYSTEM.md` (html) and `dolly-skill.md` (docs-audit), studio's `studio.tar`
(three branches). They are pinned from the merged sources in `fb57526b` (`studio.tar` by
`scripts/build-source-tar.mjs`, deterministic); `prepare-image-sources.sh` refreshes them
on a build of those images anyway.

### Added after round 1 (12:33)

- Cherry-picks from `fix/video-findings`, code and skill files only, as the integrator asked
  (`4f6e1ace` -> `2fdb9ac7` Janis's pump drains what a child wrote; `88f27845` -> `6e777d4e`
  studio's skill). Their recipe hunks were made on another seed: janis.js's SOURCE pin is the
  file's digest, studio.tar's the deterministic tar over the merged sources, the rest
  `update-recipe-pins.mjs`. Left out as the owner's call: `ab51b690`, `588a5ebd`, `8f3a9d49`
  (terminal VMIN 0 in `include/dolly/runtime.h`, a process-contract change).
- The branches that moved since the morning merge: `demo/workaround-removal` `6f343fbb`
  (Mojo's llvm-wait.patch goes) and `demo/lean-3` `49bdc352` (its merge of
  core/process-memory, already in the candidate, and a task note). Both merged clean, no
  seed input touched, image inputs still `fe5261db…`, source suite 468 pass.

`docs/embedding.md`: html's package rows (the `html` module in the host list and in
pi-minimal's modules) with docs-audit's description of `amy` in the default image.

## Builds and tests

- `DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=default,system npm run image` (build slot, 6G):
  12:02 to 12:23, `default,system ready in 1255.5s`; the build left no pin changes, so the
  pins committed above are the staged sources' pins. Hard-link check: 0.
- `pi-dolly` is not built: its closure holds `rust-build` (ripgrep, fd), a hugebuild image
  that the seed change invalidates and that only the integrator builds.

Round 1 on `fb57526b` (default,system built), 12:23 to 12:33, one browser slot per browser,
logs `build/candidate-evidence/NAME-BROWSER.log`:

| Test | Chromium | Firefox |
| --- | --- | --- |
| core-browser | pass, 49 s | pass, 114 s |
| process-browser | pass, 78 s | pass, 91 s |
| threads-browser | pass, 35 s | pass, 50 s |
| boundary-browser | pass, 4 s | pass, 7 s |
| memory-growth-notify-browser | pass, 5 s | pass, 8 s |
| process-memory-browser | pass, 81 s | pass, 86 s |
| html-browser | no run: catalog lacks `html` | no run: catalog lacks `html` |
| shell-browser | pass, 16 s | pass, 15 s |
| image-browser | pass, 88 s | pass, 104 s |
| custom-session-browser | pass, 86 s | pass, 90 s |
| session-offline-browser | pass, 9 s | pass, 6 s |

html-browser composes `system` with the `html` package (`composed(["html"], ["html"], { base:
"system" })`), which the default,system build does not include: `composed` fails on the
catalog entry (`reading 'dollyfile'`) before a browser opens. Not a merge fault; `html` is
built in round 2 below.

Round 2 on `393b5c4b` (the cherry-picks and the moved branches above): `DOLLY_BUILD_IMAGES=
default,system,html npm run image` 12:35, `ready in 8.3s` (default and system cached, html
built; its snapshot carries image inputs `fe5261db…`). Logs `NAME-BROWSER-2.log`:

| Test | Chromium | Firefox |
| --- | --- | --- |
| html-browser | pass, 13 s | pass, 16 s |
| core-browser | pass, 28 s | pass, 40 s |

Round 3 on `393b5c4b`: `DOLLY_BUILD_IMAGES=default,system,html,typescript npm run image` 12:38,
`ready in 64.3s` (quickjs, janis with the cherry-picked pump, typescript). The javascript
demo's browser test (`DOLLY_BROWSER=BROWSER node demos/javascript/test/javascript-browser.mjs`,
image `typescript`): Chromium pass, 36.5 s; Firefox pass, 43.6 s. `janis-install-browser` is
not run: its closure holds cmake-build.

Round 4 on `393b5c4b`: the remaining core browser tests whose images a small build gives
(`DOLLY_BUILD_IMAGES=default,system,html,typescript,dolly-docs,libdolly-sockets,libdolly-audio,
libdolly-microphone,libdolly-touch,zig,stack-wrap`, 12:42, `ready in 46.9s`). Left out: amy
(every PACKAGE row), dso, gpu-indicator, gpu-render (libdolly-gpu, a GPU). Logs `NAME-BROWSER-4.log`.
Run 12:44 to 12:53, one slot per browser:

| Test | Chromium | Firefox |
| --- | --- | --- |
| cpp | pass, 15 s | pass, 18 s |
| default | no run: narrowed catalog (below) | same |
| display | pass, 16 s | pass, 17 s |
| display-cursor | pass, 10 s | pass, 11 s |
| docs | pass, 5 s | pass, 6 s |
| embedding | pass, 4 s | pass, 6 s |
| ending | pass, 29 s | pass, 38 s |
| fs-growth | OOM at the 6 GB cap (below) | OOM at the 6 GB cap |
| host-compute | no run: needs libdolly-gpu | same |
| host-modules | pass, 38 s | pass, 46 s |
| image-inventory | pass, 9 s | pass, 12 s |
| indicators | pass, 6 s | pass, 7 s |
| man | pass, 12 s | pass, 20 s |
| memory-growth | pass, 9 s | pass, 10 s |
| microphone | pass, 23 s | pass, 28 s |
| network | pass, 31 s | pass, 38 s |
| npm | no run: dolly-build FROM pi-minimal, 404 on the narrowed catalog | same |
| pager | no run: `amy install less`, less not in the catalog; round 5 | same |
| pty | pass, 25 s | pass, 29 s |
| shell-env | pass, 7 s | pass, 8 s |
| site | pass, 5 s | pass, 7 s |
| slop | pass, 22 s | pass, 30 s |
| snapshot-stream | pass, 4 s | pass, 7 s |
| sockets | FAIL: integrate/html alone (below) | FAIL, the same |
| stack | pass, 11 s | pass, 23 s |
| terminal | pass, 34 s | pass, 34 s |
| touch | pass, 29 s | pass, 14 s |
| upload | pass, 15 s | pass, 16 s |
| audio | timeout, 120 s (rerun in round 5) | pass, 16 s |

- `default-browser` cannot run on a narrowed catalog: it reads the generated `amy-index.txt`
  (28 rows here, 136 in a full tree) and asserts the welcome text names only published
  packages; `python` is not in this catalog. Not a merge fault; the full catalog's run covers it.
- `sockets-browser` is a failure of `integrate/html` alone: its line 44 lists the kernel's
  imports by hand, and `d82f7474` (html@0, 2026-11-01 22:21) added `env.dolly_html_dispatch`
  to `dist/dolly.wasm` without adding it to the list. The html agent's sockets passes
  (`work/audit-host/build/audit-host-evidence/*.log`) are from 19:40, before that commit.
  Reported to its owner, not fixed here; the fix is that one entry.
- `fs-growth-browser` fills kernel memory to "most of 8 GiB" (its last steps): in a 6 GB
  browser slot the kernel's OOM killer took Chrome (anon RSS 5.99 GB, 12:45:31) and
  Firefox's content process (5.9 GB, 12:45:56), `journalctl -k`. No earlier evidence shows
  it passing inside a 6 GB slot (`rc-1031b` passed it in a 20G unit), so it is not a
  candidate finding; it needs the integrator's uncapped suite.
- `host-compute-browser` installs `libdolly-gpu` and declares gpu@0: left out with the GPU
  tests.

Round 5 on `393b5c4b`, 12:55 to 12:57: the build above plus `less` (`ready in 14.0s`), then
pager-browser Chromium pass 8 s, Firefox pass 11 s; audio-browser Chromium pass 12 s on its
rerun (the round-4 run hit the test's 120 s deadline with nothing else in its log; not
reproduced). Logs `NAME-BROWSER-5.log`.

Round 6 on `393b5c4b`, 12:58 to 13:30: the build above plus the tool recipes
demo/workaround-removal changed and zsh (`tar,sqlite,tree,vi,base64,lz4,dte,pigz,binaryen,zsh`;
cmake-build and tools-build in their closure), `ready in 1867.1s`, every image built. The
`function signature mismatch` in binaryen's log is its recipe's own check that an
un-emulated cast traps before `wasm-opt --fpcast-emu`. zsh-browser (image default):
Chromium pass 2 s, Firefox pass 3 s. The tool images have no browser tests; their builds,
with their recipes' checks, are the evidence.

### Stale tests fixed on the candidate (13:30 to 13:34, each in its own commit)

- `257b072b` the artifacts test's corePrograms table gets the `dollyfile` row (807338ce
  made the recipe engine a package; the round's artifacts suite found it; asked by the
  integrator).
- `840613ba` the same table gets the `html` row: integrate/html adds the package
  (`/usr/bin/html`) without the row, so "system snapshots are sealed to their visible
  recipe chain" fails on that branch alone. One row, like dollyfile's, so I added it.
- `7ed689e4` the same test declared the engine's program in amy (`amy: ["/bin/dollyfile"]`);
  since 807338ce amy is a package that INSTALLs dollyfile and holds none of its files, and
  the dollyfile package holds `/bin/dollyfile`. With the rows complete the test failed on
  `amy: /bin/dollyfile`; the declaration now names dollyfile. Test 17 passes
  (`artifacts-3.log`).
- `27ec48c0` amy-browser:135 and nena-browser:136 ran `rm` on an artifact that
  `dollyfile install` consumes since 749d57c99 (asked by the integrator); they assert
  `test ! -e` instead. amy-browser:160's `rm -r /etc/dolly/artifacts` stays: the engine
  unlinks only an installed artifact (`src/dollyfile.c` `load_artifact`, `result == 0 &&
  last`) and never the directory, so after the refused `older` install the directory holds
  that artifact.

`npm run -s test:artifacts` on this catalog (`artifacts-1.log`, before the html and
declared fixes): 23 pass, 2 fail: test 17 (above, now passing) and "dist registers every
image of the catalog" (50 of 193: this tree's catalog is narrowed; the full catalog's run
covers it). Source suite after the fixes: 468 pass.

Round 7 on `27ec48c0`, 13:34 to 13:36, logs `NAME-BROWSER-7.log`: nena-browser Chromium
pass 43 s, Firefox pass 47 s, so its changed line (the engine's `dollyfile install URL SHA`,
then `test ! -e` on the artifact) holds in both browsers. amy-browser stops at its line 111,
`amy install python`: python is not in this catalog. Its changed line 135 runs the same
engine command as nena's; the full catalog's run reaches it.

Round 8 on `27ec48c0`, 13:36 to 13:42: the build above plus `python` (`ready in 171.9s`), so
the welcome text's three packages are in the catalog. default-browser: Chromium pass 60 s
(its three tests), Firefox pass 107 s. amy-browser now passes its line 135 and stops at 156:
the second `dollyfile install` of `needs`, meant to show a recorded row is not installed
twice, finds no artifact (the first install consumed it, 749d57c99): a third stale step of
the same commit, reached only once 135 was fixed. `4ad9a862` places the artifact again
before that install; amy-browser rerun in both browsers below (`amy-BROWSER-9.log`).

## Lessons

(filled in at the end)
