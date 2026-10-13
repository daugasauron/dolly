# No test ends a process by a trap while it has running children, and none tells the supervisor's process limit from the kernel's

- STATUS: OPEN
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
