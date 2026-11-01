# A process that ends keeps its memory resident until the runtime Worker collects garbage

- STATUS: OPEN
- PRIORITY: 200
- TAGS: core,memory,processes


Found 2026-11-01 (`demo/lean-2`, agent E) when the `lean` image build was killed by its 9 GB cap.

The runtime Worker creates each process's shared `WebAssembly.Memory` and its gate instance; when
the process ends the supervisor drops both (`#disposeWorker`), and the Worker that ran it is
terminated. The memory's pages stay resident until the runtime Worker's isolate collects garbage,
which its small heap rarely needs, and no browser frees a shared memory on request.

Measured (`work/lean/build/lean-evidence/leak/leak.mjs`, `system`, six runs in a row of a program
that touches 512 MiB, the scope's anonymous memory after each, Chrome 156 and Firefox 155):

- `main`, Chrome: 1.33, 1.83, 2.31, 2.81, 3.30, 3.80 GiB (then a collection: 1.28).
- `main`, Firefox: rises by 0.5 GiB a run, collected about every third run.
- With the runtime Worker made to collect after each process (`--js-flags=--expose-gc`, a
  diagnostic): flat at 0.8 GiB in Chrome.
- With an untouched 1 GiB `ArrayBuffer` allocated as each process ends: Chrome collects every
  other run, Firefox every run. That steers the collectors' heuristics; it frees nothing itself.

A build of large processes in a row keeps several dead ones resident: the `lean` image's modules
each import 1.7 GB, beside the kernel's 2.4 GB of libraries.

Done-when: a process's memory is released when it ends (or reused by the next process), measured
with that program in Chromium and Firefox, without steering a collector. Candidates: a pool of
memories handed to the next process (zeroed, but a memory never shrinks and a process with threads
has all 8 GiB grown); the gate in a Worker of the process's own, ended with it.
