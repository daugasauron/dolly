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

## State (2026-11-04): `core/kernel-copies`

### The launch (c7f486d36)

b59e558e8 cherry-picked with its task (155538144, `tasks/20261102-042011-firefox-process-memory`):
the source files applied cleanly onto integrate; the docs recipe and its dependents are repinned.
`kKernelReserve` keeps its 128 MiB; its comment says what it protects now (the kernel's own
allocations once files fill its memory: arguments and environments, pipes, block tables, the
staging range of a capture or a restore). The struct comment of `dolly_kernel_program` said the
image was the executable's bytes; it is its head, read for the Wasm header or the `#!` line. Kernel
C and page JavaScript: image inputs unchanged (`e7867504`), runtime `7c83d1cd` -> `911031d3`.
The base's recipes needed 9bcb1c323's source pins (cc.c, cxx.c, patch.c, Ghostty's tarballs and
font): applied as the same pin values and repinned (2282453cc), so the core recipes are the
day round's and its `system` closure (98 images at `e7867504`) links into this tree.

`module-cost.mjs` (`build/kernel-copies-evidence/`, from `core/firefox-process-memory`'s evidence),
`system`, a 6 GB browser slot, the scope's anonymous memory in MB; before is the base's runtime
(`7c83d1cd`), after this commit's, one run each:

| step | Chromium before | Chromium after | Firefox before | Firefox after |
| --- | --- | --- | --- | --- |
| `compiler` (96 MB), first launch: highest, retained after 3 s | +310, +305 | +201, +112 | +769, +641 | +762, +557 |
| `cp compiler /tmp/compiler2` | +13 | +105 | +15 | +113 |
| `compiler2`, first launch: highest, retained | +307, +307 | +211, +211 | +786, +550 | +738, +441 |
| the run's peak (memory.peak) | 1148 | 1087 | 2260 | 2248 |

The first launch retains 193 MB less in Chromium and 84 MB less in Firefox, whose own two-tier
compile dominates its peak; the `cp` now grows by the file's size, since it no longer lands in the
kernel's freed copy. `test/process-memory-browser.mjs` (69 s, 83 s), `test/process-browser.mjs`
(76 s, 71 s) and `test/core-browser.mjs` (37 s, 63 s) passed in Chromium and Firefox
(`launch-*.log`).
