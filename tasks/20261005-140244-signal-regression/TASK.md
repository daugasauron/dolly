# Ctrl-C ends a handling child before its event loop runs the handler (cmake libuv probe)

- STATUS: CLOSED
- PRIORITY: 335
- TAGS: core,kernel,signals,regression

`node demos/run-browser-tests.mjs cmake` fails on `integrate/1005` and on the
deployed `main` (`cb8530a6`): `timeout 15 ./probe tty` ends with status 130 on
Ctrl-C but libuv's SIGINT callback never writes `interrupt-handled`
(`demos/cmake/test/cmake-browser.mjs:60`). It last passed in the release
candidate built from `e30c0b0f`.

## Cause

Exit reclaims the subtree, and the kernel let a parent's exit wait for a
signalled child only while the child had the signal pending or was inside its
handler (`DOLLY_PROCESS_EXIT` in `src/process-kernel.c`). An event loop's
handler only notes the signal (libuv writes one byte to a pipe) and the loop
acts on it after the handler has returned, so the child was reclaimed between
its handler and its callback.

Ctrl-C signals the whole foreground tree. `timeout` has the default action, so
it calls EXIT at once, and that EXIT is parked until the child is done.
Measured in Chromium with an instrumented copy of the supervisor (times from
the page's `interruptForeground`; 109 is the shell, 115 `timeout`, 116 a
program with a self-pipe handler parked in `poll`):

```
 0.0 ms  page interruptForeground: foreground pid 109
13.2 ms  tick take_interrupt pid 109; interruptForeground descendants 115,116
13.5 ms  deliverSignal pid 115 (parked in WAIT), 116 (parked in POLL): both wake with EINTR
13.7 ms  pid 115 INTERRUPT_POLL; pid 116 INTERRUPT_POLL
13.8 ms  pid 115 EXIT -> DEFERRED (child 116 is in its handler)
13.9 ms  pid 116 WRITE (the handler's byte) -> pipe wakeup -> retry 115 EXIT -> DEFERRED
13.9 ms  pid 116 SIGNAL_ACK
14.0 ms  pid 116 POLL -> ready; READ -> pipe wakeup -> retry 115 EXIT -> 0
14.1 ms  115 retired, 116 reclaimed with it; it never opens its marker file
```

`d67ec56e` ("Retry deferred calls as soon as a pipe changes") did not create
the defect; it removed the accident that hid it. Before it the parked EXIT was
retried only on the 16 ms tick, so a child had until the next tick. With the
child's own `read` of its self-pipe now retrying the parent's EXIT, the child
has no time at all. Ten Ctrl-C each, `timeout 15 PROGRAM`, Chromium:

| supervisor | child's work after the handler | handled |
| --- | --- | --- |
| as merged (pipe wakeup) | none | 0/10 |
| wakeup trigger removed | none | 10/10 |
| wakeup trigger removed | 50 ms | 0/10 |
| as merged | 50 ms | 0/10 |

With the trigger line removed from `src/process-supervisor.mjs` the cmake demo
test passes (`build/signals-evidence/cmake-without-wakeup-trigger.log`); with
it the test failed four times out of four. On `main` (`work/dollyfile-v6`) the
same program under `timeout` is cut off in every blocking call tried: `poll`,
restarted `read`, `waitpid`, `nanosleep`, 0/5 each.

## Fix

