# The release round lives in work/: its tests and verdict are outside the repository

- STATUS: OPEN
- PRIORITY: 250
- TAGS: audit,repo,release,tests,0.1.8

## State (2026-11-19): the 0.1.8 round is the script, run unchanged; no round has passed yet

`scripts/round.sh` (`ee2bb0a9a`, `e92e65771`, `fe88a4b3a`) is the round: its stages, the verdict
from their exit statuses, the GPU stage's display tests, the fixed point on the seeds' digests
(`00278430b`: C's, Rust's and Go's), and the release checklist's step 1 stops unless
`round.sh verdict` passes on HEAD.

0.1.8's rounds ran it unchanged: `dolly-round-018k` (`work/integrate-018`, 03:56 to 13:32 on
`30bd6c1bd`) was `bash scripts/round.sh` with the machine's lines alone (the unit,
`MemoryMax=36G`, `DOLLY_GPU_DISPLAY=:148`, `DOLLY_GPU_LOCK`), and its successor started at 13:33
on `ed564b9de`. No round script for 0.1.8 is in `work/`: what was written there since
17 November sets up trees (`setup-from.sh`, `setup-bare.sh`, `link-images.sh`, `disk.sh`).

018k (`build/round-018-k.log`; its stage logs kept in `work/rc-release/build/rehearse/round-018k/`):
seed 2 min, images 244 min in one pass, compiler 0 min (the three seeds a fixed point, their
URLs at v0.1.8), lint 0 min, suites FAILED in 127 min, gpu FAILED in 201 min. Its two logs list
every `*-browser.mjs` of `test/` and `demos/` (142; the three under `fixtures/` are not tests)
with its exit status, or skipped with its need, `0ad-large-match` among them ("run on demand").
What failed: `test/amy`, `test/dso`, `test/process-memory`, `demos/tools/amy`, `blender-gpu`,
`wine` (GIMP's display in Chromium), the artifact test "system snapshots are sealed to their
visible recipe chain"; in the GPU stage `godot-airtime` (snap Firefox never started: the test
launches it itself with its profile in `/tmp`, which the snap cannot read, where
`launchInstalledFirefox` of `test/browser.mjs` puts it under `build/`; `godot-flyover-touch`
launches it the same way), `godot-flyover` (Firefox), `godot-flyover-touch`, `photocraft-gpu`
and `slopyard`.

Done when a round passes: `round.sh verdict` on its last commit.

## Found

Step 1 of `docs/deployment.md` asks for "a green round on the commit (source, artifacts, browser
suites in both browsers, demos, GPU tests)", and `scripts/release-checklist.sh` checks none of it.
The round that 0.1.7's release relied on is defined only outside the repository. `work/day-round.sh`
(112 lines, headed "a copy of release-round.sh") runs the stages. `work/round-1117.sh` (80 lines)
sets the demo list, the pin passes, the GPU tests and the verdict. `work/release-0.1.7-chain3.sh`
(40 lines) accepts the known failures. Across 2026-10 and 2026-11, `work/` holds 62 round scripts
and 25 release scripts, 4,406 lines in all. 32 of them copy a `DOLLY_ROUND_DEMOS` list by hand.

This has measured costs on 0.1.7's round (`work/round1113/build/round-1117.log`, `round-1117-evidence/`):

