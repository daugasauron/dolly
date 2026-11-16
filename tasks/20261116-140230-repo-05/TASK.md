# release-checklist.sh drops the npm test's log and prints 25 errors in a passing run

- STATUS: OPEN
- PRIORITY: 60
- TAGS: audit,repo,release,tests,0.1.8

## State (2026-11-16)

Filed by the repo audit; nothing done. The checklist's npm test packs its own tarballs instead of
testing those it publishes, and the release runs that test four times. Both are
`tasks/20261116-140603-buildtime-04`, measured there. What is left here is the checklist's output.

## Found

- Step 3 runs `node test/npm-browser.mjs > /dev/null` (`scripts/release-checklist.sh:64`). A failure
  leaves only "the npm packages do not boot" and no log of which page, browser or package failed.
  The release's other evidence goes to `build/release-X.Y.Z-evidence/`, and this run's does not.
- Step 2 printed 25 `tail: error writing 'standard output': Broken pipe` lines in 0.1.7's passing run
  (`work/round1113/build/release-0.1.7-evidence/checklist.log`). They come from
  `tail -c +N SNAPSHOT | head -c 16384` under `set +o pipefail` (`:47`): `head` closes the pipe once
  it has its bytes. A real error in that step prints the same way.

## Do

- Step 3 writes the test's output to a log beside `build/npm-vX.Y.Z` and names the log when it
  stops.
- Step 2 reads the bytes after a PEM header without a broken pipe (`dd` with `skip` and `count`,
  or `tail`'s stderr discarded).

## Done when

A passing checklist prints no error line. A failing npm step names its log.
