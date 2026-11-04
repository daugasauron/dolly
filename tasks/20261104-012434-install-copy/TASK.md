# An installed input exists twice while the engine installs it

- STATUS: OPEN
- PRIORITY: 150
- TAGS: core,kernel,memory,snapshots

Seen by `core/kernel-copies` (2026-11-04, `tasks/20261104-074503-kernel-copies`), which removed
the kernel's launch and capture copies: while the engine installs an input (FROM, INSTALL, COPY),
the input is in the kernel's memory twice, as its snapshot file and as the files restored from
it: 1.4 GB twice for `pi-local`'s model. The fix is the engine restoring from the Worker's
8 MiB pieces (`dolly_append_file`, the image store) instead of from a whole snapshot file.

Done when: an install's rise is measured before and after on `qwen3.5-2b` and `pi-local` (the
capture's method in `work/evidence-2026-11-04/http/kernel-copies-evidence/`), the second copy is gone, and `test/image-browser.mjs` and `test/image-input-browser.mjs`
pass in Chromium and Firefox with byte-identical snapshots. Moved here from
`tasks/20261104-074503-kernel-copies` (2026-11-05): `pi-local` builds under `slot.sh bigbuild`'s
9 GB cap, with its capture-phase rise measured against the image store's 5.55 GB peak
(`tasks/20261101-221415-stream-capture`). One measured build of `pi-local` gives both.

## State (2026-11-05)

Done but for `pi-local`'s measured build. The change is on `main` (92cf87ca4: 699c24fa1,
a77f5a85f, 3b4666db2). The confirming round of 2026-11-05 (`integrate/2026-11-05` at 693b9842f,
now `main` 943019e6d, image inputs `88959af6…`) rebuilt every image. Evidence in
`work/integrate/build/round-1105b-evidence/`:
- `test/image-browser.mjs` passed in Chromium (91.9 s) and Firefox (96.9 s), and
  `test/image-input-browser.mjs` in Chromium (42.6 s) and Firefox (46.5 s) (`browser.log`).
- The second copy is gone. With `qwen3.5-2b` installed, the kernel's memory at the capture went
  from 2974 MB before to 1585 MB after (Measured, below). The 24 snapshots built before and after
  the change are byte-identical (Verified, below).
- The round's `pi-local` (`catalog-heavy.log`): "capturing userspace image (kernel memory 1602
  MiB)" for a 1,640,990,203-byte snapshot, 1.02 times the image. The branch's `qwen3.5-2b`
  application after the change has the same ratio, so the model is in the kernel once. This was
  not a measured build: no sampler ran, and no 9 GB slot.

Left: `pi-local` built under `slot.sh bigbuild`'s 9 GB cap with the capture's method
(`build-measured.sh` and `phases.mjs` in `work/evidence-2026-11-04/http/kernel-copies-evidence/`,
`install-measured.sh` in `work/evidence-2026-11-04/ghostty/install-copy-evidence/`). It must give:
- the install's rise after the change;
- the same rise on a runtime before 699c24fa1;
- the capture-phase rise against the image store's 5.55 GB peak (moved from kernel-copies).

## Work (2026-11-04): `core/install-copy`, done but for `pi-local`'s measurement (the round's)

A build's inputs no longer enter the kernel's memory (699c24fa1; the capture's log line gives the
kernel's memory, a77f5a85f; the page's own copy, 3b4666db2). The build Worker keeps each input image's
Blob (a file of the image store) and makes `/etc/dolly/artifacts/SHA.snapshot` a file whose reads
copy the Blob's bytes into kernel memory 8 MiB at a time, as the engine reads it; the engine is
unchanged. Kernel C, page JavaScript and two contracts:

- `abi/dolly-image-0.wat`: `dolly_build_input(path, input, size)` replaces `dolly_append_file`,
  whose one caller was the input loop. Image inputs `ff1bd22a` -> `1dc91aea`, the seed unchanged.
- `abi/dolly-browser-0.wat`: `env.dolly_build_input_read(input, offset, address, size)`, owned by
  `runtime@0` (`host/runtime/runtime.mjs`): `FileReaderSync` over the Blobs the build Worker set
  with `setBuildInputs`, at most 8 MiB a call. No new authority: it reads only bytes the Worker
  formerly wrote into the filesystem whole; a Worker that builds nothing has no input.
  `docs/browser-boundary.md`'s `runtime@0` row and `test/sockets-browser.mjs`'s exact import list
  name it.
