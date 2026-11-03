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

### The compiler round (2026-11-04 01:30-02:40)

- `llvm-cc` with the new driver: its chain rebuilt from `llvm-tablegen` (the display change of
  integrate reached it through Python, which `llvm-tablegen` installs): `llvm-build` 2,360 s for
  the compiler's libraries plus about 12 minutes for the rest of LLVM, `llvm-cc` 183 s for the
  link, 247 s in all. Pinned: `DOLLY_SEED_COMPILER_SHA256=aa17d632…`; image inputs `a8928037…`.
- Two mistakes cost 40 minutes, both from editing while a build ran (Lessons).

## Python on threads@0 (2026-11-04, after the merge of `demo/pydata`)

- `prepare-cpython.sh` no longer switches `pyconfig.h` to CPython's thread stubs, nor makes
  `_Py_thread_local` an ordinary global (the main program's TLS is per thread now:
  `__wasm_init_tls` of each thread's block). `pthread_getattr_np` stays (musl's, from the
  thread record Dolly fills): CPython reads each thread's real stack, 2 MiB for a thread and
  8 MiB for the main one, instead of assuming 4 MB. A deep C recursion (repr of a list nested
  10^6 deep) meets the browser's own stack first, in a thread as in the main thread: the process
  ends with "Maximum call stack size exceeded" (measured; not a thread matter). `pthread_condattr_setclock`
  is configure's again (timed waits on the monotonic clock); thread CPU clocks and
  `pthread_kill` stay undefined, as Dolly has neither.
- `-pthread` compiles and links python, and sysconfig's `CONFIGURE_CFLAGS`/`CONFIGURE_LDFLAGS`
  carry it, so setuptools and meson-python build extensions with it (`cc -pthread -shared`).
- The patch loses five files' hunks: threading's serial `start`/`join`/`is_alive`, the thread
  pool's run at submission (pydata's stopgap, `c085280fb`), and the two stub headers.
  `/etc/pip.conf` loses `progress-bar = off`. Recipes that install python declare `threads@0`
  (the lint named meson's).

## Measured (2026-11-04, seed `aa17d632…`, image inputs `a8928037…`)

- `test/dso-browser.mjs` with the new case (`test/fixtures/dso-threads.c`: a host loads a C++
  library while one thread waits on a condition, one in a `read`, one computes; then all call
  it, its data's pointers, its thread-locals, its own catch and an FFI closure; a thread started
  after; a thread that loads it again while the main one joins): Chromium 20.2 s, Firefox 23.5 s.
  It fails with replay disabled (the program's checks fail), and with the other threads' TLS
  blocks skipped exit status 30: exactly the four non-loading threads fail.
- `threads-browser.mjs`, `cpp-browser.mjs`, `core-browser.mjs`: pass in Chromium and Firefox.
- The python image's build checks (two threads that wait on each other, three pool workers at
  a barrier, an extension module and a `ctypes` callback from another thread): pass; python
  builds in 98 s. The demo's test: `python` in Chromium 32.3 s, `python on default` (pip builds
  NumPy from its sdist) in Chromium 149.8 s and Firefox 185.1 s.
- CPython's own tests, with `python -m unittest` from the image's source tree
  (`build/pythreads-evidence/cpython-tests.mjs`), the same in Chromium and Firefox:
  - `test_thread`: 35 tests OK, 2 skipped (fork). `test_queue`: 162 OK, 6 skipped.
  - `test_threading`: 228 tests, 27 skipped (fork, subinterpreters, `_thread.set_name`, the
    2.7 GB test), 1 failure: `test_finalize_daemon_thread_hang` imports `_testcapi`, which
    the image does not build (`--disable-test-modules`).
  - `test_concurrent_futures` does not import: its `util.py` names
    `futures.InterpreterPoolExecutor` at class definition, and this build has no
    subinterpreters. With a stand-in that skips interpreter pools (Chromium): 350 tests, 275
    skipped (process and interpreter pools: no fork, no subinterpreters), 1 error
    (`test_interpreter_pool`: no `_interpreters`), 3 failures in `ThreadPoolShutdownTest`, each a
    child `python -I` that cannot import the `test` package, which the image does not install
    and `-I` will not find in the working directory: the harness's, not threads'.
  - First run: `test_forkinthread` waited for ever, since CPython had an `os.fork` that always
    failed (`ENOSYS`) and `test.support` took fork as working; configure now reports no fork
    (`5d6897b6a`), and the fork tests skip.
- `python -m test` cannot run here: regrtest spawns a worker whose arguments hold an
  undecodable directory name, and `_dolly_subprocess.spawn` encodes them as strict UTF-8
  (`UnicodeEncodeError ... surrogates not allowed`): a subprocess limit, not threads. The
  thread tests run with `python -m unittest` instead (below).

## Findings left open

- Dolly's own libc locks (`src/process/lock.h`, `dolly_lock`: the thread list, signal actions,
  mmap's table) waited with a raw `memory.atomic.wait32`: a thread blocked in one counted as
  running, so a load waited until it had the lock (nothing held one across `dlopen`, so no
  deadlock). They wait through `emscripten_futex_wait` now, like musl's.
- A thread that computes for long without a call or a wait delays every load, `dlsym` of a new
  function and closure preparation in its process until it makes one (Emscripten's dlopen has
  the same property). A thread spinning on a flag with no call at all would delay them for ever.
- `_dolly_subprocess.spawn` refuses arguments and environment values with surrogate escapes
  (undecodable bytes), as regrtest's worker command has; `python -m test` fails at once.

## Lessons

- A build reads the working tree while it runs: each image's snapshot browser bundles the page
  and Worker code from it, and `npm run image`'s source pinning re-pins a recipe to a host
  header edited since. Editing `host/dso/process.mjs` during the llvm-cc chain failed llvm-cc
  (an import the runtime build had not generated yet), and editing `dso.h` restarted
  `system-build` with the old seed; 40 minutes went to it and to restoring snapshots by hard
  link from other trees (each with its metadata module copied). Hold back seed and page edits
  until a build ends, or make them in a scratch copy.
- The design on paper (futex slices, a registry of loads) did not survive the code: what makes
  tables diverge is every table change (`dlsym` and `GOT.func` take indices too), and what
  blocks a load is a thread waiting in the kernel, which no slice reaches. Reading
  `functionIndex` and process-worker's call path first saved an iteration.
- Mutation checks are cheap once a browser test exists: disabling the replay and then the TLS
  blocks showed the new test fails for each, and which threads (exit status 30) — evidence a
  passing run alone does not give.

## Round 2 (seed with the adapter's locks, image inputs `d0581b88…`)

- Rebuilt here from `system-build`: `system`, `default`, `cc`, `python`, `python-data-build`,
  `python-data` and their closure.
- `dso-browser.mjs` Chromium 20.7 s, Firefox 23.2 s; `threads-browser.mjs` 12.1 s, 14.1 s;
  `core-browser.mjs` 24.7 s, 37.3 s; the Python demo: `python` 31.4 s (Chromium), `python on
  default` 157.2 s (Chromium), 168.2 s (Firefox).