- `src/process-kernel.c`: a terminating signal gives its process an
  `interrupt_deadline` 500 ms ahead; an exiting parent waits while a child is
  running inside that grace. This replaces the pending/in-handler test, which
  the supervisor already bounds with the same 500 ms. A child that exits lets
  the parent go at once (71 ms in the trace, 50 ms of it the child's work); a
  child that keeps running is reclaimed with the parent at 500 ms (measured
  518-524 ms).
- Decision: a fixed grace from the signal, not "until the child next blocks"
  and not "until the child exits". Shutdown code blocks (libuv closes handles,
  Python runs `finally`), so the first would cut it off; the second lets a
  child that ignores SIGINT keep a Ctrl-C from ever returning the prompt. The
  time lives in the kernel because only the kernel decides when a parked EXIT
  completes; the supervisor contract is unchanged.
- The pipe wakeup is untouched. 100 pipe round trips between two threads, ten
  runs, machine load about 22: `main` min 14.2, median 25.2, max 35.2 ms; this
  branch min 15.9, median 20.0, max 37.6 ms.

## Second defect on the same path

`serviceDeferred` retried a snapshot of the parked calls. A retried EXIT that
completes stops the other threads of its process; a later snapshot entry for
one of them then reached `Atomics.load(null, ...)`, an uncaught `TypeError` in
the runtime Worker, whose `error` listener disposes the host
(`src/browser.mjs:116`). A threaded program that signals a handling child and
exits while another thread parks reproduces it: on `main` the page logged
`null is not an integer typed array` in 3 and 4 of 5 runs; on this branch
before the guard the session ended with "Dolly stopped" in the first run. The
longer wait above makes a parked EXIT more common, so `serviceDeferred` now
skips entries an earlier retry already settled. Not introduced by the
host-modules batch (`dolly_kernel_dispatch` and `host/threads/kernel.c` were
read for this path and add nothing to it).

## Tests

- `test/process-browser.mjs` with `test/fixtures/process-interrupt.c`: a
  program whose SIGINT handler writes to a pipe, parked in `poll`, restarted
  `read`, `waitpid` or `nanosleep`, interrupted with Ctrl-C through the page,
  run directly and under `timeout`; it does 50 ms of work after the handler and
  must leave its marker. A child that needs 2 s under `timeout` must be
  reclaimed with its parent before it writes the marker.
- `test/threads-browser.mjs`: the threaded exit above, five rounds; without the
  guard it fails with "Dolly stopped".

## The RTS stall is a separate, older failure

`node demos/run-browser-tests.mjs rts` failed once on `integrate/1005` with
"mouse menu/quit must not stall either player", both views stuck at frames
14/15. No signal or exit is in flight at that step. The match fixture alone
(`janis -m rts-match.mjs`, repeated in one `rts-arena` session, machine load
20-30) stalls the same way on the deployed tree and with either supervisor:

| tree | change | stalled |
| --- | --- | --- |
| `main` `cb8530a6` (`work/dollyfile-v6`) | none | 3/6 |
| this branch, fixed | none | 3/8, then 1/8 |
| this branch, fixed | pipe-wakeup trigger removed | 4/6 |
| this branch, fixed | fixture connects the players at frame 40, not 5 | 0/8 |

How a regression was separated from load: the failure appears on `main` at
the same rate under the same load, with and without the suspect change, so
nothing in this round causes it. Load is not the whole cause either: it is a
race in the RTS demo between the fixture's first inputs and the match's first
frames. Rounds that passed had reached frames 22-25 when the first lifecycle
input was sent, rounds that stalled sat at 5-15, and with the players
connected only after frame 40 all eight rounds passed. A slower start makes
the race likelier, which is how load shows it. The full test passed here twice
(316 s before the fix at load 9-20, 338 s after at load 21-30). Raised as
`20261005-151321-rts-early-input-stall`.

## Verification

Closed 2026-10-06 with commits `fd4c9a4b` (kernel, tests, docs) and `a76cf3ea`
(supervisor guard). All on this branch at `a76cf3ea`, machine load 14-30.

- `npm run build:runtime`: `image inputs sha256:2cc92c2b1f99...` unchanged
  (runtime `81b96f60...`); no seed or ABI change, images stay valid.
- `node --test 'test/*.test.mjs'`: 251 pass, 0 fail. `npm run test:source` adds
  one failure, `demos/pi/test/pi-tools.test.mjs:28`: this worktree's shared
  `node_modules` holds pi-coding-agent 0.84.4 where `package.json` pins 0.99.2;
  the same files pass in `work/dollyfile-v6`, which has its own.
- Chromium and Firefox: `core-browser` (60.9 s, 76.3 s), `process-browser`
  (24.8 s, 24.6 s), `threads-browser` (17.8 s, 20.8 s, and the refusal test),
  `terminal-browser` (35.8 s, 36.3 s), `shell-browser` (14.3 s, 16.2 s).
- `demos/run-browser-tests.mjs`: cmake passed twice (32.4 s, 51.4 s), rts
  338.4 s, codex 46.8 s, rust 152.6 s, neovim 10.6 s, emacs with Firefox and
  the package test.
- The new cases fail without the fix: on `main` all four blocking calls under
  `timeout` leave no marker (0/5 each), and `threads-browser` without the
  guard ends with "Dolly stopped".

Logs: `build/signals-evidence/` (`verify-1.log`, `verify-2.log`,
`cmake-baseline-1.log`, `m1`-`m4` and `fixed-*` traces, `rts-match-*.txt`).

## Deployed `main`

A user notices it only for a program that handles SIGINT outside its handler
and runs under a parent that the same Ctrl-C ends. Measured with `timeout`;
`env`, `time` and `xargs` start programs the same way
(`src/commands/run-program.h`) and a Slop running a script installs no handler
either. The program stops with status 130 as before, but its shutdown code
does not run. Image entries (Neovim, Emacs, Codex, Pi) and
programs started directly at the prompt are not exposed: the program is the
interrupt target and nothing above it exits (`/bin/foreground` in each
`init.slop`; the interactive shell is spared). The neovim, emacs and codex
demo tests pass on this branch. Ctrl-C returned the prompt in every run on
`main`, in 13-70 ms.

The threaded-exit `TypeError` above is also on `main`, where the same error
listener disposes the host; it needs a threaded program that signals a
handling child and exits while another of its threads is parked.
