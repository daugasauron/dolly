# Image builds and session saves hold the image about three times: capture it as a stream

- STATUS: OPEN
- PRIORITY: 290
- TAGS: core,memory,snapshots

## State (2026-11-02)

Investigating, then streaming the Worker and page side (JavaScript, no image input);
the kernel's own copy is a contract change, written as a proposal below.

## The copies, measured and read

Agent A measured `pi-local` (1.65 GB snapshot) killed by the 9 GB cap at "copying
completed image": 4.8 GB anonymous at "restoring image builder", 7.3 GB anonymous and
1.8 GB page cache at the kill (`tasks/20261101-074223-audit-runtime`, finding 21);
`lean-meta` (1.58 GB) was killed the same way twice (`tasks/20261027-232422-lean`).

An image build (`src/build-worker.mjs`, `buildOnly` for the page's `image-builder.mjs`)
holds its image in these places at once:

1. The kernel's filesystem: WasmFS blocks in the build Worker's Wasm memory, the retained
   files beside the build's leftovers (`dolly_snapshot_prune` runs only at
   `dolly_bootstrap_finish`, after the capture).
2. `capture_snapshot()` (`src/system-snapshot.c`): `malloc(total)` in the same Wasm memory
   and a copy of every retained file into it. Wasm memory never shrinks, so this is the
   build's high-water mark even after `discard_capture()`.
3. `build-worker.mjs`: `new Uint8Array(range.size)` filled from the Wasm range, then
   transferred to the page. Its reason: the bytes must leave the shared memory before the
   Worker ends, and the digest and the cache take an unshared buffer.
4. The page (`image-builder.mjs`): `describeImageArtifact(bytes)` decodes the records (views,
   no copy) and digests the whole buffer with `crypto.subtle.digest` (the browser copies
   its input), then `saveImageArtifact` makes `new Blob([bytes])` for IndexedDB: a copy
   of the image in blob storage while the ArrayBuffer lives on.
5. The page holds the ArrayBuffer afterwards as the next build's input
   (`image-build.mjs`, `node.artifact.bytes`), transfers it into that Worker and takes it
   back (`returnInputs`, `build-input`, `consume`), and the Worker digests it again
   (`sha256(candidate.bytes)`), decodes it again, and writes it into WasmFS through a
   `malloc` of its whole size (`boot-files.mjs`), or stages the base whole in
   `dolly_snapshot_restore_address`.
6. The catalog build (`scripts/page-image-build.mjs`) keeps the ArrayBuffer as
   `globalThis.dollySnapshot` and reads it out in 16 MiB pieces (that part is fine).

A session save does not have this shape: `host/snapshot/kernel.c` holds the delta once
(`capture_filesystem()` into `capture_bytes`, at most 512 MiB) and publishes it through a
1 MiB mailbox window; the page gzips each chunk as it comes (`encodeSessionStream`) and
stores the compressed Blob. Its remaining copy is the kernel's, the same kind as 2.

## Why the kernel's copy needs a contract change

The kernel exports exactly the functions the contract wat files declare
(`scripts/dolly-abi.mjs`, `emscriptenExports`), so a streaming capture
(begin, read a window, end) must appear in `abi/dolly-image-0.wat`, whose binary
`dolly-image-0.wasm` is one of the five image build inputs (`scripts/write-build-id.mjs`).
Finding 21 assumed kernel C alone; it is not so. That change restales every image and is the
owner's call: see Proposal below. Everything else (3 to 6) is page and Worker JavaScript.

## Design: a built image on the page is a Blob, read in bounded pieces

- The Worker copies the captured range out of Wasm memory in 8 MiB pieces and feeds them
  to one consumer, `describeImageArtifact(pieces)`: an incremental SHA-256
  (`src/sha256.mjs`, already used for packaged images), a record scanner that keeps the
  paths and the `/etc/dolly/` files the identity needs, and Blob parts. The artifact's
  `bytes` is a Blob: in blob storage, not a JS heap, sliceable and streamable.
- The Worker saves the artifact to the image cache itself in both modes (it did so
  already when the image then runs here) and posts the artifact to the page.
- Inputs reach the next Worker as Blobs (cloned by reference), verified by the same
  streaming describe, staged into Wasm slice by slice (the base) or written whole
  (dependencies: `dolly_write_file` truncates, so a piecewise write is another contract
  change). The page never holds an image's bytes: `returnInputs`, `build-input` and
  `consume` go.
- Cache loads and packaged images are described from their Blob or chunk stream.

Image inputs hash before: `sha256:a58af3f9…` (`npm run build:runtime` in this tree and
in the baseline tree `work/audit-runtime-base`, both at fa949c1b's seed).

## Proposal (owner's call): the kernel streams its capture

Replace in `abi/dolly-image-0.wat` the three capture exports
(`dolly_snapshot_capture`, `dolly_snapshot_address`, `dolly_snapshot_size`) with

```
(func (export "dolly_snapshot_capture_begin") (result i64))  ;; the image's size; 0 fails
(func (export "dolly_snapshot_capture_read") (result i64))   ;; fills the staging range of
                                                             ;; dolly_snapshot_restore_address
                                                             ;; with the next bytes; 0 ends
```

`begin` does the metadata pass `capture_snapshot()` does and keeps the manifest; `read`
writes header, record headers, paths and file data from an offset into the window the Worker
sized. Peak memory becomes the filesystem plus the window. It changes `dolly-image-0.wasm`:
a catalog round. Prototype: a `Proposal:` commit on this branch, if time allows.

## Done when

- `pi-local` builds under `slot.sh bigbuild`'s 9 GB cap; a mid-size image's build peak is
  measured before and after; the produced snapshots are byte-identical.
- The image, session, custom-session and `test/image-browser.mjs` tests pass in Chromium
  and Firefox; the image inputs hash is unchanged.

## Lessons

(at the end)
