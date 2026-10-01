# Duplicate and dead build scripts and images

- STATUS: CLOSED
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

## Progress (2026-10-01)

Deleted `scripts/test-site-release.mjs`: nothing referenced it and it failed
against the current release (it expected "snapshot identity mismatch" where
verification now reports "release image inputs mismatch" first). Tamper
detection is covered by `test/site-release.test.mjs` ("release seal covers
complete file contents, rejects changes and symlinks"). The `fetch-*.sh`
scripts are all referenced; `Dollyfile-openal-build` remains.

## Resolution (2026-10-01)

- `samurai-unit-dolly` is used by `modules/ninja.dm` and staged by
  `prepare-image-sources.sh`.
- `prepare-image-sources.sh` (198 lines) names no demo; demos stage their own
  inputs through `demos/DEMO/prepare-sources.sh` hooks.
- `audio-sdk` is the core image that carries `audio@0`, exercised by
  `test/audio-browser.mjs`.
- `openal-build` builds OpenAL inside Dolly from pinned source: the first
  in-sandbox piece of `20260930-231200-self-host-zero-ad`, kept for that task.
