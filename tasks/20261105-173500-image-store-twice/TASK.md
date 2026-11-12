# A page's origin-private storage holds every image it reads twice

- STATUS: OPEN
- PRIORITY: 100
- TAGS: browser,performance

The pack store (`src/pack-store.mjs`, `b3faca044`) keeps an image's packs as they are
downloaded, compressed, so that it starts again without a download. The image cache
(`src/image-artifact.mjs`, `095394c36`) writes the same image's snapshot, decoded, to a file
of the same storage as it streams out of those packs, because a Blob built from parts in
memory is unreadable in Chrome past 500 MiB. Both are new since v0.1.4.

Measured on 2026-11-05 (v0.1.5 candidate, Chromium, `scripts/accept-release.mjs` on
`dollyfile-studio`): 1.34 GB of packs plus the 1.67 GB snapshot file came to 3.1 GB of
origin-private storage before the build on the image had captured anything. In an
off-the-record context the capture then failed at 3.8 GB ("exceed its storage quota"); a
person's profile has room (the release acceptance now runs in one), but stores each image
twice.

Direction: one copy. The packs kept decoded, each a file, and an image's snapshot the Blob
of its pack files in order (a Blob of files is readable at any size); or the snapshot file
alone, with the packs it came from not kept.

## Tried (2026-11-12): the snapshot file alone

A build's read of a published image (`image-build.mjs`, whose image cache keeps it decoded) kept
no pack it downloaded and wrote no record (`openPackStore(image, packs, { keep: false })`, kept
packs still read). `pack-store-browser.mjs` with that case passed in Chromium and Firefox (and
failed on the old store), as did the image-input, custom-session and session tests; but
`image-browser.mjs` failed: building `system` reads the images its recipe names, which share
packs, and each shared pack was then downloaded once per image instead of once (at least 8 of
them). So that direction trades the shared packs' single download for storage. The other keeps
both: packs kept decoded, each a file, and the image cache's snapshot a Blob of an image's pack
files in order, with no file of its own. Not kept.

That other direction is not a Blob of files either: an image's snapshot is its packs' records
merged in path order (`packagedSystemSnapshot`, `joined`), which the artifact's digest covers and
the builder restores, not the packs one after another. Keeping one copy means the image cache
holding pack references and its reader merging them as `packagedSystemSnapshot` does, with the
digest checked over the merge.

A third: a published image is not entered in the image cache at all. `describeImageArtifact`
writes the merge to a file because a Blob of parts past 500 MiB is unreadable in Chrome; the
build keeps it for its own run and drops it after, and a later build merges the kept packs again
(no download, the merge's time each build). Custom and rebuilt images, which have no packs, stay
in the cache.

All three give up what `image-browser.mjs` asserts on purpose: a second build in the tab reads the
base's decoded payload from the cache ("a second build reads its cached payload only"), the
iteration loop's speed. Each costs a merge of the kept packs per build instead (gzip and the
record merge of, for `system`, its whole snapshot); measure that against the cached read before
choosing.

## Measured (2026-11-12)

`work/merge-cost.mjs` in the root: `default`'s snapshot (12.1 MiB, 4 packs), merged from kept
packs by `packagedSystemSnapshot` against the same bytes read back from an origin-private file:
Chromium 159 ms (76 MiB/s) against 4 ms (3,022 MiB/s); Firefox 198 ms (61 MiB/s) against 9 ms
(1,343 MiB/s). For `system`'s snapshot, about 1.6 GiB, a merge per build would be about 25 s
where the cache reads it in under one. Decided: the build keeps its decoded copy; the second copy
is the iteration loop's speed. What still halves the storage without that cost: after a build,
the packs of the images the cache now holds are not kept (a normal start of one of them
downloads them again, which a build image rarely has). Lowered to 100.

Done when an image read once occupies its snapshot's size (within the packs' framing), it
starts again without a download, and the image, session and acceptance browser tests pass
in Chromium and Firefox.
