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
