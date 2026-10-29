# Chrome traps a copy, fill or atomic into memory another thread just grew

- STATUS: OPEN
- PRIORITY: 280
- TAGS: core,threads,bug

Found 2026-10-30 as stage 0 `lean`'s `memory access out of bounds` (2 in about 6,000 runs of
the Lean build, `demo/lean`). Any threaded program in Chrome can meet it; Firefox does not.

Chrome checks `memory.copy`, `memory.fill` (what `memcpy` and `memset` compile to) and atomic
accesses against each thread's own record of the shared memory's size, which follows another
thread's `memory.grow` only at the thread's next interrupt check. A thread that copies into or
fills a region another thread has just grown traps; ordinary loads and stores do not.

- A reproducer, one thread growing and handing each new page to another (Chrome 156): `memcpy`
  trapped 22 of 30 runs, `memset` 16 of 20, an atomic load 2 of 10, a plain byte loop 0 of 30.
  Memory from `malloc` or `sbrk` traps a few runs in a hundred. Firefox 155: 0 of 50.
- Lean: compiling `Init/Data/Range/Polymorphic/IntLemmas` with eight threads, four at once,
  trapped 10 of 480 runs; every stack ends in a copy or fill of memory `malloc` had just
  returned (`lean_copy_expand_array`, `lean_string_append`, a `std::unordered_map` rehash).
  About 1 in 3,000 at Lean's default threads.

## A fix, not merged: `core/thread-memory-max` (`a15a3c6c`)

A threaded process's memory is grown to its 8 GiB maximum, in a Worker of its own, before its
first thread starts, so it never grows while two threads run; it counts against the spawn
budget with the memory it started with. `test/fixtures/threads-grown.c` in
`test/threads-browser.mjs` trapped 10 of 10 without it. With it: 0 of 240 Lean runs in a
session, `threads-browser` and `stack-browser` pass in both browsers, an IntLemmas compile
takes 17.3 s against 16.4 s.

Not merged into v0.1.4 (the bug is as old as threads): every threaded process then holds
8 GiB of grown memory. On Linux here its resident memory did not move; Chrome on Windows
commits grown memory against the system's commit limit, and Linux with little memory and swap
may refuse it. Measure that, or find a fix that does not grow every threaded process to its
maximum, before merging. `docs/process-model.md` then says it.
