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
pass in Chromium and Firefox with byte-identical snapshots.

## State (2026-11-04): `core/install-copy`

A build's inputs no longer enter the kernel's memory. The build Worker keeps each input image's
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
  (freed when the last descriptor closes); `write` and growing fail with `EROFS`; truncating it
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
  before the build Worker started, twice before the change and once after; not measured there.
- `pi-local`: not measured. Its closure on this branch's image inputs is 46 images, `rust-llvm`
  and `rust-build` (a `hugebuild`) among them: the round's measurement, with this method.

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
  (72 s, 81 s; custom images built in the page) passed; the source suite passes (470).

### Seen, not changed

- A session's install is still two copies: `amy install` streams the package's verified snapshot
  from `packages@0` over the HTTP broker into a kernel file of `/etc/dolly/artifacts`, and the
  engine installs from it, truncating it from its end, so the largest file exists twice (the
  model's 1.4 GB for `amy install qwen3.5-2b` in `default`). The service merges the snapshot from
  its packs as the guest reads it, so there is no Blob to mount; ending it means the service
  keeping the merged snapshot in the image store and the page mounting it as a build mounts its
  inputs, a change of `packages@0`'s protocol. Not measured today.
- Firefox's build page cannot prepare a 1.4 GB published input under the 6 GB cap (above): the
  page holds the input's compressed packs while it merges them, and Chromium's anonymous memory
  peaks near 2 GB on the same path.

### For the round

Every image rebuilds on the new image inputs (with kernel-copies' and session-mtimes' changes, one
change); the docs recipe pins both contracts and two docs, and its dependents follow. Byte-identical
where recipes did not change. `pi-local`'s install measured as above.

## Lessons

LESSONS-PLACEHOLDER
