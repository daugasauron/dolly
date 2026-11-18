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

## Reopened 2026-11-18: an uncaught exception in the full round

The round on 0ae1331a2 (unit `dolly-round-018f`, lean-std beside two other builds) failed
otherwise: lean compiling `Std/Data/DTreeMap/Internal/Model.lean`, the 612th of 1,147,
`dolly: process 8399 failed: [object WebAssembly.Exception]`, then make's Error 126
(`work/integrate-018/build/image-logs/lean-std.log`, line 5398).

### What the message hid

A C++ throw that no frame catches leaves a Wasm program as a `WebAssembly.Exception`: Wasm
unwinds in one phase, so the throw cannot learn that nothing catches it, as a native one does
before it calls `std::terminate`. Dolly's libc++abi would not say what it was anyway: its
`abort_message` is Emscripten's, whose `__EMSCRIPTEN__ && NDEBUG` branch, `__dolly__` here,
aborts without printing. The process Worker now names it (`page/process-worker.mjs`
`failureMessage`): "an exception the program threw and none of its frames caught", and where the
program exports what it takes (`-rdynamic`, as lean is), the C++ type and a std::exception's
`what()`, read through `__cxa_begin_catch`, `__cxa_current_primary_exception` and the type
infos: `C++ St13runtime_error: no frame catches this` (`test/dso-browser.mjs`, Chromium and
Firefox).

### The cause: lean's threads under load

lean's only C++ throws a build can meet are `lean::exception`s of its runtime, and of those only
`failed to create thread` depends on the machine (`src/runtime/thread.cpp`; the kernel's are
caught where it is entered, and the cgroup's `memory.events` had no `max` event). Measured with a
line per thread spawn in the supervisor (not kept):

- Lean's task manager adds a thread for every pool task that waits for another (`wait_for` in
  `src/runtime/object.cpp`) and never ends one. A lean grows with the build's contention: beside
  the round's three builds (load 30 to 49), lean-std's leans took at most 20 threads each and 41
  in all, twice, with no failure (`run4.out`, `run5.out`).
- With four leans on two CPUs (`Model.lean` and the heaviest Init modules again and again,
  `probe1.out`): one lean took 21 threads, the four 59, and the tab crashed, `V8 javascript OOM`
  (this task's first cause: at 62 MiB of the cage a lean Worker). Short of that, threads@0's 64
  in all or 32 a process answer `EAGAIN`, which `lthread` throws as `failed to create thread`,
  that no frame of lean catches: the round's failure. A lean whose tasks each wait for one
  they spawn, forty deep (`nest n := (Task.spawn fun _ => nest (n - 1)).get + 1`, a test not
  kept, `t16.out`, `t17.out`), ends as the round's did, status 126, and now says so: `dolly:
  process 120 failed: an exception the program threw and none of its frames caught: C++
  N4lean9exceptionE: failed to create thread: Resource temporarily unavailable`.
- What a lean takes does not depend on how many run beside it: `lean -j1` still took 20
  (`probe2.out`), and two leans at once on the two CPUs 21 and 13, 34 in all (`probe4.out`).
  `-DElab.async=false`, which turns off the asynchronous elaboration lean's command line turns
  on, held a lean to 8 (`probe3.out`), but the build is not upstream's without it: lean-std then
  fails at `Init/Data/String/Basic.lean`, "environment already contains
  'String.utf8EncodeChar.fun_cases_unfolding'" (`run6.out`).

### Fix

lean-std and lean-meta run two leans at once (`make -j2`, from four and three): at the 21 threads
a lean was seen to take, two stay under threads@0's 64 and, at 62 MiB of the cage a Worker, under
what a tab holds. The lean image's one job is unchanged. What a lean takes is upstream's; Lake's
own builds in a session (`lake build`'s jobs) can still meet the tab's limits, now with a failure
that says which (`task 20261117-220855` is the cage's cost).

## Closed again 2026-11-18

`eaf5ca0a5` (the message) and `a4798f2b7` (two jobs) on `fix/lean-crash`, from `0ae1331a2`.
Built in `work/lean` (`DOLLY_BUILD_IMAGES=lean`, `run7.out`) beside a second lean-std build in
another tree (`run8.out`, which passed too, in 9,495 s), then that tree's lean-meta (stopped at
588 of its 1,227 leans to keep the disk above 15 GB, no failure, `run9.out`), with other builds
on the machine (load 12 to 29); the cage's peak beside each (`cage8.out` to `cage12.out`):

- lean-std: 789,741,549 bytes in 7,114 s (the round's four jobs: 6,772 s), 1,807 MiB with up to
  36 Workers (the second build: 1,958 MiB, 36);
- lean-meta: 1,581,467,539 bytes in 6,148 s, 1,207 MiB with up to 24;
- lean: 796,332,492 bytes in 1,227 s, 894 MiB.

Passed in Chromium and Firefox: `demos/lean/test/lean-browser.mjs` (92 s; 139 s and 129 s),
`process`, `threads`, `ending`, `process-memory` and `dso` (`t13-*.out`). Under the builds,
`process-memory` failed once in Chromium (553 MiB over the baseline after 512 spawns) and passed
when run again; `process` failed at times at the lifecycle test's process room, with this
change and without its code called: `tasks/20261118-090242`.
