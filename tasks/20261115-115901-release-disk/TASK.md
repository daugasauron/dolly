# The release copies the 23 GB site twice: packaging and the Pages export filled the disk

- STATUS: CLOSED
- PRIORITY: 220
- TAGS: release,disk,0.1.8

The export's half was `fix/pages-export` (`60198d522`): a file Pages stores whole is a hard link to
the sealed release's own. 5 of 24 GB saved; the 1,002 snapshot parts and compressed files
(19.2 GB) were still written.

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

## Closed (2026-11-17)

On `ws/speed` (`68dcecd52`), with `fix/pages-export` merged into its base. No image rebuilds.

- Packaging: the release's `dist/static/` sources are hard links to the checkout's (an image
  build replaces `dist/static` whole, `prepare-image-sources.sh`, and never writes one of its files
  in place), and its packs hard links to `dist/packs/`, the store: `share-pages-snapshots.mjs`
  hashes a pack's bytes first and links the store's file of that digest, from an image build or an
  earlier packaging, and gzips into the store only a pack it lacks. `RELEASES` must be on the
  checkout's filesystem (`docs/deployment.md`).
- The export links a part or compressed file whose digest a published version's
  `deployment.sha256` lists to that version's file; what it stores whole was already a link.
- What stays copied: the checkout's own files (pages, docs, recipes, the showcase's videos,
  0.76 GB), which a person edits in place: a link would change a sealed release with them.

Measured on a full release, 0.1.7's domain catalog packaged again with these scripts in a
checkout of `b09b1e243` with 0.1.7's images linked (`work/audit-1116-evidence/buildtime/fix-speed/`,
`package-run.log`, `package-run2.log`):

| | Bytes in files of one link | New packs in the store |
| --- | --- | --- |
| 0.1.7's packaging | 24.4 GB (every file copied or gzipped) | |
| run 1 | 0.76 GB | 560 packs, 100 MB, the site's that no image build had written |
| run 2 | 0.76 GB | none |
| 0.1.7's export of v0.1.7 | 19.2 GB of parts and compressed files | |
| the export, against an archive of v0.1.5 and v0.1.6 | 85 MB, both times (the rest links to v0.1.6's files and the release's) | |

The packs step alone, the two scripts back to back on the same snapshots (`share-compare.log`):
0.1.7's 567 s, 465 s of CPU and 11.8 GB written; this one's 253 s, 89 s of CPU, nothing written
(it ran first, on the colder cache). The disk's free space was no measure (other agents wrote
beside these runs all morning); the files' link counts are.
