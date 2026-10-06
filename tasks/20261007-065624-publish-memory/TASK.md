# Packaging a release holds 25 GB in one process

- STATUS: OPEN
- PRIORITY: 270
- TAGS: release,packaging,memory,iteration

Measured 2026-10-07 06:45 while packaging the night round's 67 images:
`scripts/share-pages-snapshots.mjs`, run by `scripts/package-pages.sh:79`,
reached 25,042,892 kB of anonymous memory and was killed by the 24 GB cap of
its scope (`journalctl -k`: "Memory cgroup out of memory: Killed process …
(node) … anon-rss:25042892kB"). On 2026-10-06 the same step held 17 GB with 61
images and, started beside a catalog build, took the owner's 60 GB desktop
from 19 GB free to 2 GB in two minutes; the machine had to be rebooted.

A release cannot be packaged on a 32 GB machine, and the cost grows with
every model package.

## Work

- Read what the script keeps: it should not need more than one snapshot (or
  one pack) in memory at a time. Find whether it reads every snapshot whole,
  keeps them all to find shared packs, or builds one large buffer.
- Make it stream: hash and compare by file or by pack, write as it goes.
  Measure peak memory before and after on the full catalog
  (`/usr/bin/time -v`), and the time.
- The acceptance step that follows (`scripts/accept-release.mjs`) loads the
  largest images in a browser; measure it separately.

## Done when

Packaging the full catalog peaks under 4 GB outside the browser, measured and
recorded here, and `docs/deployment.md` says what a release build needs.
