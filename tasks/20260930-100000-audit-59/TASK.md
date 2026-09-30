# Orphan and broken browser tests

- STATUS: OPEN
- PRIORITY: 170
- TAGS: tests,cleanup

28 of 30 `test/*-browser.mjs` scripts are not wired to any runner (five referenced nowhere:
host-compute, host-modules, snapshot-stream, threads, slopyard-focus); 30 of 72 harness modes
are never run; `v3-iteration` (`test-browser.sh:58`) calls `prepareImageArtifacts('gamedev',
...)` (`browser-harness.mjs:4213`) though `Dollyfile-gamedev` was deleted;
`slopyard-browser.mjs:47` reads a missing `archive-designs.lua`; `test-browser.sh` was never run
in full. 46 `waitForTimeout`, 137 literal `mouse.click(x,y)`, 57 fixed delays; fixed port 19199
in `slopyard-agent-browser.mjs:7`. Two HTTP servers (harness and `test/browser-server.mjs`).
`abi/dolly-threads-0.wat` is checked only by the orphan threads script; `abi/dolly-host-0.wat`
has no test; no test reinstantiates the kernel/plugin module in one page.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Every browser script is either wired into a documented runner or deleted; broken modes fixed.

## Done when

- A single documented command runs all core browser scenarios; demo scenarios are runnable by
  name; no dead modes remain.
