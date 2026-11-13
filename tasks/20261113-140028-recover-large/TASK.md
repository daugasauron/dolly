# Recover files refuses a save over 2 GiB

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: bug,sessions,snapshots,0.1.6

Found by `20261113-221000-session-audit`.

A save holds up to 8 GiB, but file recovery read the whole save into one buffer of at most
2 GiB (`decodeSessionSnapshot`, `src/session-store.mjs`), wrote it to `/tmp` and had
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

## Closed (2026-11-14)

Recovery streams the save as a restore does, with no seed change: the page names the new
directory and the paths to take (`/home`, `/workspace`) in the transfer range
(`dolly_session_recover_begin`, `dolly-snapshot-0.wat`) and hands the kernel the save a range at a
time; of its records the kernel makes the regular files and directories under those paths below
the directory, with their times, and passes over the rest. A failure removes the directory. No
buffer holds the save, so whatever saves recovers.

`session-recover` (`src/commands`, in the seed and in `system`) is no longer run by the page. It
stays in this release, whose seed is being built; it and `Dollyfile-session-recover`,
`dolly_session_decode` and `dolly_session_restore_delta` (`src/session-records.h`), its native test
`test/session-recovery.test.mjs` and its rows in `README.md` go at the next seed round.

Evidence: `test/session-large-file-browser.mjs` saves a session with a file of 2 GiB and 1 MiB,
stores it again as one of another build and opens it with Recover files:
`/workspace/recovered-NAME-old/workspace/large` has its size and its last bytes, in Chromium and
Firefox. `test/custom-session-browser.mjs` checks what recovery takes and skips, as before.
