# Duplicate and dead build scripts and images

- STATUS: OPEN
- PRIORITY: 120
- TAGS: build,cleanup

12 `fetch-*.sh` scripts beside generic `fetch-pinned-{archive,source,checkout}`;
`scripts/test-site-release.mjs` has no references; `samurai-unit-dolly.c` is unused;
`openal-build` and `audio-sdk` images have no dependents (0 A.D. builds OpenAL separately in
`toolchain/0ad/openal.sh`); `Dollyfile-rts-*`/game SDK coupling in `prepare-image-sources.sh`
(`88-145`, `317-389`, `536-545`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Only referenced scripts and images remain.

## Done when

- Unreferenced scripts/images removed or given a consumer; plan still resolves all images.
