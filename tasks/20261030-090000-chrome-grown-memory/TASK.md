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
  Chrome charges nothing (none of its mappings gains `ac`) and its RSS does not move, either
  way. Firefox charges the whole maximum: 2.2 GiB idle, 10.1 GiB while a
  `-pthread` program that starts no thread runs with `a15a3c6c`, 2.0 GiB with the reservation
  at the first spawn, 10.0 GiB while one with a second thread runs. RSS unchanged.
  Linux's default overcommit refuses one such growth on a machine whose RAM and swap together
  hold less than 8 GiB, and its strict mode counts every one. Windows commits grown memory in
  both browsers; not measured (no Windows here).
- Of the catalog's 186 images, the threaded programs are git (and its remote helpers), rg, fd,
  cargo, codex, protox, cbindgen, naga, lean, lake, ocamlrun, ghostty, wine, glib's tools,
  voice and speech-to-text. git (upstream's source) starts threads for an index of 1,000 entries
  or more (`preload-index.c`), grep, packs and its asyncs (fetch, push): with the reservation
  at its start every git command charged Firefox 8 GiB, `git status` in a small repository too.
- A reservation the browser refuses fails `pthread_create` with `EAGAIN`, POSIX's answer for
  a lack of resources, instead of refusing the program; the spawn budget counts the process
  with the size it had when its second thread started, not its maximum (which would hold every
  fan-out of a threaded parent such as cargo to one child) nor its first size.
- The thread that spawns waits in its call until it sees the new size (`src/process-worker.mjs`),
  as the kernel's growth already did: in 20 runs in Chrome of a program that fills the
  maximum's last page right after `pthread_create` it trapped in none without that wait
  either, so it closes the case where the reply comes before the thread waits, not an
  observed failure. It costs nothing measurable (that program, 20 runs each way in Firefox).
- The kernel's memory grows in `runtime@0`'s Worker (`host/runtime/grower.mjs`). Each request
  with its own control word, posted to the grower (`ff095b5b`), deadlocked in Chrome
  (2026-11-02, `fix/boundary-hang`): the runtime Worker posts the request and waits in
  `Atomics.wait`, and Chrome holds a message posted to a Worker that started moments before
  until the sender's next task. On a blank page, a message posted to a nested Worker right
  after its "ready" was not delivered within 3 s while the sender waited, and was after one
  event-loop turn; Firefox delivered it at once (`build/boundary-evidence/grow-repro2.log` in
  `work/audit-host`). `test/boundary-browser.mjs`, whose kernel-bounds check grows past the
  maximum right after the grower starts, hung there. The grower is again handed its memory and
  control once and served through the control's word, so the late notify `72a223ff` fixed can
  occur again; both sides wait in a loop on the word, and
  `test/memory-growth-notify-browser.mjs` with its fixture is back. Measured on `default` and
  `system` built for that branch: `boundary-browser` hangs in Chromium (120 s) with
  `integrate/2026-11-02`'s three files and passes with the fix in Chromium (2.4 s) and Firefox
  (4.2 s, which passed before too); `memory-growth-notify`, `memory-growth`, `threads` and
  `core` pass in both. Without the runtime Worker's loop on the word, `memory-growth-notify`
  fails to boot `system` as `72a223ff` measured ("memory access out of bounds" in Chromium,
  "index out of bounds" in Firefox). A process's memory grows in a
  Worker of that file which ends after it, the next one started ahead (the spawn waits as a
  deferred call; 13 to 22 ms for a program's first thread in Chrome, against about 10 ms in a
  lasting Worker and 40 ms with a Worker started then; 20 to 25 ms in Firefox either way). In a
  lasting Worker, the `lean` image build was killed by its 9 GB cap: an idle isolate keeps a
  memory it was handed until it collects garbage, so each process with threads stayed resident
  after it ended (`build/lean-evidence/leak/leak.mjs`: six runs touching 512 MiB, the scope's
  anonymous memory rose by 0.5 GiB each until a collection, in both browsers).

Verified: `test/fixtures/threads-grown.c` (the spawning thread fills the maximum's last page,
then a thread fills each page another grows) fails on `main` in Chrome with `memory access
out of bounds`; `threads-browser` and `memory-growth-browser` pass in Chromium and Firefox.
With `a15a3c6c` 0 of 480 Lean runs trapped in an image build (the stress above); the rule
is the same, since what a process grows before its second thread it grows alone.

Found on the way, older than this: a process that ends leaves its memory resident until the
runtime Worker collects garbage, which its small heap rarely needs. The same six runs without
threads rose to 3.8 GiB in Chrome before a collection, on `main` too, and stayed flat when the
Worker was made to collect after each process (`--expose-gc`, a diagnostic). No browser frees a
shared memory on request, so only that Worker's collection releases it. A memory taken to its
maximum likely makes it worse (not measured apart): it grows once, by another isolate, where a
process growing itself made the runtime Worker allocate a new buffer object at each step. With
the reservation the `lean-meta` image build was then killed by its 9 GB cap while it
copied the finished image, which passed at 8.7 GB before. `tasks/20261101-102515-retained-process-memory`
carries what was done about it.

Left for the owner: the spawn budget no longer sees what a process with threads allocates after
its second thread starts (its memory then is all grown; Linux shows none of it until touched), so
`lake build -j4` of four `lean`, each importing 1.7 GB, is not held back as four unthreaded
processes of that size would be. Counting such a process at its maximum would hold every fan-out
of a threaded parent (cargo's rustc) to one child. What would let the budget see it is the libc
adapter reporting its break to the kernel when `sbrk` moves past it in such a process: a process
contract change (`abi/`), not made.

Done-when: merged with the decision in `docs/process-model.md`.

## Lessons

- A fix for one browser's defect has a cost in the other: measure both before choosing where the
  fix binds. Here the rule (no growth while two threads run) was right, the place (every
  `-pthread` program's start) charged Firefox 8 GiB for git commands that never start a thread.
- A helper Worker that is handed a memory keeps it alive until that Worker collects garbage; a
  Worker used once and ended releases it at once.
- A thread that waits in `Atomics.wait` must not wait for a message it has just posted: Chrome
  delivers a message to a Worker that started moments before only after the sender's next task.
  Hand a helper its shared state once, let it say it waits, and pass requests through words.
