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

## Lessons

(filled in at the end)
