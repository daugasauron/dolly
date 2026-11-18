# release-checklist.sh drops the npm test's log and prints 25 errors in a passing run

- STATUS: CLOSED
- PRIORITY: 60
- TAGS: audit,repo,release,tests,0.1.8

## State (2026-11-17)

Closed: see the closing section.

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

## Closed (2026-11-17)

Fixed on `ws/release` (`df6a9389a`):

- Step 3 tests the tarballs it packs to publish: `DOLLY_NPM_PACKS=build/npm-vX.Y.Z node
  test/npm-browser.mjs` (the test copies those in place of packing the checkout's, then runs
  itself offline as before), its output in `build/npm-vX.Y.Z.log`, which the stop names. It is
  the release's one run of the test beside the browser suite's (`tasks/20261116-140603-buildtime-04`).
- Step 2 reads the 16 KiB after a PEM header with one `dd` read (`iflag=skip_bytes bs=16384
  count=1`), which the pipe holds whole before awk can stop reading it: no broken pipe.

Evidence (the branch's tree, `build/ws/`): step 2's loop over 0.1.7's 230 snapshots (`scan.sh`)
read 25 PEM blocks, each listed in `config/public-test-keys.txt`, and printed no error line (58 s);
each block's digest by `dd` equals the old `tail | head` one (`dolly-go-system.snapshot`, three
blocks). The npm step on 0.1.7's published tarballs (`DOLLY_NPM_PACKS=work/round1113/build/npm-v0.1.7`, read
only, in a worktree at `b09b1e243`): "npm packages: chromium passed in 877.0s", "firefox passed in
832.8s", "requests beyond the machine: none" (`build/ws/logs/npm-packs-v017.log`, at load 48).
