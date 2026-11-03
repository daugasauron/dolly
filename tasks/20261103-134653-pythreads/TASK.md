# Python with real threads: CPython on threads@0 in place of its thread stubs

- STATUS: OPEN
- PRIORITY: 360
- TAGS: python,threads

Owner (2026-11-03): "Is python compiled without threads? I want it to have threads now that they
exist."

It is: `demos/python/Dollyfile-python` builds CPython with Dolly's patch porting "the thread stubs"
(`DOLLY-CHANGES`: "thread targets run serially"), declares no `threads@0`, and its pip config turns
off progress bars because their refresh thread "would never yield under Dolly's serial threading".
`threads@0` runs a program's pthreads on Workers over shared memory (Git and the Rust toolchain use
it; `docs/process-model.md`).

Done when: CPython is built with pthreads (`-pthread`, `REQUIRES HOST threads@0`) and the patch no
longer stubs threads; `threading.Thread`s run concurrently (a test where two threads wait on each
other, which deadlocks under serial threads), CPython's own threading tests (`test_threading`,
`test_thread`, `test_queue`, `concurrent.futures`) pass or each failure is explained, pip's progress
workaround is gone, the Python demo's test passes in Chromium and Firefox, and the images built on
Python (`demo/pydata`'s among them) rebuild on it in a round.

## What stands in the way (2026-11-03, 23:30)

CPython is configured on the host with Emscripten's `configure`, and `prepare-cpython.sh` then
edits `pyconfig.h` to CPython's pthread stubs (`HAVE_PTHREAD_STUBS`, no `HAVE_PTHREAD_H`): that is
the switch. But CPython loads its C extensions with `dlopen` (`dynload_shlib.o`, `dso@0`), and
`ctypes` callbacks are libffi closures, and both are refused in a program using `threads@0`
(`host/dso/process.mjs`: every thread's Worker has a table of its own, and a library or closure
added in one would be missing in the others; `docs/process-model.md`, "Threads, DSOs and FFI").
A threaded CPython could therefore import no NumPy, Pandas or Matplotlib.

So the first step is in the core: DSOs and FFI closures in threaded programs. A load (or a
closure) must reach every thread's table at the same indices, with the library's data initialised
once in the shared memory, and a thread started later must replay what was loaded before it.
A thread running Wasm reads no message until it calls into the runtime, so the load waits until
every other thread has synchronised at its next call (or is blocked in one): Emscripten's
`_emscripten_dlsync_threads` solves the same problem the same way. Then CPython with pthreads,
`-pthread` in its build and in the flags sysconfig gives extensions, `REQUIRES HOST threads@0` in
Python and the images that install it.

What the code says, for the design (read 23:00): `emscripten_futex_wait` in the libc adapter
(`src/process/threads.c`) is a bare `memory.atomic.wait32`, so a waiting thread runs no
JavaScript; a library's bytes reach `dso@0` in the process's memory (`DSO_OPEN`'s packet, from the
adapter's `dlopen`), and `instantiateDso` places it at a table base after the current table, with
`GOT.func` entries appended as pointers are taken. The design this suggests: the adapter keeps
each loaded library's bytes and a record (bytes, memory base, table base, flags) in a registry in
shared memory with a generation counter; a thread's Worker replays what it has not placed (same
order, so the same table indices, without relocating data or running constructors again) at each
kernel call, between slices of a futex wait (which then waits in slices), and at a thread's
start; the loading thread's `dlopen` returns once every live thread has acknowledged the
generation. FFI closures the same way. The adapter is a seed input: every image rebuilds.

## The core: libraries and closures in threaded hosts (2026-11-04 night, `demo/python-threads`)

Checked against the code, the design changes in four places:

- **No futex slices.** A thread that waits must not hold up a load, and one blocked in a kernel
  call (`read` of the terminal, `pthread_join`) would never reach a slice. So a thread is marked
  *waiting in the host* while its Worker waits for the supervisor's answer or in a futex wait, and
  a load returns once every other thread has applied it *or is waiting*; a waiting thread applies
  what it has not before it returns to the program (Dekker: the loader publishes then reads the
  marks, the waiter clears its mark then reads the count, both sequentially consistent). libc's
  futex wait therefore goes through the loader in a host: `DOLLY_DSO_WAIT` (dso@0's one new
  operation), whose `Atomics.wait` is the same wait `memory.atomic.wait32` was; with no address
  it only applies, which `__dolly_pthread_start` does after the thread's TLS and before its entry
  (an entry may be a library's function, and `GOT.mem` of a host `thread_local` must be the new
  thread's address, pydata's `_ZTW` fix).
- **Every table change is a record, not only loads.** A thread's table grows at a load, at a
  closure, and when `dlsym` or a library's `GOT.func` takes the address of a function no entry
  holds (`functionIndex`). Each Worker makes the same changes in the same order from the same
  start (the executable's table), so the indices agree; `dlsym`'s new entries and closures'
  alloc/prep/free are records too, and a `GOT.func` entry is part of its library's load. A record
  carries the index it gave, and a Worker that gets another is a bug the process dies of
  (`ThreadRecordError`), not a wrong call later.
- **A library's thread-locals.** wasm-ld initialises a library's TLS in its start function for
  the first instance only (`__wasm_init_memory`'s flag); every other thread's instance has
  `__tls_base` 0. `cc -shared` now exports `__wasm_init_tls`, `__tls_size`, `__tls_align`
  (Emscripten's side modules do the same), and each other Worker gives the library a block. A
  threaded host refuses a library without them (an older one) instead of corrupting low memory.
- **Where the records live.** In the host's memory (process state lives in Wasm memory): the
  dso client reserves `__dolly_dso_threads` (272 bytes: a lock, the count, the array of 48-byte
  records, 63 thread marks), which `-rdynamic` exports; the library's bytes and `dlsym`'s names
  are kept for later threads (`__dolly_dso_allocate`). A thread's Worker takes a mark when it
  starts, as waiting, and gives it up at `THREAD_EXIT`. A program using `threads@0` that is not a
  host keeps the refusal of closures: it has no allocator export and nothing needs it.
- Constructors run once, after every thread placed the library; data relocations once. A load
  that fails after it changed the table is published as failed, and the others repeat the
  failure; a closure freed later in the records a thread applies is not prepared (its cif may be
  gone). The loader's lock is reentrant: a constructor may `dlopen`.

Seed changes: the compiler (`-pthread` with `-rdynamic` and `-shared`; side modules export
their TLS initialiser), the libc adapter (`src/process/threads.c`: the wait hook), the dso@0
contract and client (`DOLLY_DSO_WAIT`, `__dolly_dso_threads`, the TLS exports): a compiler round
(`llvm-cc`, pinned) and every image.
