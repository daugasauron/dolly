# A signal handler that leaves by siglongjmp is never acknowledged: the process goes deaf to signals

- STATUS: OPEN
- PRIORITY: 330
- TAGS: bug,core,process,signals,libc

Found while packaging less (`20261006-111926-less-pager`, 2026-10-08), on
image inputs `503e6ffe…`, Chromium.

## What happens

less waits for a key in `read`. Its SIGWINCH and SIGINT handlers leave that
`read` with `siglongjmp` (`intio` in less's `os.c`), the classic way out of a
blocking call; libc's `setjmp.h` defines `sigsetjmp` and `siglongjmp` as
`setjmp` and `longjmp` ("No signals support", from Emscripten's copy).

- Resize the window twice while `less FILE` is open: the first resize repaints
  at the new size, the second does not, and less scrolls by the old height
  until it is restarted.
- Ctrl+C in less ends it 0.5 s later with status 130, where less only means to
  stop what it was doing. After a plain `less FILE` the prompt comes back on
  the alternate screen.

`build/less-evidence/try-chromium-1.log` and `try2-chromium-1.log` in
`work/recipes`.

## Why

- libc runs a handler inside the system-call wrapper and tells the kernel it
  finished only after the handler returns: `DOLLY_PROCESS_INTERRUPT_POLL`,
  `deliver_pending()`, `DOLLY_PROCESS_SIGNAL_ACKNOWLEDGE` in
  `dolly_process_call` (`src/process/signal.c`). A handler that jumps away
  skips the acknowledgement and the `blocked = previous` after it.
- The kernel keeps `handling_signal` set from the poll to the
  acknowledgement, and while it is set no call returns `EINTR` and the poll
  answers 0 (`process_dispatch` in `src/process-kernel.c`): the process takes
  no further signal, of any number.
- The supervisor ends a process 500 ms after a terminating signal unless the
  acknowledgement arrives (`#deliverSignal` in `src/process-supervisor.mjs`):
  so the first SIGINT a handler leaves by jumping, or any SIGINT after an
  earlier jump, ends the process without its cleanup.

## Fix (in the seed; recommended)

Give `siglongjmp` and `sigsetjmp` their POSIX meaning in libc instead of the
aliases: `sigsetjmp(env, 1)` saves the mask in the `jmp_buf` (musl's has the
fields), and `siglongjmp` is a libc function that restores it, sends the
acknowledgement when a handler is running, and then jumps. The 500 ms rule
stays as documented, because a handler that jumps has finished. It needs the
staged `setjmp.h` changed, about fifteen lines in `signal.c`, and a fixture:
a handler that jumps, then a second signal that must still arrive.

Not recommended: acknowledging before the handler runs. It is three moved
lines, but a handler that never returns would no longer be ended after
500 ms, which `docs/process-model.md` promises.

A plain `longjmp` out of a handler would still not be acknowledged; on Linux
it leaves that signal blocked, so programs that mean to jump use `siglongjmp`.

## Done when

- A fixture whose handler leaves by `siglongjmp` takes a second signal, in
  both browsers, and `less FILE` repaints at a second resize and survives
  Ctrl+C (`test/pager-browser.mjs` can then resize twice).
