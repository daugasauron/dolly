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

## Progress (2026-10-01)

A no-change `npm run build:runtime` took 88 s: the staged headers, generated
constants, kernel module table and client archives got new mtimes every run,
so CMake recompiled the kernel and relinked the in-Dolly compiler and Zig.
Each is now replaced only when its bytes change: 23 s, with identical runtime
and image-input hashes. Batching the fixture, process-object and client
compiles, and the 18 DSO fixtures, into single container launches (48 -> 7)
brings it to 9 s. Remaining: the `dist/` outputs deleted before every link.
