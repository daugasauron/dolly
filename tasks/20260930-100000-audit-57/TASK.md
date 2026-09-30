# Re-check serial-execution and bootstrap patches

- STATUS: OPEN
- PRIORITY: 90
- TAGS: build,demo,compatibility

About 8,500 lines of patches. Make, Samurai, fd, OpenAL and tokio are patched mainly to force
serial execution (fd-serial 475 lines rewrites the walker); `threads@0` now exists. 0 A.D.'s
`engine.patch` (2,782 lines) stores new files (`renderer/backend/dolly/Device.cpp` 1,076 lines,
`DollyControl.cpp` 204) as diff hunks. `patches/` holds one file while every other patch lives
in `config/` or `toolchain/`.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Each patch has a current reason; new files live as files.

## Done when

- Patch inventory recorded with a reason per patch; obsolete ones removed.
