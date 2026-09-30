# Demo code leaks into core files

- STATUS: OPEN
- PRIORITY: 140
- TAGS: core,demo,cleanup

`scripts/browser-harness.mjs` imports experiment fixtures and `src/rts/spectator/relay.mjs`
(`10-16`, `44`), has mode flags (`103-130`), special cases (`140`, `288`, `350-387`,
`1089-1116`, `1330-1423`) and ~550 lines of game scenarios (`1751-2297`). `index.html:63-178`
hand-lists experiment rows; `scripts/prepare-image-sources.sh` has ~100 lines of game
preparation; `test/dolly.artifacts.mjs` has 85 of 552 lines on experiments;
`test/dollyfile-v3.test.mjs:88-137` hard-codes experiment image lists;
`src/game-agent/mission.mjs:3` and `settings.mjs:3` import `src/rts/spectator/*` (removing RTS
breaks ClassiCube and bhop).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Core files contain no demo names; demos own their scenarios, preparation and tests.

## Done when

- `grep` for demo names in core files returns nothing; demos still build and pass their checks.

## Progress (2026-10-01)

- The legacy harness with its demo modes and fixtures is deleted; every demo owns
  its Playwright tests in `demos/NAME/test/`.
- `custom.html` no longer links the Studio route; the Rust seed build and the Pi
  census are run from their demos, not `package.json`.
- `test/dolly.artifacts.mjs` checks primary programs of core images only (and
  that the list covers every top-level Dollyfile), and that every ENTRY path is
  in the image. Pi tool, CPython and game SDK checks moved to
  `demos/{pi,python,slopyard}/test/*.artifacts.mjs`; 22 artifact tests pass.
- Remaining: `scripts/package-github-pages.mjs` and `test/site-release.test.mjs`
  name demo images for the published demo page.
