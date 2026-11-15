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

## Done when

Packaging a domain release and exporting it for Pages each add no more than the bytes that differ
from what is already on disk, measured on a full release.
