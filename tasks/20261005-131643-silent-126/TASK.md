# Programs die with a silent exit 126: undeclared host modules and a NULL packet

- STATUS: OPEN
- PRIORITY: 310
- TAGS: core,kernel,diagnostics

An agent working inside the deployed `pi` image (release `223b8f9e…`,
2026-10-03) hit three failures that look identical: the program prints nothing
and exits 126 (`~/Downloads/AUDIT-sandbox-painpoints.md` §6, §7, §11).

- A program importing `dolly_thread_spawn` or `dolly_thread_self` never starts,
  although the image's `/etc/dolly/Dollyfile` declares `threads@0`.
- `dolly_gpu_open` in an image without `gpu@0`: the same, with no line saying
  the module is not declared. The image still ships `gpu.h`, `audio.h` and
  `threads.h`.
- `dolly_process_call(16 /* FD_READ */, NULL, 8)` kills the Worker, while the
  neighbouring malformed packets return a negated errno.

`docs/process-model.md` promises a one-line diagnostic for 126.

## Done when

- Each case is reproduced by a browser test first.
- Every refusal (undeclared or unprovisioned host module, unknown import,
  malformed packet) writes one line naming the cause to the program's stderr;
  a malformed packet returns an errno and the Worker survives.
- A program compiled inside an image against a module that image declares runs.
- Headers for modules an image does not declare: ship or not, decided and
  recorded here.

## Review note (2026-10-05, `20261005-131642-big-picture`)

One cause explains all three "no output" cases: the diagnostic exists but is
addressed to the person at the page. `#fail` (`src/process-supervisor.mjs:657-670`)
and the launch refusals (`:377-378`) write `dolly: process N Worker failed ...`
with `#writeTerminal`, the terminal device, never the failed process's
descriptor 2. An agent runs commands with captured output, so it sees an
empty stderr and 126. The rule to state in `docs/process-model.md`: a refusal
at a boundary is reported to the program that asked (its stderr, or an errno
its caller prints), because the agent is the user. Related: `cc`, `c++`, `ld`
and `ar` retry status 126 twice (`src/process/runtime-adapter.c`), so a
deterministic refusal of the compiler runs three times before it is reported.

## Findings (2026-10-05, `fix/audit-core`)

Reproduced in Chrome on the base (`integrate/1005-seed`, image inputs
`42d82dcc…`) before any fix; logs in `build/audit-core-evidence/repro-base-*.log`
and `probe-threads-{default,pi}-base.log`.

- One cause for the silence, as the review note says: `#fail` wrote to the
  terminal device. `/tmp/gpu-client > out 2> err` in `system` printed
  `dolly: process 136 Worker failed during startup: Required host ABI gpu@0 is
  unsupported` on the terminal and left `err` empty.
- The threads case, in the `pi` image, which declares `threads@0`:

  ```
  $ cc /tmp/self.c -o /tmp/self; echo cc=$?        # calls dolly_thread_self()
  cc=0
  $ /tmp/self > /tmp/out 2> /tmp/err; echo rc=$? err=$(wc -c < /tmp/err)
  dolly: process 124 Worker failed during startup: threaded process needs dolly_thread_start(i32, i64) -> i64
  rc=126 err=0
  $ cc -pthread /tmp/self.c -o /tmp/self-mt && /tmp/self-mt
  tid 3
  ```

  The module was provisioned. `cc` links every host client archive it finds,
  so a program that calls `<dolly/threads.h>` gets the `threads@0` record
  without `-pthread`; the loader (`validateThreadProfile`,
  `host/threads/threads.mjs`) treats every program with that record as
  threaded and requires the `dolly_thread_start` export, which only the
  `-pthread` runtime (or a language runtime) provides. The compiler and the
  admission rule disagreed: one linked what the other refuses.
- `dolly_process_call(DOLLY_PROCESS_FD_READ, NULL, 8, …)`: the process Worker's
  range check threw (`Dolly process supplied an invalid syscall range`), which
  ended the process with 126. The same held for every operation, for a range
  outside memory, and for an operation number above 2^31; a packet over 1 MiB
  ended it in the supervisor (`sent an invalid syscall`). The kernel's own
  dispatch already returned errnos.

## Fix

- Refusals and failures go to the program: the supervisor hands one line to
  the kernel (`dolly_process_worker_failed`, `abi/dolly-supervisor-0.wat`),
  which writes it to the failed process's descriptor 2 and records 126
  (`src/process-supervisor.mjs`, `src/process-kernel.c`). The line names the
  cause: `dolly: process 136 was refused: host module gpu@0 is not declared by
  this image (REQUIRES HOST)`, `… has a different layout than this program was
  built for`, `… a program using threads@0 must export dolly_thread_start(i32,
  i64) -> i64; build C and C++ with -pthread`; a Worker that fails while
  running prints `dolly: process N failed: REASON`.
- `cc` refuses to link a thread client without a thread entry and says to use
  `-pthread` (`src/compiler.cpp`, seed), so what it links the loader runs;
  `threads.h` documents it.
- A malformed call returns an errno from the process Worker for every
  operation: `EFAULT` for a range outside memory (NULL included), `E2BIG` over
  the packet limit, `ENOSYS` for an unknown operation
  (`src/process-worker.mjs`).
- `docs/process-model.md` states the rule: a refusal is reported to the
  program that asked.

Decisions:

- Headers of modules an image does not declare stay in every image: they are
  the compiler's sysroot and images build for other images. The refusal line
  now tells the program which module the image lacks.
- Status 126 still covers a refused executable and a Worker that failed while
  running; the line tells them apart ("was refused", "failed").
- FFI packets carry pointers of the process itself. A wild one (a NULL or
  out-of-range `ffi_cif`, type or closure) returned through a JavaScript
  exception and ended the process; it is `EFAULT` or `EINVAL` now. Only what
  the called function throws passes through (`src/process-ffi.mjs`).
- Left: `cc`, `c++`, `ld` and `ar` still retry status 126 twice, so a refusal
  of the compiler itself would print three lines; that retry exists for
  transient Worker allocation failures and cannot tell them apart by status.
