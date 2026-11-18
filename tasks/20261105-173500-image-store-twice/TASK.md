# A page's origin-private storage holds every image it reads twice

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: browser,performance,0.1.8

## State (2026-11-18)

Done (`50123c983`, below): a build keeps each image it read once, decoded in the image cache, and
an image builder's Chrome profile holds only the build in progress. Nothing is left.

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

## The image builder's profiles (2026-11-17)

During the 0.1.8 round the image builder's Chrome profiles (`.cache/snapshot-browser-profile-N`,
one per concurrent build) grew to 11, 5, 4 and 10 GB; twice `/home` fell to 8-11 GB free, and
lean-std's build crashed once at the low point. Each slot ran all its builds in one persistent
profile, whose page kept every input it read (packs, the decoded snapshot, and the HTTP cache's
copy of the packs) and every image it built, bounded only by the image cache's 32 images and
8 GiB.

## Fix (2026-11-18, `50123c983`)

- `prepareImageArtifacts` (`site/image-build.mjs`), once it has read every input, passes the
  images the image cache now holds to `forgetImages` (`page/pack-store.mjs`): their records go,
  then every pack no record names, unless an image is being read on the origin (the next read
  to complete prunes them). A pack two inputs share is still downloaded once (the records go
  after the last read), and a pack an image the page started names stays. As decided on
  2026-11-12, a start of an image a build read downloads its packs again; a build reads it from
  the image cache without a download.
- `scripts/build-system-snapshot.mjs` empties a slot's profile before and after each build.
  `build-snapshot-browser.mjs` still keeps a profile it is given, which
  `verify-snapshot-reproducibility.mjs` needs to build warm after cold.

## Measured (2026-11-18)

Scripts and logs in `build/image-store/` of `work/infra`. A custom build FROM `pi-local`
(1,642 MB snapshot, 1,433 MB of packs) in a fresh persistent profile, `estimate().usage` after it:

| | Chrome 156 | Firefox 155 |
| --- | ---: | ---: |
| Before: packs 1,366.5 MiB + image cache 3,132.5 MiB | 4,499.0 MiB | 4,499.5 MiB |
| After: image cache 3,132.5 MiB, no pack | 3,132.5 MiB | 3,133.1 MiB |
| Profile on disk, before and after | 4,565 / 3,203 MiB | 4,647 / 3,280 MiB |

One slot building ten images in a row (`make zlib gzip core curl posix ninja pkgconf libffi
qwen3.5-2b`, `builder-slice.mjs`): with the profile kept it held 1,864 MiB after the ten
(1,817 MiB with the page's fix: the pack store's copies gone, the HTTP cache's 47.5 MiB not),
and grows with every build; emptied per build it holds nothing between builds and 1,526 MiB at
its peak (`qwen3.5-2b`: its input `system` and the 1,396 MB it built). `pkgconf` built through
`build-system-snapshot.mjs` came out byte-identical, its slot's profile gone after.

What it costs: a build no longer reads an input its slot read or built before from the cache.
Back to back (load 18-24 from other builds), the ten took 279.5 s with the profile kept and
341.2 s emptied, of which reading the inputs 37.6 s against 59.2 s: 1.6-2.0 s for a 130-150 MiB
input from the cache, 4.2-6.8 s from its packs, about 50 MiB/s more. In the 0.1.8 round a slot's
cache served 629 reads, 31.6 GiB (479 more came from packs): about 11 minutes more over the
round's builds.

## Closed (2026-11-18)

Passed in Chrome 156 and Firefox 155 on `50123c983`: `pack-store-browser`,
`snapshot-stream-browser`, `session-save-browser`, `image-browser` (now also: the base it built
from keeps no pack, nor do the inputs of system's build), `image-input-browser` (an input and an
image over 512 MiB, the second build from the cache) and `image-inventory-browser` (release
acceptance on the checkout); `test/image-build-service.test.mjs`, `packaged-snapshot.test.mjs`,
`snapshot-packs.test.mjs`. The docs package pins `docs/sessions.md` and
`docs/browser-boundary.md`, which the fix changed: the integration pins them.
