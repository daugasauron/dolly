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
- Remaining: `custom.html` links the Studio route; `test/dolly.artifacts.mjs`
  keeps a per-image program map with demo names; `package.json` has
  `pi:census` and `build:rust-seed`.
