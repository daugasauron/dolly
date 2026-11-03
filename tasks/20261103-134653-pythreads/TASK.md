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
