# The kernel holds no copy of what it hands the page: executables and captured images stream

- STATUS: OPEN
- PRIORITY: 200
- TAGS: core,kernel,memory,snapshots,abi

Two measured copies in the kernel's Wasm memory, which never shrinks. Decided 2026-11-04
(`tasks/20261102-133353-owner-decisions`): yes to both; each is a build's or a launch's high-water
mark for nothing. Both contracts are image inputs, so they go in one catalog round, together.

**A launch.** `dolly_process_image_read` mallocked the executable's size and read the blocked
file into it for the supervisor to copy out: a cold launch grew the kernel by the file's size
(96 MB for the compiler, 214 MB for `lean`), retained until a later allocation reused it. Fixed on
`core/firefox-process-memory` b59e558e8: `dolly_process_image_block` gives the supervisor each
1 MiB block of the file's own bytes; `image_read` and `image_address` go; `abi/dolly-supervisor-0.wat`
changes, so `dolly-docs` and its dependents repin. Measured (`module-cost.mjs`, 6 GB slots): a first
launch retains about 100 MB less and peaks 90 to 240 MB lower in both browsers; core,
process-memory and process suites pass. The branch also merges `core/process-memory`'s first form
(02d36f095), reverted on integrate and since replaced by `core/process-memory-2` (c89b87060):
cherry-pick b59e558e8 and its task commit a88866561 (`tasks/20261102-042011-firefox-process-memory`),
do not merge the branch. The 128 MiB `kKernelReserve` in `src/file-blocks.cpp` was sized for this
copy; its comment should say what it now protects.

**A capture.** `capture_snapshot()` (`src/system-snapshot.c`) mallocs the image's size and copies
every retained file into it: 3.0 times the image at the capture (pi-local's 1.65 GB, lean-meta's
1.58 GB, both killed by the 9 GB cap once). Proposed on `core/stream-capture`: 5952d104 replaces
the three capture exports of `abi/dolly-image-0.wat` with `dolly_snapshot_capture_begin` and
`_read`, which fill the Worker's 8 MiB staging window, a file's data from its descriptor;
3dbf32ba adds `dolly_append_file` beside `dolly_write_file`, so a build's inputs enter WasmFS
8 MiB at a time instead of as three whole copies. Measured: the capture's rise is 0.7 times the
image instead of 3.0, a 23-image closure byte-identical, `test/image-browser.mjs` passes in both
browsers with the roundtrip fixture's 17-byte window (`tasks/20261101-221415-stream-capture`).
Their parent is 14b36c24; the page side has since become the image store (34870df49, on
integrate): re-apply both onto integrate's `src/build-worker.mjs` and `boot-files.mjs`.

Done when: both are in one round and the image inputs change once; `test/image-browser.mjs`,
`test/process-memory-browser.mjs`, `test/process-browser.mjs` and `test/core-browser.mjs` pass in
Chromium and Firefox; `pi-local` builds under `slot.sh bigbuild`'s 9 GB cap with its capture-phase
rise measured against the image store's 5.55 GB peak; a cold launch of `compiler` is measured as
`module-cost.mjs` measures it; the round's snapshots are byte-identical to the previous round's
where the recipes did not change.
