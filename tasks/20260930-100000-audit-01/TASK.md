# Reading /dev/stdin blocks the kernel thread and ignores Ctrl+C

- STATUS: OPEN
- PRIORITY: 290
- TAGS: bug,core,kernel,lifecycle

WasmFS creates `/dev/stdin` (emsdk `memory_backend.cpp:117-121`) and snapshots keep `/dev`
(`src/system-snapshot.c:158`). A process that opens the path gets an ordinary kernel fd
(`src/process-kernel.c:1928-1934`, `terminal_descriptors` is 0), so FD_READ calls blocking
`read()` (`:954-961`) -> `_wasmfs_stdin_get_char` -> `dolly_terminal_read_raw` -> an infinite
`emscripten_atomic_wait_u32` (`src/dolly.c:374-399`, `881-938`). That wait runs on the one
thread that also runs the JS supervisor, so every process, timer, Ctrl+C and forced termination
stalls until a key arrives. poll reports the fd always readable (`:1269-1277`); writing the path
`/dev/stdout` goes to the bootstrap print sink, not the caller's stdout.

## Evidence

Established: REPRODUCED. Chrome, `default` image, probe `dev-stdin-probe.mjs`: `cat` + Ctrl+C ->
status 130 in 103 ms; `cat /dev/stdin` + Ctrl+C -> no status after 5053 ms; after Enter the
pending SIGINT lands (status 130) and the shell recovers. Headless image builds that open the
path would hang forever (not run).

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

`/dev/stdin`, `/dev/stdout`, `/dev/stderr` (and `/dev/fd/N` if kept) resolve to the calling
process's descriptors 0-2, or fail explicitly; the kernel thread never blocks on terminal input.

## Done when

- Browser check: `cat /dev/stdin` in the default image is interruptible by Ctrl+C within the
  normal interrupt latency and `echo x | cat /dev/stdin` prints `x`.
- `echo hi > /dev/stdout` writes to the caller's stdout (visible in a pipeline).
- No kernel code path performs an unbounded atomic wait on the supervisor thread.
