# Codex hangs at a run in its demo test

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: codex,rust,threads,bug

## Closed (2026-11-04 16:40 JST)

Fixed on `fix/codex-hang` (from `integrate/2026-11-03`, 01880a300): c89b6aec (an ending call leaves
the program by the gate's trap) and 027644b2 (a thread ended before it started ends its own Worker).
On 027644b2 `node demos/codex/test/codex-browser.mjs` passes in Chromium (31.1 s), and 102 codex
runs back-to-back in one session hang none in Chromium or Firefox (`build/codex-evidence/final/`).

Not a seed change: the image inputs stay `e7867504…`, and no image's programs change. The gate's WAT
and three docs are pinned in `Dollyfile-dolly-docs`, so the next catalog round rebuilds
`dolly-docs` and the eleven recipes built on it: `pi-dolly`, `pi-runtime`, `pi-agent`,
`pi-minimal`, `pi-local`, `pi-phone`, `bhop`, `classicube`, `rts-arena`, `slopyard`,
`dollyfile-studio`.

## Report

`node demos/codex/test/codex-browser.mjs` (image `codex-agent`) passed in 36.7 s in the evening
round of 2026-11-03 and timed out at 1,200 s twice on 2026-11-04 (round `dolly-round-1104-day`,
`work/integrate/build/round-1104-evidence/demos.log` and `codex-rerun.log`), each time at a `codex`
invocation that never returned.

## Reproduction

`build/codex-evidence/loop.mjs ROUNDS [chromium|firefox]` (not committed): a `codex-agent` page,
Ctrl-C to the recovery shell, then `codex --version`, `codex --dolly-invalid-option`,
`CODEX_HOME=… codex --version` in a loop, 60 s each. Chromium, runtime and images of 01880a300:
the first `codex --version` printed `codex-cli 0.153.4` and never returned, three runs of three.

## Findings

The supervisor's state at the hang (a temporary hook in `src/process-supervisor.mjs`, read from
the runtime Worker): `/usr/libexec/codex` (pid 109) is threaded; the kernel has recorded its exit
(`dolly_process_exited` 1), the supervisor has not retired it. Its main thread (tid 12) has been
disposed; thread 13 still has its Worker, its control words `[17, 17]`: no call outstanding, so it
runs Wasm, or waits in it, after its own EXIT was answered. The launcher (108) and the shells above
wait in WAIT, which needs the Worker retired (`process-kernel.c`, `worker_retired`).

So thread 13 called `exit`, the kernel accepted it, the supervisor disposed the other thread
(`#syscall`, EXIT) and answered thread 13, whose Worker then throws `PROCESS_EXIT` out of `call`
into the program to leave Wasm (`src/process-worker.mjs`). A JavaScript exception thrown into
Wasm is catchable by Wasm exception handling. Since `toolchain/cargo-test` the images' Rust
programs link the unwinding standard library (`panic = "abort"` for their own crates,
`panic-strategy: unwind` and `-wasm-use-legacy-eh=false` for the library,
`demos/rust/toolchain/wasm64-emscripten-probe.json`): its frames carry landing pads
(`catch_all_ref`), so the exception lands in the program, which runs on with its other thread gone
and never reports `finished`. Yesterday's library had no landing pads, so the exception passed.

The libc adapter itself ends every exit with `__builtin_trap()` after the call
(`__wasi_proc_exit`, `dolly_exit_signal`, `dolly_thread_exit`): a trap is the one way out of Wasm
that no Wasm catch takes. The Worker throws instead.

A C++ `catch (...)` does not take the Worker's exception (a thread's `try { exit(37); } catch (...)
{ for (;;) pause(); }` returned 37 at once), a destructor does: with `struct guard { ~guard() {
for (;;) pause(); } }` in the exiting frame, both a thread whose main thread joins it and the main
thread of an unthreaded program ran on until `timeout 20` ended them (the threads test took 50.0 s
instead of 9.6 s). The exit status stays 37: the kernel recorded it first. Rust's cleanup pads and
the abort guard of an `extern "C"` frame such as `thread_start` are of the destructor's kind.

## Fix

The gate (`abi/dolly-process-gate-0.wat`), trusted Wasm the Worker already instantiates for each
thread, becomes the program's `dolly_process_0.call`: it calls the Worker's `call` and traps when
the answer is -2^63, the value the supervisor already gives a call of a process it is ending and no
call returns. The Worker answers that, instead of throwing, for an accepted EXIT or THREAD_EXIT,
for the supervisor's deferred result, and for a call whose mailbox is sealed; its outer catch then
reports `finished` or `thread-finished` by what it recorded (`ending`). A trap leaves every Wasm
frame without running a handler, whatever the program was compiled with. The guest-visible ABI is
unchanged (same import, same type); the gate's interface test names its new import and export.

The seal no longer parks the thread in `Atomics.wait` until its termination (added for Lean's
destructor that called again, tasks/20261101-102515-retained-process-memory): that call now ends
the thread like the others, and the Worker closes itself instead of waiting to be terminated.

Test: `test/threads-browser.mjs`, the destructor probe above on a thread and on an unthreaded main
thread, each under `timeout 20`, must return 37 within 10 s.

## Verified (2026-11-04)

