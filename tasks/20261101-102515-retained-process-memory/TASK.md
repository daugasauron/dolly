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

## Made (2026-11-01): the supervisor reports the garbage

A process's memory taken to its maximum before its second thread
(`tasks/20261030-090000-chrome-grown-memory`) grows once, by another isolate, so the runtime Worker
no longer allocates a buffer object at each of its steps, which likely made it collect even less
(not measured apart): the `lean-meta`
image build was killed by its 9 GB cap while it copied the finished image (8.7 GB before). So
`#disposeWorker` allocates an untouched `ArrayBuffer` of the dead memory's size (at most 2 GiB) and
drops it: the bytes that became garbage, which the collectors' own count lacks. It touches no page.
Same six runs: Chrome keeps at most one dead process with or without threads (0.78 to 1.28 GiB),
Firefox none without threads and at most two with them.

This steers the collectors' heuristics rather than freeing anything, the one lever JavaScript has.
The deterministic design is for the owner: the runtime Worker holding no reference to a process's
memory at all, the copies between it and the kernel's done in the process's own Worker, ended with
it (the gate's job today), at the price of kernel memory in process Workers, which the security
perimeter allows (in-Wasm compromise is assumed) but the design has kept out.

Done-when: a process's memory is released when it ends, measured with that program in Chromium and
Firefox, without steering a collector. A pool handing dead memories to the next process would not
do: it never frees one either, a memory never shrinks, and a process with threads has all 8 GiB.