- `src/file-blocks.cpp`: `InputFile`, mounted like `/dev`'s files: reads fill an 8 MiB window
  (freed when a descriptor of it closes); `write` and growing fail with `EROFS`; truncating it
  shortens it. The engine moves files out of a snapshot by truncating it from its end (for amy's
  fetched snapshots this still frees kernel memory), and a process's `truncate(path)` opens the
  file for writing, so the file takes a write-open and a shortening, and nothing else.
  A first form that refused write-opens failed FROM with `EROFS`; making the engine skip
  shortening on `EROFS` instead changed `src/dollyfile.c`, a seed input carried in every image
  (`system-build` grew 40 bytes), which would have ended the byte comparison of every image.

### Measured

An application `FROM system` that `INSTALL`s `qwen3.5-2b` (pi-local's install of the model on a
small base), built once in the build page of a persistent Chromium profile (an incognito context's
in-memory quota is smaller than the inputs and the image), 6 GB browser slot, the slot scope's
anonymous memory every 0.2 s (kernel-copies' `sample-memory.sh`) and the kernel's memory at the
capture, which is its high-water mark since it never shrinks (now in the build log's capture line).
`build/install-copy-evidence/` (`install-measured.sh`, `install-phases.mjs`), two runs each:

| run | kernel memory at capture (MB) | anon after FROM | highest, FROM to INSTALL done | highest, engine to end | memory.peak |
| --- | --- | --- | --- | --- | --- |
| before 1 | 2974 | 3722 | 4967 | 4967 | 6442 (the cap) |
| before 2 | 2974 | 3591 | 4836 | 4836 | 6040 |
| after 1 | 1585 | 730 | 2086 | 2384 | 5935 |
| after 2 | 1585 | 960 | 2112 | 2440 | 5411 |

- The kernel's high-water mark goes from 1.92 to 1.02 times the 1550 MB image: 1388 MB less, the
  model's second copy. The built image is the same both times (`b5e58157…`, 1,549,772,283 bytes).
- Before, placing the inputs grew the scope by 1.1 to 1.5 GB before the engine ran, and the
  install's copy pushed it into the 6 GiB cap, where the cgroup reclaimed 1.46 GB of the browser's
  lazily freed pages within 0.4 s: anonymous memory falls in the middle of the install although the
  kernel's never does. After, placing the inputs costs nothing measurable. The scope's peak is the
  page's reading of the packs (file cache included) in both, so it says little.
- Firefox: the page was killed at the 6 GB cap while preparing the 1.4 GB input from its packs,
  before the build Worker started, in every run; not measured there
  (`tasks/20261104-062913-firefox-input`).
- `pi-local`: not measured. Its closure on this branch's image inputs is 46 images, `rust-llvm`
  and `rust-build` (a `hugebuild`) among them: the round's measurement, with this method.

### The page's copy (3b4666db2)

With the kernel at 1.02 times the image, the build's peak was the page: preparing the same two
inputs alone (`install-measured.sh chromium NAME prepare`) peaked at 5331 MB of anonymous memory,
3.4 times the inputs. `packedRecords` (`src/packaged-snapshot.mjs`), which merges a published image
from its packs for a build's input and for amy's package service, held each pack's compressed bytes
and its whole decompressed bytes to digest and decode it, and WebCrypto copied them again. It now
decompresses each pack once into `scanSnapshotRecords` (which now says where each record's data
lies) and the incremental SHA-256, keeping only the compressed bytes, as it did. The preparation
peaks at 2356 MB (23 s -> 26 s). The JavaScript SHA-256 runs at 285 MB/s in Chromium and 272 MB/s in
Firefox, WebCrypto at 1550 and 1505 (`sha-bench.txt`): about 3 s more per GB of input. Firefox's
`test/image-browser.mjs`, the old code and the new alternating: 93, 123, 92, 95 s.

The whole run (page and build, the slot's highest anonymous memory), the same image each time:

| code | runs | highest anon (MB) | kernel memory at capture (MB) |
| --- | --- | --- | --- |
| before | 2 | 5327, 5462 | 2974 |
| input files (699c24fa1) | 2 | 5460, 5328 | 1585 |
| and streamed pack checks (3b4666db2) | 2 | 2511, 2535 | 1585 |

### Verified

- The 24 images of `system`, `default`, `qwen3.5-2b` and `ps` rebuilt with the change are
  byte-identical to this branch's own build before it (`digests-before.txt`, `digests-after.txt`):
  system-build `f6436078…`, system-tools `ce4b8b6c…`, ps `24e70a91…`, default `96b6222a…`, system
  `926e4ff4…`, qwen3.5-2b `1817b80a…` among them.
- On the final runtime (`c9634063`, image inputs `1dc91aea`), 6 GB browser slot, Chromium and
  Firefox (`after-*.log`, `after-chain.txt`): `test/image-browser.mjs` (77 s, 86 s),
  `test/image-input-browser.mjs` (38 s, 40 s; the 520 MiB input is now read through the input
  file), `test/core-browser.mjs` (22 s, 31 s), `test/sockets-browser.mjs` (28 s, 32 s; the exact
  kernel import list, `libdolly-sockets` rebuilt here) and `test/custom-session-browser.mjs`
  (72 s, 81 s; custom images built in the page) passed; the source suite passes (470). With
  3b4666db2: `test/image-input-browser.mjs` (38 s, 42 s), `test/image-browser.mjs` (76 s, 143 s;
  then 123 and 95 s against the old code's 93 and 92) and `test/man-browser.mjs` (6 s, 10 s; amy
  installs `git` through the package service) passed (`packs-chain.txt`, `ab.txt`), and
  `test/boundary-browser.mjs` (the page's check that the kernel's imports equal the contract), and
  `test/default-browser.mjs` (24 s, 30 s; images the page composes from `core`, `display`, `cc`
  and `zig`, rebuilt here; its welcome check needs `python` registered, so the tree's catalog is
  the 35 images of that closure, `generate-routes.mjs`, nothing of python's built).

### Seen, not changed

- A session's install is still two copies: `amy install` streams the package's verified snapshot
  from `packages@0` over the HTTP broker into a kernel file of `/etc/dolly/artifacts`, and the
  engine installs from it, truncating it from its end, so the largest file exists twice (the
  model's 1.4 GB for `amy install qwen3.5-2b` in `default`). The service merges the snapshot from
  its packs as the guest reads it, so there is no Blob to mount; ending it means the service
  keeping the merged snapshot in the image store and the page mounting it as a build mounts its
  inputs, a change of `packages@0`'s protocol. Not measured today.
- Firefox's build page cannot prepare a 1.4 GB published input under the 6 GB cap, with or
  without 3b4666db2: `tasks/20261104-062913-firefox-input`, with its trace.

### For the round

Every image rebuilds on the new image inputs (with kernel-copies' and session-mtimes' changes, one
change); the docs recipe pins both contracts and two docs, and its dependents follow. Byte-identical
where recipes did not change. `pi-local`'s install measured as above.

## Lessons

- Measure the thing that can report itself. Kernel memory never shrinks, so its size at the
  capture is an exact high-water mark, the same in every run (2,973,696,000 and 1,585,381,376
  bytes); the scope's anonymous memory mixes in the page and pages the browser freed lazily, and
  fell by 1.46 GB in the middle of an install that only grew the kernel, when the cgroup reached
  its cap and reclaimed them. One log line replaced the inference.
- The seed's bytes are in every image: the engine's source and binary are retained everywhere,
  so a one-line engine change makes every snapshot differ and ends the round's byte comparison.
  When a fix can live in the kernel's file semantics instead, it keeps the catalog
  byte-identical, which is the round's strongest check.
- Read the libc adapter before choosing a file's semantics: a process's `truncate(path)` opens
  the file for writing (the process contract truncates by descriptor), so a read-only file kind
  failed FROM with `EROFS` on the first image with an input. Building the second image of the
  closure first found it in a minute.
- Removing one copy moves the high-water mark elsewhere: with the kernel at 1.02 times the image,
  the page's preparation of the same input (5.3 GB, 3.4 times the inputs) was the build's peak.
  Measure the whole pipeline once, not only the part the task names.
- Playwright's `browser.newPage()` is an incognito context whose storage quota is in memory:
  a 1.4 GB input and its 1.55 GB image exceed it. Large builds need `launchPersistentContext`,
  as `build-snapshot-browser.mjs` does.
