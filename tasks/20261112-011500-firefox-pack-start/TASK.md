# Firefox 139 to 151 start no image: a pack reaches the decompressor without its first bytes

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: firefox,browser,snapshots,compatibility

Found 2026-11-12 while measuring the oldest browsers (`20261111-071602-ci-image-builds`).
`docs/embedding.md` now names Firefox 153, the oldest that was measured to work.

## State (2026-11-12)

Measured, not explained. A `dolly-build` site of python-data, served plainly, fails at every
start in Playwright's Firefox 139, 140.0.2 (ESR), 142, 148 and 151, three times out of three
in 148: `FATAL The input data is corrupted: incorrect header check` after "loading precompiled
userspace snapshot". Firefox 153 and 155 start it, 155 eight times out of eight. With the gzip
input checked in the site's `packaged-snapshot.mjs`, the first chunk that
`streamPackagedSystemSnapshot`'s `gunzip(part.body)` receives in Firefox 140 is the pack
`5fd51dcf…` from byte 69,632 on: its first 69,632 bytes are lost before decompression, on the
download path (`downloadedPack`: `fetch` with `cache: "force-cache"`, `decodeStaticAsset`,
whose `isPartsManifest` reads and cancels a `response.clone()`, then `pack-store.mjs`
`keeping`, whose TransformStream writes each chunk to OPFS before passing it on).
In a page, each step alone keeps every byte in Firefox 140: fetching all 64 packs and
decompressing them whole, as views or as copies, through an OPFS writer, and reading a cancelled
clone's original. Not yet measured: the same in a Worker, where the runtime does it.

Repro: `/home/daug/dev/dolly-tmp/ci-hand/` holds the site (`app/out-pypi`), the Playwright
releases (`pw-*`) and their browsers (`browsers/`), and the boot script
(`scripts/boot-old.mjs PLAYWRIGHT_DIR SITE firefox`; `boot-old-log.mjs` prints the boot log).

Done when the lost bytes are explained, and either Firefox 140 starts images or the docs keep
naming the version that does, with the reason.

## Closed (2026-11-12)

Explained and fixed on `fix/startup`. The lost bytes came from `isPartsManifest`
(`src/static-asset.mjs`), which read the first chunk of a `response.clone()` and cancelled the
clone while the original was not yet read: Firefox up to 151 dropped the original's first bytes
then. The pack prefetch of the startup audit made Node lose them too, under the same pattern
(`test/packaged-snapshot.test.mjs`, 2 failures in 12 runs). The peek now reads the body itself and
hands on a response that replays those bytes first (`peeked`); 15 of 15 runs pass. Measured
after the fix on the checkout's `default`: Firefox 146, 148 and 151 start it; Firefox 140, 142 and
144 reach the image and stop at `Atomics.waitAsync is not a function`, which the runtime needs.
`docs/embedding.md` and the build's message name Firefox 146.
