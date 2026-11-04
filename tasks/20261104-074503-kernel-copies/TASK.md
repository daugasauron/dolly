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

## State (2026-11-04): `core/kernel-copies`, done but for the round

Both changes are on the branch, verified on rebuilt images in both browsers; what is left is the
round's (below: every image rebuilds, pi-local under the 9 GB cap, the catalog's byte comparison).

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

### The capture (ab95a35dc, 3b25d52c3)

5952d104 and 3dbf32ba re-applied: their source files applied cleanly, since neither the kernel's
capture, the Worker's capture loop nor `boot-files.mjs` changed since their parent (14b36c24);
the image store (34870df49) sits behind `describeImageArtifact`, which takes the pieces as it took
the copied range's. The contract `abi/dolly-image-0.wat` is an image input: image inputs
`e7867504` -> `7fc896aa` (runtime `75cf5331`), so every image rebuilds.

Measured with `build-measured.sh` (a 6 GB build slot, the scope's anonymous memory every 0.2 s,
each build-log line timed; `phases.mjs` reads them), one image rebuilt from its published inputs.
Before: integrate's code (`system`, `cc`) or the launch commit's (`qwen3.5-2b`, whose build launches
no large executable), image inputs `e7867504`; the rebuilt snapshots were byte-identical to the
day round's. "Rise" is the highest anonymous memory from the capture to the export over the
memory at the capture.

Anonymous memory in MB at each phase of the image's build ("capture" to "caching" is the kernel's
capture with the Worker's digest and its write into the image store; "caching" to "exported" is
the catalog page reading the stored file out in 16 MiB pieces, the same code before and after):

| image (size) | before: highest, kernel to capture | after | before: at capture, highest to caching | after | before: highest, caching to export | after |
| --- | --- | --- | --- | --- | --- | --- |
| `system` (154 MB; FROM system-tools, INSTALLs cc) | 1424 | 930 | 1181, 1254 (+73) | 920, 983 (+63) | 1377 | 1331 |
| `cc` (134 MB; FROM system-build) | 848 | 731 | 848, 909 (+61) | 731, 785 (+54) | 1244 | 1162 |
| `qwen3.5-2b` (1396 MB; FROM system) | 3574 | 3784 | 3564, 4877 (+1313) | 3771, 3771 (+0) | 5199 | 4038 |

- The capture's copy shows where the image outgrows what the kernel had freed: `qwen3.5-2b`'s
  build deletes its two source parts before the capture, and the 1.4 GB malloc still grew the
  scope by 1.3 GB; streamed, the capture adds nothing measurable. Its build's anonymous peak goes
  from 5199 to 4038 MB (the scope's current, with page cache, touched the 6 GiB cap both times).
- For `system` and `cc` the capture's malloc fit the base's staging range the restore had freed, so
  the capture itself moved little (+73 to +63, +61 to +54); what the inputs in pieces saved is the
  restore: `system`'s highest before the capture is 494 MB lower (a whole ArrayBuffer and a malloc
  of each input: the 154 MB base and the 134 MB cc, now 8 MiB at a time).
- `qwen3.5-2b`'s highest before the capture (3574, 3784) falls in both runs at the end of its
  `sha256sum` of the 1.4 GB model, a process reading the file, which this change does not touch.
- The after column is one build of the closure (`after-closure.*`, the 24 images of `system`,
  `default` and `qwen3.5-2b`, 25 min) in one browser, so its floors sit higher than a single
  image's; the before columns are single-image builds.

Every one of the 24 snapshots the new code built has the digest and size the base's code built
(`digests-before.txt`, `digests-after.txt`): system-build `f6436078…`, zig-build `988eb648…`,
ghostty-build `e920dfdb…`, system `9eeb9236…`, default `96b6222a…`, qwen3.5-2b `a2783bdb…` among them.

On the final runtime (`75cf5331`, image inputs `7fc896aa`, the rebuilt closure), in Chromium and
Firefox, 6 GB browser slot (`capture-*.log`): `test/image-browser.mjs` (76 s, 98 s; the roundtrip
fixture compiled in Dolly captures through a 17-byte window), `test/image-input-browser.mjs` (49 s,
58 s; a 520 MiB input written into the build's filesystem in pieces), `test/process-memory-browser.mjs`
(50 s, 61 s), `test/process-browser.mjs` (62 s, 69 s), `test/core-browser.mjs` (32 s, 52 s),
`test/custom-session-browser.mjs` (73 s, 86 s; custom images built in the page) and
`test/session-offline-browser.mjs` (5 s, 6 s) passed; `test/default-browser.mjs` passed in both
(`capture-default.log`: `default`, and images the page composes from packages, among them one that
installs `zig`, rebuilt here with the new code: `40dbfd00…`, the day round's digest). Its welcome
check needs `python` registered, so the tree's registry is the closure of `system`, `default`,
`qwen3.5-2b`, `zig` and `python` (`generate-routes.mjs`, nothing of python's built): a plain
`npm run image` would rebuild the whole catalog on the new image inputs. `module-cost.mjs` once more: the compiler's first launch +210 highest and +204 retained in
Chromium, +591 and +298 in Firefox. What a first launch retains after 3 s depends on when the
collector takes the supervisor's copy (96 MB of garbage once compiled): +112 and +204 in two
Chromium runs of the same code. The highest is steadier: +310 before, +201 and +210 after.

### For the round

- Every image rebuilds: `abi/dolly-image-0.wat` is an image input (`7fc896aa` with this branch
  alone; the merged round's hash differs with the other branches' seed changes). The docs recipe
  pins both contracts and `docs/process-model.md`; its dependents follow.
- Byte-identical where recipes did not change: checked here for the 24 images of `system`,
  `default` and `qwen3.5-2b`; the round's own comparison against this round's catalog covers the rest.
- `pi-local` under `slot.sh bigbuild`'s 9 GB cap, its capture-phase rise against the image store's
  5.55 GB peak (`tasks/20261101-221415-stream-capture`): not measured today (the round and three
  agents leave no room for a 9 GB build). It is the round's measurement: `build-measured.sh` and
  `phases.mjs` in `build/kernel-copies-evidence/` do it with `pi-local pi-local bigbuild NAME`.

## Lessons

- Freed kernel memory hides a copy. `system`'s and `cc`'s capture malloc fit the base's staging
  range the restore had just freed, so streaming moved their capture phase by 10 MB; the copy cost
  1.3 GB only where the image outgrew what was free (`qwen3.5-2b`, 1.4 GB on a 154 MB base). To
  measure a copy, pick a case where it cannot land in memory the same Worker freed before.
- A rise over a floor misleads when the change also lowers the floor: `system`'s capture-to-export
  rise read 1.28 times the image before and 2.67 after, until the export (the catalog page's 16 MiB
  pieces, the same code in both) was split from the capture and the absolute peaks compared.
- What a first launch retains after 3 s is the collector's timing: the same code gave +112 and +204
  MB in Chromium. Its highest is the measure to compare.
- Cherry-picking a commit that repins recipes conflicts in every pin: take ours, set the hand pins
  of `Dollyfile-dolly-docs` to the changed files' digests, run `update-recipe-pins.mjs`. Linking the
  round's 98 current images (snapshots and packs linked, metadata copied by rename) gave a valid
  baseline in seconds, once the base's stale source pins were the round's.
- The checkout serves `src/` live to tests and image builds: while one runs, the working tree is
  pinned. Plan the order (measure before, then change) instead of preparing the next step beside it.
