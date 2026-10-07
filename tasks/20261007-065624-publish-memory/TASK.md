# Packaging a release holds 25 GB in one process

- STATUS: CLOSED
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

## Findings (2026-10-07, branch `fix/publish-memory`)

Cause, read in `scripts/share-pages-snapshots.mjs` as of `main` (16bba105):
`shareSnapshots` read every snapshot whole with `readFile` and kept all of
them alive, because `identical` stored each record's `data`, a subarray view
of its snapshot buffer. `work/next/dist` holds 78 snapshots totalling 25.1 GB,
which is the 25,042,892 kB that was killed. Had it survived, `parts` then kept
every encoded pack a second time, and `mergeSnapshotRecords` rebuilt each
image whole (plus a decode) for the reconstruction check.

Fix (f6c914d9): each snapshot is read once, sequentially, through one 4 MB
chunk; the index keeps path, kind, size, file offset and content key per
record. Each pack is streamed from the source snapshot files through sha256
and `createGzip({ level: 6 })` to its file; every record is hashed again as it
is packed and must match its key, and each image's record count must be
covered by its packs. The structural checks `decodeSnapshotRecords` made
(sorted paths, directory parents) are left to the acceptance step, which still
decodes every merged image.

Measured, each run inside `systemd-run --user --scope -p MemoryMax=6G
-p MemorySwapMax=0 /usr/bin/time -v`, inputs read-only from `work/next/dist`:

| run | images | peak RSS | wall | output |
|---|---|---|---|---|
| old script, 19-image subset (269 MB) | 19 | 711,384 kB | 3.20 s | 81 packs, 52,702,582 B |
| new script, same subset | 19 | 143,740 kB | 3.29 s | `diff -r` against the old run: no differences |
| old script, full catalog (06:45) | 67 | 25,042,892 kB, killed | – | – |
| new script, full catalog | 67 | 221,548 kB | 3:27.5 (172 s user, 14 s sys) | 551 packs, 8,126,916,240 B |

The full run's 551 packs and 67 manifests are byte-identical to the sealed
release `work/next/build/next-releases/568c0ab3…/dist` packaged by the old
script from the same input this morning (`diff -rq` on `packs/`, `cmp` on
every manifest; log `build/publish-evidence/full-compare.log` in the
worktree). The integrator cherry-picked f6c914d9 into `integrate/round3`
(7992be73); round 3's acceptance check is the second proof.

Regression test (9d48c0e1, `test/snapshot-packs.test.mjs`): eight 32 MB
images of distinct content shared in a child process that reports its
`maxRSS`; it must stay below the 268 MB catalog. The old script peaks at
733,814,784 B on that catalog (measured), the new one passes; the whole file
runs in 1.5 s.

Not measured: the acceptance step. `publish-full.log` (07:56) has no timing
or memory lines, only `accepted IMAGE` per image. By reading
`scripts/site-release.mjs:116-134`, `accept` holds every decompressed pack of
an image plus the merged image plus its decode: about twice the largest image,
roughly 3.9 GB for `zero-ad` (1,930,813,751 B). `scripts/accept-release.mjs`
(the browser load) was not run.

Image builder, same whole-buffer pattern, read not measured (next task;
`tasks/20261006-145958-builder-artifact-copies` is not on `main`):
`src/runtime-worker.mjs:230` posts the whole encoded snapshot as one
transferred `copy.buffer` beside the Wasm memory that still holds the image;
`src/image-builder.mjs:40` resolves it whole and
`scripts/build-snapshot-browser.mjs:73` uploads that single buffer in chunks,
so the renderer holds the image at least twice while the Worker's memory
is alive; `scripts/build-system-snapshot.mjs:145-149` then reads the written
snapshot whole again in Node to decode and digest it.