- Tests in the repository that no stage ran. `demos/run-browser-tests.mjs` with no argument runs
  every demo. The round passes a list instead, and the list leaves out `zero-ad`, `photocraft` and
  `slopyard`. The GPU stage runs slopyard's one test, three of zero-ad's nine and one of
  photocraft's two. Never run: `0ad-enet`, `0ad-multiplayer`, `0ad-openal`, `0ad-shaders` and
  `0ad-menu` (`demos/zero-ad/test/`), `photocraft-x11-browser.mjs`, and `godot-flyover-browser.mjs`,
  which the demos suite skips as needing a display and the GPU stage does not run. That last one
  is the test of 0.1.7's Voxel Flyover showcase. None of the 32 lists in `work/` names `zero-ad`, and
  no round's evidence under `work/*/build/` holds a run of the four headless zero-ad tests.
  Run by the ports audit the same night on `work/round1113`'s dist (Chromium, one at a time, the
  display ones on `:148` under the GPU lock; logs `work/audit-1116-evidence/ports/unrun/`), all
  pass, so they still work: `0ad-enet` 5 s, `0ad-openal` 1 s, `0ad-shaders` 10 s,
  `0ad-multiplayer headless software` 130 s (it takes `[headless|visual|visual-client]
  [hardware|software]`, not a browser name), `0ad-menu chromium`, `photocraft-x11 chromium` (its
  window drew 21 s after the command) and `godot-flyover chromium` (60.0 fps, 1785 frames, 3
  beacons). In the installed Firefox `godot-flyover` passes too (53.2 fps), and `photocraft-x11`
  failed once: no xterm window reached the X frame before its 20-minute deadline closed the
  browser (`photocraft-x11-browser.mjs:59,69`; `photocraft-x11-browser-firefox.log`), while the
  round's `godot-x11` opens the same `x11-desktop` in Firefox; a second run passed (the window
  drew 25 s after the command; `photocraft-x11-browser-firefox-2.log`), so the first was a flake
  of that run, its cause not found. One test counts a partial run as passed: `demos/local-llm/test/local-llm-browser.mjs:28`
  exits 0 after "the model steps are skipped, they need a GPU window on DISPLAY", where the
  runner's convention for an unmet need is status 77 (`demos/run-browser-tests.mjs:12-13`); the
  demos suite printed it among the passes (`pi-local start screen: chromium passed`).
- No script in the repository runs a display test. `test/browser-tests.mjs:14` leaves out
  `gpu-render` and `gpu-explicit` ("need a hardware adapter on a display"), and
  `demos/run-browser-tests.mjs:21-30` skips the tests its `needs` map names. Only the GPU stage of
  a `work/` round runs them, from a list it writes itself.
- A verdict made by grepping the log, with hand-written exceptions. `round-1117.sh:74` drops every
  `gpu-explicit firefox` failure, which has failed in every round since 2026-11-13
  (`tasks/20261116-140017-repo-04`). `release-0.1.7-chain3.sh:18-24` accepts the demos suite's two
  display-less Godot failures (`tasks/20261115-115901-godot-display`) and a "NOT a fixed point" that
  was not real. The round's own check, `git diff --quiet -- config/source-pins.sh`
  (`round-1117.sh:49`), compares the whole file. `demos/llvm/pin-seed-compiler.mjs` rewrites
  `DOLLY_SEED_COMPILER_URL` to name the version being developed. So the first round after a version
  bump always reads "NOT a fixed point", though the digest (`c98f9ab6…`, v0.1.6's) did not change.
  The chain then had to commit the URL line after the round (`9c589654e`).
- Every round starts from a copy of the last one, so a fix to one copy is not in the next.
  `docs/gpu.md:116` says Firefox's snap needs `TMPDIR` under `$HOME`. `round-1117.sh` sets it for the
  Godot and PhotoCraft runs and not for `gpu-explicit`.

This departs from "Development iteration speed is king": the round is the release's gate, and
each one is rewritten by hand.

## Do

One round script in `scripts/` (its stages as `day-round.sh` has them: seed, images until the pins
hold, the fixed point, lint, suites, GPU tests), run by `docs/deployment.md`'s step 1:

- The demos suite runs every demo (no list). The display tests run in the GPU stage from the
  `needs` map of `demos/run-browser-tests.mjs`, with `DISPLAY`, `TMPDIR` and the GPU lock as
  arguments, so no display test is left out of both stages.
- The verdict is the exit status of each stage, with no log grep and no list of exceptions. A
  test that cannot pass here is fixed or removed.
- The fixed point compares `DOLLY_SEED_COMPILER_SHA256` alone.
- `work/` keeps only the machine's own lines: the unit, the memory cap, the tree, the display
  number.

## Done when

0.1.8's round is that script, run unchanged. Its log lists every `*-browser.mjs` of `test/` and
`demos/` as passed or skipped with a stated need. No round script for 0.1.8 is written in `work/`
beyond a call of it.
