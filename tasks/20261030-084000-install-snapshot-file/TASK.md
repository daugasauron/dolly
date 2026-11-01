# amy install holds a package's snapshot beside the files it installs

- STATUS: OPEN
- PRIORITY: 70
- TAGS: amy,kernel,memory,packages

Since `c8d69656` the page holds a package's compressed packs while amy reads its snapshot; the
rest of an install's memory is the kernel's. For `nena enable stack && amy install lean` in
`default` that is about 4.6 GB at its high-water for 3.06 GB of installed files (the renderer is
4.9 GB in Chromium at the end of `lean-meta`'s install):

- amy writes each snapshot to `/etc/dolly/artifacts` and the engine copies every record out of it
  into its file (`copy_artifact_file`, `src/dollyfile.c`), so `lean-meta`'s 1.58 GB snapshot and
  its 1.58 GB of files are in kernel memory at once;
- amy keeps `lean`'s 685 MB snapshot while `lean-std` and `lean-meta`, which it records,
  install (`install_row`, `src/commands/amy.c`).

Both are in the seed: a change rebuilds every image. What each would save:

- amy removes a package's snapshot once it has read the rows it records, and fetches it again
  after them: 685 MB for `lean`, at the cost of a second transfer;
- the engine installs from the HTTP response as the kernel restores a boot snapshot
  (`dolly_snapshot_stream_*`, `src/system-snapshot.c`), with no snapshot file: the largest
  package's size, 1.58 GB.

Done-when: the kernel's high-water for `amy install lean` is the installed files and little more,
measured in Chromium and Firefox.

## Why the install hit the cap, and what each side does now (2026-11-01)

Measured in Chromium in a 6 GB browser slot (`build/lean-evidence/lean-measure.mjs`, `amy install
lean git` on `default`): the install's whole scope peaked at 6.31 GB (5.54 anonymous) and stayed
at 5.99 GB (5.22) after it, for 3.06 GB of files; the cap then killed the browser at the theorems.
A Wasm memory never shrinks, so the kernel keeps its high-water for the rest of the session: what
an install holds twice for a moment it holds for good.

- The page's side (`1d12850b`, kept): the page held every decompressed pack, then the merged
  snapshot, then WebCrypto's copy, two to three times the package. Merging as the guest reads,
  from the compressed packs (397 MB for `lean-meta`), is the right place: the guest takes one
  stream either way. Holding the decompressed packs instead would hold 1.58 GB for no gain;
  serving the packs to the guest would change `packages@0` and the seed and still give one
  stream. The incremental SHA-256 (`src/sha256.mjs`) stays: the stream must end only if it is
  the image the catalog's chain names (`metadata.sha256`), as the page's check before it did.
- The kernel's side (here): the engine copies a live install's files from the snapshot's end and
  cuts the snapshot off behind each (`truncate`, `src/dollyfile.c`), so a package's bytes are in
  the kernel once, plus the file being copied; amy lists the files before the engine runs. A
  build run keeps its snapshots for the rows after. With that, holding `lean`'s snapshot while
  its rows install costs nothing extra: those bytes become `lean`'s files. A seed change.

Also seen: a guest that finds no HTTP record waits 10 ms (`host/http/client.c`,
`src/libcurl-fetch.c`, polling `dolly_http_poll`), which is why the merge must stay off the
page's thread; a wait on the broker's notification would not poll.
