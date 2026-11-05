# A page's origin-private storage holds every image it reads twice

- STATUS: OPEN
- PRIORITY: 200
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

Done when an image read once occupies its snapshot's size (within the packs' framing), it
starts again without a download, and the image, session and acceptance browser tests pass
in Chromium and Firefox.
