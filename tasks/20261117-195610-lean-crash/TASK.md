# lean-std's build tab crashes: lean's Workers fill the 4 GiB heap cage all of a tab's Workers share

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: lean,0.1.8,bug

Found in the 0.1.8 round (`integrate/0.1.8` at 7f0810cbf): `lean-std` failed twice with
`page.evaluate: Target crashed` mid-way through stage 1 (`lean-stage0`'s `lean` compiling each
`.lean` file, `cc` each `.c`), with `lean-meta` and `lean` skipped behind it. It built in v0.1.7.

## Reproduce

    DOLLY_BUILD_IMAGES=lean-std DOLLY_IMAGE_JOBS=1 npm run image

with `DEBUG=pw:browser` to see Chrome's stderr. On `fix/lean-crash` before the fix it crashed 7 min
into stage 1, after 178 of the compiles (the round's crash came after 115, at other files: it is
not one file's).

## Cause

Chrome's renderer ran out of the 4 GiB pointer-compression cage, the heap every isolate of the
tab shares (the page, the runtime Worker and every process and thread Worker), not of memory:

- Chrome's stderr at the crash (`work/lean-scratch/run1.out`): a Worker 15 ms old, with 0.3 MB of
  heap, could not allocate: `Mark-Compact (reduce) 0.3 (0.8) -> 0.3 (0.8) MB ... last resort; GC in
  old space requested`, then `V8 javascript OOM (CALL_AND_RETRY_LAST)`. 41 Workers were alive.
- The round's crash, kept by apport (`/var/crash/_opt_google_chrome_chrome.1000.crash`, 04:12,
  signal 5): of the 4 GiB at the start of the V8 sandbox, 4,074 MiB were committed. 10,164
  mappings, so not `vm.max_map_count` (`tasks/20261101-102515-retained-process-memory`); 7.8 GB
  resident, the machine had 45 GB available.
- What a Worker of lean costs there, measured in Chrome 156 (`work/lean-scratch/probe-run.mjs`:
  Workers that instantiate `/usr/lib/lean-stage0/lean`, one more at a time, the cage read from
  `/proc/PID/maps`): 61 MiB a Worker for the instance alone, 101 with the process interface the
  supervisor sends every Worker, 128 with dso@0's map of the exports built from it. v0.1.7's lean
  costs 6.5 MiB a Worker with all three.

The difference is ws/ports' Lean linked `-rdynamic` (2493b117e): lean exports 234,338 symbols
(225,132 functions, 9,203 globals), v0.1.7's 31. V8 makes an exported function object for each in
every instance, the supervisor sent the export list (46 MB as JSON) in every Worker's
configuration, and dso@0 made a map of them all in every Worker. Four `lean` processes with their
task threads are about 30 such Workers. Measured, the other candidates needed no bisecting: no
Worker or memory outlived its process (the Worker count and the sandbox's committed memory rose
and fell with the build), the dead `promising` stacks stayed at about 1,500, and the fix alone,
on top of all of them, builds the three images.

## Fix

The supervisor sends a process's exports as an index (`page/wasm-interface.mjs` `exportIndex`):
the names sorted in shared buffers that every Worker of the process reads, each with the index of
its type among the distinct types (1,152 for lean). dso@0 looks a symbol up when it is first asked
for (`exportType`) instead of mapping them all. A lean Worker then costs 62 MiB of the cage, the
instance's own (the probe, `index` variant); building the index takes 0.2 s a compile of lean.

What remains is V8's: an instance of lean holds 61 MiB of the cage, about 260 bytes an export.
The probe's tab now ends at its 62nd lean Worker, before the fix at about its 31st. lean-std's
build peaked at 3,332 MiB of the cage with up to 55 Workers (`work/lean-scratch/cage2.out`):
`make -j4` of leans that each run Lean's task threads (Dolly reports four cores to a threaded
program, `host/threads/pthreads.c`), and their `cc`. More lean Workers at once could fill it
again. Without exports, as v0.1.7's symbol table in memory had it, a Worker would cost 6.5 MiB.

## Closed 2026-11-18

Fix: fde45bc69 on `fix/lean-crash` (from `integrate/0.1.8` at 7f0810cbf). Built with it, one
image at a time, the cage's peak beside each (`work/lean-scratch/cage2.out` to `cage4.out`,
sampled every 3 s; the build logs `run2.out`, `run3.out`):

- lean-std: 789,740,790 bytes (v0.1.7's 789,741,105), 3,332 MiB with up to 55 Workers;
- lean-meta (`make -j3`): 1,581,466,901 bytes (v0.1.7's 1,581,467,300), 1,726 MiB with up to 33;
- lean (one job, then the recipe's lean and lake checks): 796,331,898 bytes, 1,039 MiB.

Passed in Chromium and Firefox: `demos/lean/test/lean-browser.mjs` (94 s and 106 s), `process`,
`threads`, `ending`, `process-memory` and `dso`; the source suite 473 of 473.
