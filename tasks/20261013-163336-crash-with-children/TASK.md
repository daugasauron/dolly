# No test ends a process by a trap while it has running children, and none tells the supervisor's process limit from the kernel's

- STATUS: CLOSED
- PRIORITY: 175
- TAGS: core,kernel,tests

Found by [the investigation of the supervisor's process tree](../20261013-144241-supervisor-mirror/investigation.md)
(2026-10-14, sections 3 and 6). Kernel C, page JavaScript and a test
fixture: no image input.

Done when the core suite proves, in both browsers:

- a process that traps (an unreachable instruction, a null call) while a
  child and a grandchild of it run: the parent's status is the failure's,
  both descendants' Workers are gone, their kernel records are collected
  (`/proc/processes` no longer lists them), the shell reads its next line,
  and a spawn right after works;
- the same when the parent's Worker is ended by force (the 500 ms rule
  after `SIGINT` on a loop that never enters the kernel);
- which side refuses the spawn past the limit in the two cases the
  investigation tells apart by reading: every earlier child waited for
  (the supervisor's check runs first), and exited children not yet waited
  for (the kernel's table fills first). Both give `EAGAIN` today; the test
  pins that a program sees `EAGAIN` in both and that the table is usable
  again after the wait.

## As filed (2026-10-14, `integrate/round-1013` `580cd089`)

- `#fail` and `#forceExit` in `src/process-supervisor.mjs` (734-755) tell
  the kernel, then drop the descendants' Workers deepest first
  (`#terminateDescendantWorkers`, 757-769) and acknowledge them in that
  order, which the kernel requires (`src/process-kernel.c:2508-2511`). No
  test reaches this with descendants alive: the lifecycle fixture
  (`test/fixtures/process-lifecycle.c:162-172`) has a parent that exits by
  itself, and `timeout … interrupt linger` (`test/process-browser.mjs:119-137`)
  has one lingering child after a signal.
- The limit: `test/fixtures/process-lifecycle.c:264-276` spawns until
  `EAGAIN` and asserts a count between 0 and 64, not 32 and not the side.
- Not known and to be found by the test: whether a Worker that the browser
  ends for lack of memory raises `error`, `messageerror` or nothing. If
  nothing, the supervisor learns of it only by a timer; say so in
  `docs/process-model.md` when measured.

## Closed (2026-10-14, branch `core/crash-children`)

The done-when is met by tests alone (`3f83bfb2`): no defect was found, and
no kernel C or page JavaScript changed. Chrome 151.0.7922.71 and Firefox
155.0; `node test/process-browser.mjs` passed in both three times in a row
(Chrome 26 s, Firefox 24.5 s; before the tests 24.0 and 23.7 s) and once more
held to two cores. `npm run build:runtime` prints image inputs
`sha256:538c5a8aea82…` and the same `dist/dolly.wasm` as before. Source suite
429 of 429. The rest of the core suite and the demo tests were not run:
nothing they load changed.

### What the tests assert

- `test/fixtures/process-tree.c`: a parent starts a child, which starts a
  grandchild; both ignore SIGINT and sleep, and the grandchild's byte on the
  parent's pipe says that all three run. The parent then ends by
  `__builtin_trap()`, by a call through a null pointer, or stays in a loop
  that never enters the kernel.
- `test/process-browser.mjs` ("process"), for each of the three, the third
  with Ctrl+C: the shell's status is 126, 126 and 130; the next line the
  shell reads runs a program, and `/proc/processes` lists no process of the
  tree. After the three, the page's Workers are as many as when the shell was
  idle, within 5 s. Playwright's `page.workers()` lists the Workers of
  Workers in both browsers (measured: 3 at an idle `system` shell, more
  while programs run).
- `test/fixtures/process-lifecycle.c`: the limit is
  `getrlimit(RLIMIT_NPROC)`, the room is the limit less the lines of
  `/proc/processes`. It spawns until refusal twice: children that exit at
  once and are not waited for, each retired (its SIGCHLD) before the next is
  spawned, and then sleeping children. Both times the refusal is `-EAGAIN`
  after exactly `room` spawns; every child is then waited for, so the second
  round and the spawn after it show the table usable again. It runs after the
  three trees, so the count also says that their records were collected:
  `/proc/processes` lists only what has not exited and cannot.

Seen: limit 32, 4 listed (`foreground`, `slop`, `timeout`, the fixture), room
28 in both rounds and both browsers. The failures read "unreachable" and
"null function" in Chrome, "unreachable executed" and "indirect call to
null" in Firefox. The loop's status reaches the shell 604 ms after its
command line was submitted, the 500 ms of the rule included. The grep pattern
matches the three lines of a living tree
(`work/evidence-2026-10-14/crash/probe-pattern.mjs`).

### Each can fail

Broken for one run each, then restored (`work/evidence-2026-10-14/crash/break-*.log`):

| Broken | The test said |
| --- | --- |
| `#terminateDescendantWorkers` acknowledges the descendants and does not terminate their Workers | "6 Workers of the trees are left", both browsers: two a tree, the loop's too, so its descendants ran when it was ended |
| `#terminateDescendantWorkers` returns no descendants | "Dolly stopped" at the first tree, both browsers; by reading, the kernel refuses to retire the parent and the supervisor throws |
| `retired()` does not acknowledge the descendants | the same (Chrome) |
| the kernel keeps the children of a failed or interrupted parent and the supervisor does not collect them | `LIFECYCLE FAIL … spawned == -EAGAIN && count == room`, both rounds (Chrome) |
| the kernel's refusal is `ENOMEM` | the round of exited, unwaited children fails with -48; the round of running children still sees `EAGAIN`; both browsers |
| the supervisor's refusal is `ENOMEM` | the round of running children fails with -48; the other still sees `EAGAIN`; both browsers |

The last two rows are the measurement the investigation asked for (its
sections 2.5 and 6): with every earlier child waited for the supervisor
refuses, with unwaited exited children the kernel does.

One line had no effect any of this sees: without
`this.dolly._dolly_process_collect(descendant.pid)` in `retired()`
(`src/process-supervisor.mjs:691`) the three tests pass in both browsers, the
room count included. The kernel disposes a process's children when it accepts
its retirement (`src/process-kernel.c:2513-2518`), and every descendant's
parent is acknowledged in the same pass. Left as it is: only
`process-browser` was run without it.

### A Worker ended for lack of memory: none could be made

Neither browser ended one Worker. `error` and `messageerror` were raised in
no case. Each run was held to 3 GB (`systemd-run -p MemoryMax=3G` inside a
browser slot); scripts and logs are in `work/evidence-2026-10-14/crash/oom/`.

- A Dolly process that grows without touching its memory: `malloc` fails
  with `ENOMEM` at 8128 MiB in both browsers, the program goes on and exits
  0. A refused growth is an errno.
- The same process touching what it gets: half a second later the page
  crashed in both browsers, and the journal says the scope's OOM killer
  killed a process. The kernel, the supervisor and every process go
  together, so no event has a listener left.
- A Worker of a Worker without Dolly code, filling its JavaScript heap, the
  heap held to 256 MiB (`--js-flags=--max-old-space-size=256`; the prefs
  `javascript.options.mem.max` and `dom.workers.options.mem.max`): Chrome
  crashed the page after 1.5 s, the journal names no OOM killer for that
  run, and nothing was raised first. Firefox left the Worker in place for
  the 180 s watched: no event, no message, no answer to a message every 5 s,
  about 10 CPU seconds used per 10 s. `terminate()` ended it in 0.1 s.
  Without the heap limit Firefox ran into the 3 GB and the OOM killer, as
  above.

So what the task supposed, a death that the supervisor would have to notice
by a timer, did not occur. A Dolly process fills Wasm memory, not its
Worker's heap, and for that the outcomes were the errno and the death of the
page. Not measured: a Worker that cannot start for lack of memory, and any
run above 3 GB. `docs/process-model.md` is unchanged: its "Nothing
guarantees against browser memory pressure" stands, and a change to it
repins `dolly-docs` and the Pi chain.

### Left for the owner

- [Chrome keeps a terminated blocked or looping Worker for two seconds](../20261013-183624-worker-two-seconds/TASK.md),
  measured here, with three lines that end the blocked ones at once.
- Whether the collecting line above goes.
