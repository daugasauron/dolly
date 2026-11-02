# Image builds and session saves hold the image about three times: capture it as a stream

- STATUS: DONE
- PRIORITY: 120
- TAGS: core,memory,snapshots

## Closed (2026-11-03)

Done on `core/stream-capture-2` (4de5ca7d4 to 5f9296a65): the streaming capture re-applied, its
published-input failure measured to its cause and fixed by the image store, fd and pi-local built
and measured, the tests passing in both browsers. The kernel-side proposals (5952d104, 3dbf32ba)
are the owner's, listed in `tasks/20261102-133353-owner-decisions`.

## State (2026-11-02)

Done and verified for the mergeable commits (4439f99c, cc38734d, 829e38f1): the Worker and
page copies are gone, a built image is a Blob read in pieces, image inputs unchanged
(`sha256:a58af3f9…`). Waits for the owner: the two `Proposal:` commits at the end of the
branch (the kernel's capture as a stream, a dependency written in pieces), each a change to
`abi/dolly-image-0.wat` and so a catalog round.

**pi-local under `slot.sh bigbuild`'s 9 GB cap (the acceptance test)** built on the baseline
rig (`work/audit-runtime-base`, the mergeable commits, inputs from the integrator's tree):
1,651,863,160 bytes, sha256 `dd54fb5b…`, 57 s, capture to cache in 8 s (`pi-local.*`,
1 s samples). Anonymous memory 5.04 GB at "restoring image builder" (A: 4.8), 6.30 GB when
the capture began, 7.16 GB at its peak (+0.86 GB; A: +2.5 GB and the kill), 2.1 GB once the
Worker ended. The scope touched its cap (9.54 GB current) with 0.7 GB of page cache
reclaimed: the margin is the proposals'. The integrator's round built pi-local with the old
code at 09:48 (its own file): the same sha256 `dd54fb5b…`, byte-identical at 1.65 GB.

**lean-meta under the 9 GB cap** built on the same rig (lean-stage0, lean-std and lean-meta
from fa949c1b's recipes, one build slot shared with the integrator's round): 1,581,471,990
bytes, sha256 `479ed597…`, lean-meta's own build 57 min (`lean-meta.*`, 1 s samples). Its
compile phase peaked at 8.21 GB anonymous; at the capture 4.34 GB rose to 6.18 GB (+1.84 GB,
the kernel's copy and the Blob) where +3.2 GB killed it before (`tasks/…-lean`), and the
Worker's end left 0.72 GB.

**Mid-size images**, old code in the baseline tree against new code here, each a rebuild of
`system` alone from published inputs, the build scope's `memory.stat` sampled every 0.2 s
(`{baseline,after}-system-fast.*`):

| | anon before capture | peak anon, capture to export | scope peak |
| --- | --- | --- | --- |
| before (fa949c1b) | 1.05 GB | 1.55 GB (+0.50 GB, 3.0 x the image) | 2.05 GB |
| after (4439f99c) | 1.12 GB | 1.27 GB (+0.15 GB, 0.9 x: the kernel's copy) | 1.76 GB |

Both builds produced sha256 `6b61cde503cae838…`, byte-identical to the baseline closure's.
The remaining copy is the kernel's `capture_bytes`: the proposal below. With it (this tree,
image inputs `f8b159f1`, the same 23-image closure rebuilt in 20.5 min, 0.2 s samples in
`layer2-closure-capture.*`), every one of the 23 snapshots has the digest and size the old
code produced, and the capture-phase rise is the Blob in the browser process alone:

| image | size | before: capture to export | proposal |
| --- | --- | --- | --- |
| system | 164 MB | +0.50 GB (3.0 x) | +0.12 GB (0.7 x) |
| ghostty-build | 212 MB | +0.54 GB (2.5 x, 1 s samples) | +0.13 GB (0.6 x) |
| zig-build | 195 MB | +0.47 GB (2.4 x, 1 s samples) | +0.20 GB (1.0 x) |

`test/image-browser.mjs` passed on the proposal in Chromium (66 s) and Firefox (72 s):
the roundtrip fixture compiled in Dolly captures through a 17-byte window, and the
in-page builds use the two new exports.

Browser tests of the mergeable commits (baseline tree, Chromium and Firefox):
`test/image-browser.mjs` passed (56 s, 89 s): in-page rebuilds from published packs, the
Blob inputs reused across three builds, the cache's rollback and corruption checks;
`custom-session` (94 s, 115 s), `session-offline` (7 s, 8 s) and `core` (37 s, 55 s)
passed. Two test fixtures handed the cache ArrayBuffers and are Blobs now (829e38f1).
`host-compute` (10 s, 13 s), whose fixture builds a custom image and runs it headless from
its Blob, passed once `libdolly-gpu` joined the baseline closure; of the other tests that
build images in the page, `ending`, `shell-env`, `pty`, `threads` and `sockets` passed in
both browsers; `site` fetches every source the site names and needs the full catalog
registered (the rig's is narrowed to its closure), so it was not run meaningfully.

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
writes the header, then each record's header, path and data into the window the Worker
sized (8 MiB), a file's data straight from its descriptor. Peak memory becomes the
filesystem plus the window. It changes `dolly-image-0.wasm` (image inputs
`sha256:f8b159f1…` with it): a catalog round. Prototyped as the `Proposal:` commit at the
end of this branch: kernel, contract, `Dollyfile-dolly-docs`'s pin of the contract and its
dependents, the Worker, and `test/fixtures/image-roundtrip.c`, which captures through a
17-byte window so pieces end inside headers, paths and data.

### The restore side, in the same round

A build's inputs enter its filesystem as boot files (`/etc/dolly/artifacts/*.snapshot`):
the Worker's whole ArrayBuffer, `boot-files.mjs`'s `malloc` of the same size for
`dolly_write_file` to copy from, and WasmFS: three copies of qwen3.5-2b's 1.4 GB before
`pi-local`'s build starts (A's 4.8 GB at "restoring image builder"), three of lean-std and
lean-meta's 2.4 GB before `lean`'s. `dolly_write_file` truncates, so a second `Proposal:`
commit (51205bca) adds `dolly_append_file` beside it; the Worker slices an input's Blob
8 MiB at a time (`files.write`, then `files.append`), and the two transient copies are a
piece each. Image inputs with both proposals: `sha256:9964d057…`; the 23-image closure
rebuilt with both (14.5 min) is again byte-identical to the baseline's, every digest and size.
Measured on a custom image FROM system-build (135 MB) that INSTALLs cc (134 MB), built in
each tree from published inputs (`install-layer1.*`, `install-proposal.*`): the build takes
2 s, too short for the 0.2 s samples to separate its phases, but the scope's high-water mark
over its start reads +0.47 GB with the whole write and +0.23 GB with the piecewise one.
`test/image-browser.mjs` passed with both proposals in Chromium (65 s) and Firefox (77 s), as
did `custom-session` (64 s, 101 s), `session-offline` (5 s, 7 s) and `core` (29 s, 41 s).

## Checked and left

- A session save holds its delta once in the kernel (`capture_filesystem()`, at most
  512 MiB) and streams it through the 1 MiB mailbox window; the page gzips chunk by chunk
  and stores the compressed Blob. That copy stays: programs keep running while the page
  consumes the save, so the copy, made between two system calls, is the save's one
  consistent moment; reading each file into the window as the proposal's capture does
  could save a file torn by a write in between. An image capture has no such problem,
  every builder process has exited.
- The base of a build is staged piece by piece in any case (`dolly_snapshot_restore_address`
  sized to the base, filled from Blob slices); the staging range itself is one copy the
  kernel frees after `dolly_process_bootstrap_resume_prepare`.
- Chrome keeps a Blob's bytes in the browser process and pages them to disk; Firefox keeps
  them in the content process. Either way they leave the JS heap and the Wasm memory.

## Done when

- `pi-local` builds under `slot.sh bigbuild`'s 9 GB cap; a mid-size image's build peak is
  measured before and after; the produced snapshots are byte-identical.
- The image, session, custom-session and `test/image-browser.mjs` tests pass in Chromium
  and Firefox; the image inputs hash is unchanged.

## Reverted on integrate/2026-11-02 for the evening round (2026-11-02 16:30, e69e7cfbb)

The evening round failed at fd: the build Worker read the published 527 MB rust-build artifact
and got "network error". Measured in Chrome in a 6 GB slot (data: and http origins): a Blob that a
page builds from 8 MiB in-memory parts and posts to a Worker reads at 128, 256 and 400 MB, and fails
at 527 MB and 1.1 GB with NotReadableError (the probe is a page that builds such a Blob and a Worker
that reads it by slices and whole). `prepareImageArtifacts` describes a published input
(`packagedSystemSnapshot` -> `describeImageArtifact`) into exactly such a Blob; inputs reused from
the Cache API are disk-backed, which is why pi-local and lean-meta built. 4439f99c and 829e38f1 are
reverted on integrate so the overnight round runs on the path that built the morning's catalog.

To bring it back: put a published snapshot into the Cache API before describing it (so its Blob is
disk-backed) or keep a transfer for that path, and add an image-browser case whose input is over
512 MB, which fails today.

## Brought back (2026-11-03): the image's snapshot is a file of the browser's storage

4439f99c and 829e38f1 re-applied (4de5ca7d4, 76d1073b5); the published-input failure
reproduced, understood and fixed (095394c36). Image inputs unchanged, `sha256:fe5261db…`.

### The cause, measured (`build/stream-capture-2-evidence/probe-*.log`, the probe in the
integrator's scratchpad extended: `probe2.mjs`)

A Blob a page or Worker builds from parts in memory is held by Chrome's blob storage, whose
in-memory space is 500 MiB until Chrome has computed the machine's limits, which it does only
once the browser has been idle for a few seconds after a context starts (the limits task is
best-effort). Until then a Blob over 500 MiB is broken: unreadable even in the page that made
it (`NotReadableError`), from 1 MiB or 8 MiB parts alike, in a plain context and in a persistent
profile alike, `probe-chrome-1mib.log`, `probe-chrome-persistent-1mib.log`, `probe-chrome-8mib-delay0.log`.
Made 3 s or more after launch with the page idle, the same Blob reads at 527 MB and 1.1 GB in both
contexts (`probe-chrome-delay-series.log`, `probe-chrome-8mib-delay15.log`). The evening round's
fd build described the published 527 MB rust-build within seconds of a fresh Chrome, busy from
its first moment: the Blob was broken, and the Worker's read of it was the "network error". The
pi-local capture came minutes later in a browser that had idled: it worked. A fix that keeps the
in-memory Blob would depend on the browser's idle time and on the machine's memory (the computed
space is a share of it): not acceptable.

The other stores, each at 527 MB and 1.1 GB, 1 MiB parts, Chrome plain, Chrome persistent profile,
Firefox (`probe-chrome-limits.log`, `probe-*-opfs-lifetime.log`, `probe-firefox-*.log`):

| sink | Chrome plain context | Chrome persistent profile | Firefox |
| --- | --- | --- | --- |
| `new Blob(parts)` | broken until idle (above) | the same | reads; 1.1 GB costs 4 GB when posted and read |
| IndexedDB `put(blob)` | stores the broken Blob | `DataError: Failed to write blobs` | reads |
| Cache API, `put(Response(stream))` | `UnknownError` from 300 MB (its memory backend's entry limit) | reads | reads |
| origin-private file, `createWritable()` | reads | reads | reads |
| that File `put` into IndexedDB | reads | reads (a copy on disk) | reads |
| … then the file removed | the IndexedDB Blob is a reference: `NotFoundError` | reads | reads |
| the File after `removeEntry` or a rewrite | `NotFoundError` / `NotReadableError` | the same | `AbortError` |

So a File of origin-private storage is the one Blob every context reads at any size; it is a live
reference to its file, which must outlive every reader; and IndexedDB cannot be trusted to copy it.

### The fix: the image store (`src/image-artifact.mjs`)

`describeImageArtifact(pieces)` writes the pieces it digests into a new file of a directory of
origin-private storage, and that File is the artifact's bytes: the Worker's capture and the page's
published input never exist as a Blob of parts. The IndexedDB `images` store keeps the entries and
names each one's file (`file`); there is no payload copy. Loading an entry marks it used, so the
inputs of a build are the entries evicted last (least recently used, where it was least recently
saved: a build's inputs loaded from the cache kept their old date and could be evicted by the
same build's later saves). A file this page has read is kept when its entry is replaced or
evicted, since a build of this page may still read it; files no entry names and no page holds
are swept an hour after they were written. The bounds are as before: 32 entries, 8 GiB.

What changed in kind: an evicted entry's bytes are gone for other pages at once (IndexedDB kept
a Blob alive for every holder). Two tabs building at the same time, one evicting or replacing
what the other reads, fail that build with a read error, to retry; the test's own flows that
hold a loaded artifact across a replacement work because the page holds the file. The `payloads`
store stays for the entries other runtime versions keep in the shared database.

### The test (`test/image-input-browser.mjs`, c16712d3f)

A published package (ps, which nothing else the build reads is built from) is served with a
520 MiB file added, in its own pack; a custom image FROM system copies that file, built first
thing after the browser starts, as the catalog's build page does, then built again from the
cache. On 4439f99c Chrome fails as the round did (`image-input-before-fix-chromium.log`:
"network error" from the build Worker).

### Verified (2026-11-03, `build/stream-capture-2-evidence/`)

- `test/image-input-browser.mjs` on the fix: Chromium 35 s, Firefox 42 s (`image-input-after-fix.log`).
- `image` (Chromium 52 s, Firefox 66 s), `custom-session` (62 s, 89 s) and `session-offline` (4 s, 5 s)
  passed on 34870df49 (`after-image.log`, `after-custom-session.log`, `after-session-offline.log`); their
  first run found two faults of 095394c36: a file written for a foreign Blob was held, so a replaced
  entry's file stayed, and `loadImageArtifact` wanted the entry's own descriptor where a session or an
  opened tab hands it the artifact's identity alone.
- On the final code (34870df49), with the catalog whole again: `image-input` (Chromium 30 s, Firefox
  36 s), `core` (21 s, 32 s) and `npm` (18 s, 21 s) passed (`browser-chain-3.out`, `browser-chain-4.out`).
- This tree's dist holds the application audit's builds of some twenty recipes this branch does not
  have (raylib, lua, x11-build, glib and their dependents): a plain `npm run image` here would
  rebuild them for hours, so the catalog was registered from the present metadata instead
  (`prepare-sources.log`); the pi images were rebuilt on the repinned docs package.
- `npm run build:runtime`: image inputs `sha256:fe5261db…` (`build-runtime.log`), unchanged.

**fd from the published rust-build** (`DOLLY_BUILD_IMAGES=rust-build,fd`, this tree's fd snapshot
removed, the 6 GB cap, `fd-after.*`, 0.2 s samples): "reusing published rust-build artifact", the
527 MB input read from its packs into the store and by the Worker, fd built in 100 s, exported
5,649,578 bytes, sha256 `d5992f49…`: byte-identical to the catalog's. The scope's anonymous memory
peaked at 5.28 GB in Cargo's build, the Blob and the copy of rust-build nowhere in it.

**pi-local under the 9 GB cap**, this tree's snapshot removed, the same inputs each time
(`pi-local-after.*` with this branch, `pi-local-before.*` with integrate's page code, dc7b58aa4):

| | restoring the image builder | the capture, to the export | the Worker gone |
| --- | --- | --- | --- |
| before (an ArrayBuffer of each input, the captured image copied whole, a Blob of it for IndexedDB) | 7.1 GB | 8.55 GB peak, 7.0 to 7.2 GB for 25 s while the cache wrote its copy | 1.7 GB |
| after (inputs and the capture as files of the store) | 5.57 GB peak, for a second | 5.55 GB peak | 0.84 GB |

Both builds exported 1,651,923,573 bytes with sha256 `31294d38…`: the store changes nothing in the
image. (The catalog's pi-local, `78691695…`, is 61 bytes smaller: pi-agent carries the four edited
documents, so the next round rebuilds dolly-docs and its dependents.) The old code's run was not
killed this time (agent A's was, finding 21): its 0.45 GB of margin under the cap is now 3.4 GB.
The remaining copies are the kernel's (`capture_bytes`, the proposal above) and the inputs written
whole into WasmFS (`dolly_write_file` truncates; the second proposal).

## Lessons

- "Kernel C is not an image input" holds only while the kernel's export list stands: the
  contract wat that names the exports is one of the five inputs, so a new kernel export is
  a catalog round, however small the C. Check `scripts/write-build-id.mjs` before
  promising no round.
- An image's natural page-side form is a Blob: it leaves the JS heap and Wasm memory,
  clones by reference into every Worker, slices for staging, streams for a digest and is
  what IndexedDB stores anyway. The returnInputs/consume round trips existed only because
  an ArrayBuffer cannot be shared; with Blobs they had nothing left to do.
- Sampling a build's memory: `slot.sh`'s scope is `run-*.scope`; a sampler that takes the
  first `.scope` ancestor finds the terminal's scope and reads flat numbers. One sample a
  second misses a capture that takes under a second; 0.2 s showed the 3x step.
- Only `*.snapshot`, `dist/packs/*` and `dist/static/*` may be hard links between trees:
  the metadata `.mjs` files I linked with `ln -f` after the baseline closure (220 files)
  are written in place by generators, so a build in one tree can rewrite the other's
  catalog. The integrator caught it; the links were broken before this tree's proposal
  closure wrote anything, and the two `system` measurements had each been written by
  their own tree's build (checked by inode and digest).
- A rig that reuses another tree's images needs that tree's recipe files and seed
  records as well (`build/rustc-port`, `build/rust-sources`): the metadata's recipe digests
  say which recipes built an image, and `--plan` says in one line what would rebuild. pi-local's
  acceptance build cost three false starts before the rig had them.
- `git status | head` hid 150 repinned recipes for an hour; `git cherry-pick -q` does not
  exist and a `reset --hard && cherry-pick` chain that fails midway leaves the tree reset:
  bookmark commits before reordering them.
- (2026-11-03) "A Blob is in blob storage, not the JS heap" was true and not enough: Chrome's blob
  storage has an in-memory space that is 500 MiB until a best-effort task has measured the machine,
  which a busy fresh browser never lets run; a build page is busy from its first moment. A Blob
  of a large thing must be born in a storage API, and the probe must do what the failing case
  did (first thing after launch), not what is convenient (after the shell has booted).
- (2026-11-03) Each store has a shape of its own that no documentation states: the Cache API's
  memory backend caps an entry near a quarter of a gigabyte; IndexedDB in a plain Chrome context
  keeps a reference to the File it was given rather than a copy; an origin-private File dies with
  its file in every browser. Six probes of a minute each settled what a day of reading would not.
- (2026-11-03) A fixture that replaces a published image's bytes must pick one nothing else the
  test reads is built from: standing in for core made system's published inputs stale, and the
  page quietly rebuilt system (its 709 MB included the fixture's file). The inputs mechanism
  worked exactly as designed; the test's first assumption was wrong, and the failure message
  (two sizes, neither expected) said so once read as numbers rather than as a bug.
