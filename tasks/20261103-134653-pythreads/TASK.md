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
