# Image builds depend on the test harness; runtime builds are not incremental

- STATUS: OPEN
- PRIORITY: 160
- TAGS: iteration,build

`scripts/build-system-snapshot.mjs:68-90` spawns `test-browser.sh`, which requires
`google-chrome` (`test-browser.sh:6-13`) and runs the 6,145-line `browser-harness.mjs` in
`snapshot-export` mode; the README installs only Firefox (`README.md:54`). `scripts/build.sh`
makes about 40 `podman run --rm` calls, recompiles every object each run and reruns the
Emscripten sysroot build and file packager (`prepare-kernel-seed.sh:9-13`); 97-102 s per run.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`; timings from tasks codex-16/21/28.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Image building has its own small driver; runtime rebuilds skip unchanged work.

## Done when

- Image export does not load the test harness; a no-change `build:runtime` is measurably faster.
