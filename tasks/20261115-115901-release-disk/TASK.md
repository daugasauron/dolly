# The release copies the 23 GB site twice: packaging and the Pages export filled the disk

- STATUS: OPEN
- PRIORITY: 220
- TAGS: release,disk,0.1.8

## State (2026-11-15)

The export's half is on `fix/pages-export` (`60198d522`, worktree `work/pagesfix`): a file Pages
stores whole is a hard link to the sealed release's own. Measured on 0.1.7's release: the same
file list and root rules as the copying export, 5 of 24 GB saved; the 1,002 snapshot parts and
compressed files (19.2 GB) are still written. Left: merge it, have `scripts/package-pages.sh`
link what it takes from `dist/`, and keep the parts from doubling.

## What happened

During 0.1.7's release (2026-11-15) the disk filled twice: the checklist's export wrote 24.2 GB
of single-link copies of `build/domain-releases-0.1.7/current` (10:41, 75 MB left, the npm
offline test failed with ENOSPC), and the demos page's repackaging staged a second 23 GB site
beside the current one (13:33, ENOSPC). `work/dedupe.py` on the release and the export, and
removing rebuildable staging, recovered both.

## The time the same copies take (build-time audit, 2026-11-16)

`scripts/share-pages-snapshots.mjs` writes every pack of the release again on each packaging:
it reads every image's snapshot from `dist/`, groups identical records, and gzips each pack at
level 6 into the staging directory. 0.1.7's domain release holds 2,294 packs, 18.97 GB raw and
11.80 GB compressed; Node's gzip at that level does 61-71 MB/s on snapshot bytes on this machine
(`work/audit-1116-evidence/buildtime/gzip-rate.txt`), so about 5 minutes of one core per
packaging for the gzip alone. Unchanged snapshots give the same packs (part 2 of 0.1.7 rebuilt none
and its compare found every file of the core the same bytes), so a pack whose digest the current
release already holds can be a hard link to that release's file instead of a new gzip: the time and
the disk are the same fix. 0.1.6 to 0.1.7: 1,854
of the 2,294 packs were the same (`new-packs-016-017.txt`). The verification passes of the same
packaging are `tasks/20261116-140603-buildtime-03`.

## Done when

Packaging a domain release and exporting it for Pages each add no more than the bytes that differ
from what is already on disk, measured on a full release.
