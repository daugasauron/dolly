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

## Decision (2026-11-01): the memory takes its maximum before a second thread starts

The defect is Chrome's: an access ordered after another thread's growth (Lean's blocks reach a
thread through malloc's lock) must see the grown memory, and Firefox's does. Dolly cannot
change V8's per-thread record, and no thread can tell another to refresh it: a thread takes the
growth at its next interrupt check, which nothing outside V8 observes. Growing in larger steps
only makes the trap rarer. What Dolly controls is the cause on its side, a size that changes
while two threads run. So a process's memory takes its maximum before its second thread
starts and never grows after; that is the rule, kept at the one place it binds.

`a15a3c6c` grew every program built with `-pthread` at its start. It moves to the first thread
spawn (`#reserveMaximum`, `src/process-supervisor.mjs`):

- Measured on Linux (`build/lean-evidence/memory-cost/measure.mjs`, `system`, the scope's
  processes' mappings marked `ac` in `smaps`, which Linux charges to its commit limit):
  Chrome charges nothing and its RSS does not move, either way (V8 reserves the maximum with
  `MAP_NORESERVE`). Firefox charges the whole maximum: 2.2 GiB idle, 10.1 GiB while a
  `-pthread` program that starts no thread runs with `a15a3c6c`, 2.0 GiB with the reservation
  at the first spawn, 10.0 GiB while one with a second thread runs. RSS unchanged.
  Linux's default overcommit refuses one such growth on a machine whose RAM and swap together
  hold less than 8 GiB, and its strict mode counts every one. Windows commits grown memory in
  both browsers; not measured (no Windows here).
- Of the catalog's 186 images, the threaded programs are git (and its remote helpers), rg, fd,
  cargo, codex, protox, cbindgen, naga, lean, lake, ocamlrun, ghostty, wine, glib's tools,
  voice and speech-to-text. git starts threads only for large indexes, packs and grep; with
  the reservation at its start every git command charged Firefox 8 GiB.
- A reservation the browser refuses fails `pthread_create` with `EAGAIN`, POSIX's answer for
  a lack of resources, instead of refusing the program; the spawn budget counts the process
  with the size it had when its second thread started, not its maximum (which would hold every
  fan-out of a threaded parent such as cargo to one child) nor its first size.
- The thread that spawns waits in its call until it sees the new size (`src/process-worker.mjs`),
  as the kernel's growth already did: in 20 runs in Chrome of a program that fills the
  maximum's last page right after `pthread_create` it trapped in none without that wait
  either, so it closes the case where the reply comes before the thread waits, not an
  observed failure. It costs nothing measurable (that program, 20 runs each way in Firefox).
- The kernel's memory and a process's now grow in the one Worker of `runtime@0`
  (`host/runtime/grower.mjs`), each request with its own control word: the late-notify race
  `72a223ff` fixed cannot occur, so `test/memory-growth-notify-browser.mjs` and its fixture
  go; the supervisor's own Blob Worker goes.

Verified: `test/fixtures/threads-grown.c` (the spawning thread fills the maximum's last page,
then a thread fills each page another grows) fails on `main` in Chrome with `memory access
out of bounds`; `threads-browser` and `memory-growth-browser` pass in Chromium and Firefox.
With `a15a3c6c` 0 of 480 Lean runs trapped in an image build (the stress above); the rule
is the same, since what a process grows before its second thread it grows alone.

Done-when: merged with the decision in `docs/process-model.md`.
