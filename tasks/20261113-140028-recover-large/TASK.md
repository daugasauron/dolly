# Recover files refuses a save over 2 GiB

- STATUS: OPEN
- PRIORITY: 300
- TAGS: bug,sessions,snapshots,0.1.6

Found by `20261113-221000-session-audit`.

## State (2026-11-13)

Filed; nothing done. Measured in Chrome 138 on `fix/sessions`.

A save holds up to 8 GiB, but file recovery reads the whole save into one buffer of at most
2 GiB (`decodeSessionSnapshot`, `src/session-store.mjs`), writes it to `/tmp` and has
`session-recover` decode it whole (`dolly_session_decode`, `src/session-records.h`). Since
format 4 a save is the whole filesystem, so an image of 1.5 GiB with half a gibibyte of work is
already past it.

## Reproduce

1. Open `/system/`, `dd if=/dev/zero of=/workspace/huge bs=1048576 count=2100`, save as `huge`.
2. Make the save one of another build, as a candidate repackaged with a kernel change leaves it:
   in the page, `saveStoredSession({ ...await loadStoredSession("huge"), name: "huge-old",
   buildId: "sha256:" + "0".repeat(64) })` (`/src/session-store.mjs`).
3. `/sessions/`, Recover files on `huge-old`.

The page fails with `Dolly session exceeds its size limit`; the user's files are in the browser
and nothing opens them.

## Direction

Recovery streams the save as a restore does: the page hands the kernel the save a transfer
range at a time (`dolly_session_restore_write`) with a prefix to restore under and the paths to
take, or `session-recover` reads records from a stream. `session-recover` is in the seed
(`src/commands`), so its change goes with a seed round.

## Done when

The steps above recover `/workspace/recovered-huge-old/workspace/huge`, in a test.