- Before the fix (01880a300's runtime and images): `codex --version` hung on the first run, three
  sessions of three (`build/codex-evidence/loop-chromium-{1,2,3}.log`).
- After (c89b6aec): Chromium, 108 runs in three sessions of 36 with a second between runs, none
  hung, each 0.05 s (`loop-chromium-batch-*.log`); before them 46 and 74 runs in one session each,
  none hung, until the renderer exceeded the slot's 6 GB (next section). Firefox, 102 runs in one
  session, none hung, its memory flat at 2.2 GB (`loop-100-firefox.log`).
- `node demos/codex/test/codex-browser.mjs`: Chromium passed in 31.5 s (`codex-browser.log`).
- `test/threads-browser.mjs` with the new probe: Chromium 9.4 s, against 50.0 s before; on the
  Worker and gate of 01880a300 it fails, `/tmp/caught ran on after its exit`
  (`threads-old-chromium.log`). Chromium 9.2 s and Firefox 10.9 s after.
- `test/ended-worker-browser.mjs` (the seal's test): Chromium 8,057 mappings before twenty runs,
  7,933 after; Firefox 7,512 and 7,374.
- On 027644b2, in Chromium and Firefox: `core`, `process`, `ending`, `threads`, `ended-worker`,
  `stack`, `dso`, `cpp` and `process-memory` browser tests pass (`final/`, `process-memory-v2-*`);
  the source suite passes (470).
- Not measured: an exit from inside a dso@0 FFI callback, where the trap crosses a JavaScript frame
  before it reaches the program's outer frames; the Codex demo test in Firefox.

## Found on the way: Chromium keeps the memory of a thread ended before it started

Chromium's renderer grew about 97 MiB a codex run, back-to-back or a second apart, and the slot's
6 GB ended it at the 46th run (no pause) and the 74th (1 s pauses); Firefox stayed at 2.2 GB. The
supervisor held nothing between runs (only the four shells and their Workers), and the processes'
Workers had ended. `build/codex-evidence/exit-memory.mjs` (`system`, a program touching 256 MiB,
resident anonymous memory 1 s after each of twelve runs, Chromium):

- the main thread exits, a thread exits while the main thread joins it, or while it waits on a
  futex: flat (the last within one memory, the two seconds Chrome keeps a Worker ended in a wait);
- eight threads created, then `exit` at once: 270 MiB more after every run (1,237 to 4,482 MiB),
  the same on 01880a300's Worker, so older than the fix;
- eight threads created, `exit` a second later: flat.

A thread's Worker gets the process memory over a channel from the thread that created it
(`src/process-worker.mjs`, `processMemory`). Ended by the supervisor before it ran, the Worker never
takes that message, and Chrome keeps it, with the memory, until the runtime Worker collects garbage
(the mechanism of tasks/20261101-102515-retained-process-memory, by another way in). Codex's Tokio
runtime starts its worker threads and `--version` exits before they run.

Fix: control word 5 of a thread's Worker is its start word. The Worker sets it to 1 once it has its
memory, before the program runs; the supervisor ending a thread sets 2 if it is still 0, notifies
it and does not terminate the Worker (`threadHost.release(worker, false)`). The Worker, waiting for
its memory, also waits on the word (`Atomics.waitAsync`) and ends when it turns 2, memory or not:
a Worker that ran owns its port, and what is queued on it goes with it. One compare-and-exchange on
each side decides the race. A first version had the Worker wait for its memory first: Firefox drops
what a port posted once its sender has ended, so there each such Worker lived its full 10 s wait,
and the spawn variant below grew 14 MiB a run in Firefox.

Test: `test/process-memory-browser.mjs` gains ` spawn` (`test/fixtures/process-touch.c`: touch,
create eight threads, exit) beside the main-thread and thread variants. Before the fix (c89b6aec)
Chromium's renderer reached the slot's 6 GB during it and was killed
(`process-memory-before-chromium.log`); after, 948 to 978 MiB over twenty runs in Chromium, 1,181
to 1,195 in Firefox (`process-memory-v2-*.log`). The experiment's spawn case: flat in both. 102 codex
runs back-to-back in one Chromium session, none hung, the renderer between 2.1 and 2.9 GB
(`loop-100-chromium-unretained.log`, with the first version).

## Lessons

- A toolchain change can change how the runtime's own exits behave. Rust's unwinding library put
  landing pads into every Rust image without one line of Dolly changing, and a JavaScript
  exception, which the Worker relied on to leave Wasm, became something the program catches.
  Leaving a program by a trap does not depend on what the program was compiled with.
- Reading the supervisor's state from the runtime Worker at the hang (Playwright's `page.workers()`
  on the `runtime-worker.mjs` Worker, a temporary `globalThis` hook) gave the cause in one run:
  which process the kernel had ended, which thread still had a Worker, and that it was in no call.
  Do not evaluate in every Worker: the memory grower sits in `Atomics.wait` and never answers.
- A loop of the failing command, measured per run, found a second, older bug (the Chromium
  retention) that the demo test's eight runs never reach. Sampling the browser's memory in the
  same loop was what separated "OOM" from "hang".
- The earlier docs said a C++ `catch (...)` takes the Worker's exception. Measured, it does not; a
  destructor does. A claim about what the engine does needs its own probe.
