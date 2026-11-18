# A program with many Wasm exports costs Chrome's tab cage 62 MiB a Worker: lean-std peaks at 3.3 of 4 GiB

- STATUS: OPEN
- PRIORITY: 160
- TAGS: lean,dso,browser,memory

Left by `20261117-195610-lean-crash` (closed, `fix/lean-crash`).

Chrome gives a tab one 4 GiB pointer-compression cage, shared by the page and all its Workers.
Since ws/ports, lean is linked `-rdynamic` (upstream's way) and exports 234,338 symbols; v0.1.7's
exported 31. The crash fix (fde45bc69) took the supervisor's export list and dso@0's map out of
each Worker, so a lean Worker went from 128 MiB of cage to 62 MiB.

What remains is Chrome's own cost: the function objects it makes for an instance's exports.
lean-std's build now peaks at 3,332 MiB of the 4,096 (55 Workers), and a probe tab crashes at
its 62nd lean Worker. More lean processes or threads at once would fill the cage again.

The integrator decided (2026-11-18) to keep upstream's `-rdynamic`, not v0.1.7's Lean-specific
in-memory symbol table. The fix belongs where it is general: any program with many exports pays
this.

## Do

Measure what makes Chrome's per-export cost, per Worker: the exports object, eager wrappers,
`WebAssembly.Instance` against `instantiate`, a module shared by several instances. Then find a way
that holds for any program: for example, instantiating so that the exports a process never asks
for cost nothing, or one instance's exports serving the process's threads. Measure lean-std's cage
peak before and after.

## Done when

lean-std's build peaks well under the cage (half or less) with `-rdynamic` kept, and the core
process, threads, dso and process-memory tests pass in Chrome and Firefox.
