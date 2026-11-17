# The release round lives in work/: its tests and verdict are outside the repository

- STATUS: OPEN
- PRIORITY: 250
- TAGS: audit,repo,release,tests,0.1.8

## State (2026-11-17): fixed on `ws/release`; 0.1.8's round confirms it

`scripts/round.sh` is the round (`ee2bb0a9a`, `e92e65771`); docs/deployment.md's step 1 names it,
and the release checklist's step 1 stops unless `round.sh verdict` passes on HEAD (`df6a9389a`).

- Its stages are `day-round.sh`'s: `seed` (runtime, Rust and Go seeds, the runtime again, source
  staging and both pin passes), `images` (the catalog and its pins, again until they hold, three
  passes at most), `compiler` (`pin-seed-compiler.mjs`: a fixed point is an unchanged
  `DOLLY_SEED_COMPILER_SHA256`; a URL moved to the new version is committed), `lint`, `suites`
  (source, artifacts, `test/browser-tests.mjs chromium firefox`, `demos/run-browser-tests.mjs` with
  no list) and `gpu`. `round.sh FIRST LAST` runs a part. A stage commits the pins it changed, and
  stops, naming them, on any other change.
- The verdict is the stages' exit statuses: a stage that passes writes the commits it started and
  ended on to `build/round/STAGE.passed`, and `round.sh verdict` passes when the six chain to HEAD
  with the tree clean. No log is grepped and no failure excepted. Each stage's minutes are printed.
- The GPU stage runs both runners' `--display=$DOLLY_GPU_DISPLAY --lock=$DOLLY_GPU_LOCK`
  (`fe88a4b3a`): the core's two hardware tests once per browser, and the 12 demo tests of the
  runner's `display` map (the four Godot display tests, both PhotoCraft tests, local-llm, Mojo,
  slopyard, Xonotic, 0ad-graphics, 0ad-menu), one at a time, each under flock(1). The suite skips
  them, each printed with its need, and runs every other demo test, zero-ad's headless ones
  among them. local-llm exits 77 without a display where it exited 0; 0ad-menu runs Chrome by
  default, as Firefox draws no WebGPU canvas on Xvfb (`2f2da604b`). Each file's exit status
  follows its output (`6c205ebd4`), so the log names every test it ran.
- What stays in `work/` is a call with the machine's lines:
  `systemd-run --user --unit dolly-round-018 -p MemoryMax=36G -p MemorySwapMax=0
  --setenv=PATH="$PATH" --setenv=HOME="$HOME" --setenv=DOLLY_GPU_DISPLAY=:148
  --setenv=DOLLY_GPU_LOCK=/home/daug/dev/dolly/work/.slots/gpu.lock --working-directory=TREE
  bash scripts/round.sh` (and `DOLLY_IMAGE_JOBS` if the builder's own choice is not wanted).

Checked in the branch's tree (scripts and logs under `build/ws/`): `round.sh lint lint` passed
and wrote its record; `round.sh verdict` refused a missing stage and a chain a commit broke, and
passed a whole chain (stand-in records); `commit_pins` committed pin changes and refused one beyond
them (`commit-pins-test.sh`). The demos runner over stand-ins of all 59 demo tests' names
(`fake-demos.sh`) started 45 without `DISPLAY` (the caller's `:1` removed) and skipped 14 with
their needs, and in `--display` ran the 12 with `DISPLAY=:148` under the lock. On 0.1.7's images
(a worktree at `b09b1e243` with this branch's test files, `build/ws/v017`): the GPU stage's two
commands, `test/browser-tests.mjs --display=:148 --lock=…` (gpu-render and gpu-explicit in Chrome and
Firefox, the two that the load ran out of time passing alone: `tasks/20261116-140017-repo-04`) and
`demos/run-browser-tests.mjs --display=:148 --lock=… zero-ad` (0ad-graphics and 0ad-menu in Chrome,
"2 passed", 12 min); the suite on zero-ad, never run by a round, "6 passed, 3 skipped" with their
needs (0ad-enet, -engine, -multiplayer, -openal, -shaders, -spidermonkey); the suite's Xonotic,
the software path alone, in 100.8 s where its whole run took 513.7 s; and the npm test on 0.1.7's
published tarballs, the checklist's step 3, in both browsers.

What only the round can confirm: `scripts/round.sh` run unchanged from `seed` to `gpu` on 0.1.8,
every stage passing, `round.sh verdict` on its last commit, its log naming every `*-browser.mjs`.

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
