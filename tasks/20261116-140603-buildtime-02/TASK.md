# Image builds keep 5.7 of the machine's 16 threads busy: two at a time, set by hand without a memory measurement

- STATUS: OPEN
- PRIORITY: 260
- TAGS: audit,build,memory,0.1.8

From the build-time audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`). Evidence and scripts: `work/audit-1116-evidence/buildtime/`.

## State (2026-11-16)

Measured from 0.1.7's round and the journal, and the heaviest images built alone with their
memory sampled (the table below). Left: every image's peak recorded by the builder, and one
catalog at a higher count.

## Found

- Every round since 13 November builds the catalog as `capped env DOLLY_IMAGE_JOBS=2 npm run image`
  (`work/round-1117.sh`, `round-1115.sh`, `round-1113c.sh`, `round-1113-final.sh`,
  `release-0.1.7.sh`; `capped` is a `systemd-run --scope` with `MemoryMax=36G`). The machine: an
  8-core, 16-thread Ryzen 7 9700X with 60 GB.
- CPU: the scope of 0.1.7's image phase consumed "1d 9h 23min 20.724s CPU time" (user journal,
  2026-11-15 07:33:45, `run-rcbc5463….scope`, `journal-image-phase-cpu.txt`) over its 20,999 s:
  5.72 threads on average, about 2.9 per build. Round 1115's phase: 1 d 8 h 16 min over
  20,431 s, 5.69. (A Worker waiting in `Atomics.wait` sleeps in the kernel and counts no CPU
  time.)
- The catalog's per-image times sum to 40,924 s (11.37 h, `packaged-1117.txt`); the 17 images of
  600 s or more are 28,900 s of it. The longest chain of the image graph is 7,658 s (2.13 h):
  system-build 48 s, zig-build 501, ghostty-build 115, display, system-tools, libuv, cmake 442,
  cmake-build, tools-build, sqlite, python 99, rust-llvm 1,589, rust-build 2,196, fd 98,
  codex 2,428, codex-agent 21 (`critical-path-1117.txt`).
- The scheduler replayed on those times (`simulate-schedule.mjs`, plan order as
  `scripts/build-system-snapshot.mjs` starts images; durations held fixed, so a lower bound):
  2 jobs 5.71 h (the round took 5.81 h; round 1115's times replay to 5.56 h, it took 5.66 h,
  `schedule-1115.txt`), 3 jobs 3.93 h, 4 jobs 3.05 h, 6 jobs 2.17 h. Starting the
  ready image with the longest remaining chain first: 3.80 h at 3, 2.88 h at 4
  (`schedule-1117.txt`). Four builds at 2.9 threads each ask for about 11.5 of 16 threads on 8
  cores, so they stretch by an amount not measured.
- Memory, what limits the count, is not measured for this catalog but for codex (below). What is
  known: between 11:00 on 13 November and 10:00 on 15 November (the four catalogs' worth of builds
  below) the user journal records no OOM kill, so two builds at a time stayed inside the 36 GB cap.
  The default count is free memory / 10 GiB (`build-system-snapshot.mjs:29-32`, from a 2026-10-01
  measurement: "most peak below 5 GB, the largest catalog image at 17 GB"); `work/day-round.sh`
  notes codex at 20 GB. The kernel memory each image reports at capture, a lower bound of its
  page's: codex 5,212 MiB, lean 4,213, qwen3.5-4b 4,195, photocraft 3,779, rust-build 3,715
  (`build/image-logs/`). The task that added the scheduler
  (`tasks/20260930-231102-parallel-images`) closed on 2026-10-01 with that day's catalog, 41
  images, built 4 at a time in 48 minutes; `work/day-round.sh` then split the catalog
  by memory (codex and mojo 2 at a time, the light images 3, the heavy ones 1), and the rounds since
  13 November run everything 2 at a time.
- Images measured on 2026-11-17, each built alone in a scratch copy of the tree with its
  dependencies' snapshots (`scratch-setup.sh`, `scratch-build.sh`, `scratch-series.sh`; one
  builder in a 28 GB cap) and its Chrome sampled every 5 s (`sample-chrome.py`,
  `scratch-IMAGE-samples.txt`, `scratch-IMAGE-build.log`). Another project's jobs held the machine
  at a load of 20-28 for part of it, so some times are longer than the round's; every snapshot
  but godot-editor's came out the round's byte for byte (`20261116-140603-buildtime-05`).

  | Image | Time alone (round) | Peak PSS | CPU, cores on average |
  | --- | --- | --- | --- |
  | codex (noted at 20 GB in `work/day-round.sh`) | 2,671 s (2,428) | 13,560 MiB | 8,778 s, 3.3 (4.1 while cargo's `-j 4` had crates to run) |
  | rust-build | 3,717 s (2,196) | 8,391 MiB | 9,069 s, 2.4 |
  | lean-meta | 2,982 s (1,953) | 6,643 MiB | 10,585 s, 3.5 (up to 5.7) |
  | photocraft | 2,070 s (2,141) | 8,129 MiB | 4,251 s, 2.1 |
  | llvm-build | 2,789 s (3,103) | 4,025 MiB | 10,480 s, 3.7 |
  | godot-editor | 843 s (1,168) | 6,132 MiB | 3,241 s, 3.8 |
  | zig-llvm-build | 1,596 s (1,734) | 7,434 MiB | 1,609 s, 1.0 (zig1 in WAMR, then one `cc` of zig2.c) |
  | mojo-llvm | 2,021 s (2,313) | 4,863 MiB | 6,566 s, 3.2 |
  | lean-std | 946 s (1,208) | 5,801 MiB | 6,182 s, 6.4 (Lean's own threads) |
  | lean | 812 s (914) | 6,657 MiB | 1,806 s, 2.2 |

  The heaviest four of these that can run at once in the graph (none depends on another) are
  codex, photocraft, zig-llvm-build and lean: their peaks sum to 35,780 MiB (34.9 GiB), just inside
  `MemoryMax=36G` were all four at their peak together.
  llvm-build and godot-editor, built alone at a quieter hour, took 10% and 28% less than in the
  round, where a second build shared the cores. zig-llvm-build keeps one core busy for 27 min.
  Not measured: llvm22 (4,552 s, the longest), rust-llvm (1,589 s) and the images under 900 s.
- Inside a build, 80 recipe rows use `-j4` or `-j 4`, and `nproc` prints 4
  (`programs/commands/nproc.c`). Four recipes say "-j8 exceeds the 32-process cap"
  (`demos/llvm/Dollyfile-llvm22-tablegen:59`, `demos/llvm/Dollyfile-llvm-tablegen:68`,
  `demos/godot/Dollyfile-spirv-wgsl:41`, `demos/mojo/Dollyfile-mojo-llvm:95`); the kernel's limit
  is 56 since `2b9fd4a49` (2026-10-23, `kernel/process-kernel.c:23`), spawns admitted under a
  memory budget. Whether `-j8` shortens the chain's rust-build and codex is not measured.

What it costs: at 2 jobs a full catalog is capacity-bound at 5.7 h; the graph allows 2.1 h. The
0.1.6 and 0.1.7 rounds of 13-15 November built 999 images, four catalogs' worth, in 50.7 h of build
time (`rebuild-reasons-1113-1117.txt`).

## Smallest fix

1. Record each build's peak memory in its image log: `build-snapshot-browser.mjs` starts each
   builder's Chrome; sample the PSS of its process tree (`/proc/PID/smaps_rollup` of each
   descendant) every few seconds and log the peak, as the 2026-10-01 numbers were taken. (A scope
   per builder would not hold it all: Chrome moves its browser process into an
   `app-com.google.Chrome-PID.scope` of its own, which the journal shows for every build.)
2. Build one full catalog at `DOLLY_IMAGE_JOBS=4` in the 36 G cap (a seed round, which rebuilds
   everything anyway) and record its wall time and the peaks.
3. From those numbers: the rounds' count, and in the scheduler the ready image with the longest
   remaining chain first (a sort of `waiting` by it).

## Done when

A full catalog's wall time at the chosen count, with every image's peak memory, is in this task
against 5 h 49 min at 2, and the round scripts use that count.
