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

## State (2026-11-18, the compiler batch)

A runtime change on `fix/compiler-batch`, `-rdynamic` kept. Measured first, Chrome 138, the V8
heap one instance of a module of 234,338 functions takes, by how they leave it
(`build/agent/exports-probe.mjs` of `work/compiler`, not committed; four instances each, `gc()`
between): 1.8 MiB with no export, **50.0 MiB with each one exported**, made when the instance
is (reading an export after adds nothing), and **8.0 MiB with all of them in an exported
table** instead, whose entries V8 makes when first read. The cost is the exports' objects, of
the instance (not of the module or `instantiate`'s form), so threads cannot share it: each
thread's Worker is an instance.

So the process supervisor moves a program's function exports, but `_start` and Dolly's own
(`dolly_*`, `__dolly_*`, which the runtime and host modules call by name), into a table it adds
to the module before compiling it (`exportFunctionsByTable` in `page/wasm-interface.mjs`,
exported as `__dolly_exports`), and dso@0 reads a symbol there by its slot in the shared export
index (`findExport`). Every program with an export it does not call by name gets it; for the
others nothing changes. `test/process-abi.test.mjs` checks the move (a module with and without
a table and element section of its own) natively.

Proved on 0.1.8's integration images (the change is the runtime's alone): `test/process-`,
`threads-`, `dso-` and `process-memory-browser.mjs` pass in Chromium and Firefox (dso's first
Firefox run failed at `process-signals.c`'s check that git removed its `index.lock` after a
signal, a timing check of git's, and passed when run again), and again, all in both browsers,
on the seed the batch's compiler makes. `measureUserAgentSpecificMemory`
does not attribute a process Worker (a Worker's Worker), so it could not compare rustc's.
Not measured here: lean-std's own peak (the Lean images are not in this tree); the round's
lean-std build confirms it.

## Do

Measure what makes Chrome's per-export cost, per Worker: the exports object, eager wrappers,
`WebAssembly.Instance` against `instantiate`, a module shared by several instances. Then find a way
that holds for any program: for example, instantiating so that the exports a process never asks
for cost nothing, or one instance's exports serving the process's threads. Measure lean-std's cage
peak before and after.

## Done when

lean-std's build peaks well under the cage (half or less) with `-rdynamic` kept, and the core
process, threads, dso and process-memory tests pass in Chrome and Firefox.
