# In Chrome a Worker that is terminated while it is blocked in a system call lives two more seconds

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: core,browser,owner

Found by the tests of
[a parent that ends while its children run](../20261013-163336-crash-with-children/TASK.md)
(2026-10-14, branch `core/crash-children`). Page JavaScript only: no image
input.

## Done (2026-10-14)

Owner (2026-10-14): "If your investigation confirms they are fixes that
improve things and aligh with the main goal of the project go ahead."

The three measured lines are on `main`: the supervisor answers the call a
Worker waits in before it terminates it, and the Worker leaves as it does
for `EXIT`. Page JavaScript only; the plan builds no image.

- Measured again on `main` (`build/probe-1014/probe-linger.mjs`): in Chrome
  the Workers of a tree whose parent trapped or called through a null
  pointer are gone 0 to 10 ms after the parent's status, where they stayed
  2005 ms. A looping process still stays 2002 to 2006 ms: nothing reaches a
  loop that never enters the kernel. Firefox 10 ms, as before.
- With it: `test/process-browser.mjs` in both browsers, the whole core suite
  in both browsers (all passed in 423 s, `build/day-1014/browser-worker-fix.log`)
  and the demo suites of `pi`, `javascript`, `python`, `tmux`, `emacs` and
  `rust` (6 passed, `build/day-1014/demos-worker-fix.log`). Those cover what
  the measurement had not run: a threaded program, and the compiler, which
  is entered through JSPI.
- The test's deadline stays 5 s: its `spin` endings leave a looping Worker
  for Chrome's two seconds.

## State (2026-10-14): measured, waits for the owner

No program sees anything wrong: the parent's status, the kernel's records, the
supervisor's map and the process limit are settled at once, and the tests pass
in both browsers. The cost is inside Chrome. A process the supervisor ends by
force (`#forceExit`: SIGKILL, a spawn deadline, the 500 ms rule) and every
descendant of a process that ends (`#terminateDescendantWorkers`) gets
`Worker.terminate()` while it is blocked in a system call or in a loop. Chrome
then keeps the Worker, and so its memory, for two seconds; a looping one keeps
its core as long. Firefox ends it within 10 ms. A process that ends by itself
is not concerned: its Worker has left Wasm and closes itself.

The owner decides whether the supervisor first wakes a blocked Worker so that
it leaves Wasm by itself. Three lines do it for the blocked ones (below,
measured, not committed); nothing found helps a loop that never enters the
kernel. It gives one result value a meaning between the supervisor and its
Worker, which is a change to how the core ends a process.

Done when the owner has decided. If it is built: the deadline in
`test/process-browser.mjs` ("Their Workers are gone too") comes down from 5 s
to what Chrome then needs, and the core suite and the demo tests of `pi`,
`javascript` and `python` pass.

## Measured (Chrome 151.0.7922.71, Firefox 155.0)

`test/fixtures/process-tree.c`: a parent, its child and its grandchild; the
two descendants sleep. Time from the parent's status reaching the shell until
the page lists no Worker of the tree (Playwright's `page.workers()`, which
lists the Workers of Workers in both browsers), sampled every 10 ms, the
endings `trap`, `null`, `spin`, `trap`, `spin` in one session:

| Ending of the parent | Workers left at its status | Chrome, as `main` is | Chrome, woken first | Firefox, both ways |
| --- | --- | --- | --- | --- |
| trap | child, grandchild (blocked in a sleep) | 2006 and 2005 ms | 0 and 10 ms | 9 to 10 ms |
| call through a null pointer | child, grandchild | 2005 ms | 10 ms | 10 ms |
| Ctrl+C on a loop outside the kernel, the 500 ms rule | parent (looping), child, grandchild | 2002 and 2005 ms | 2003 and 2002 ms, the parent alone | 9 to 10 ms |

The parent's own Worker after a trap is gone at its status in both browsers:
it posted its failure and closed itself.

Not measured: where Chrome's two seconds come from. The number is the delay
after which Blink ends a terminated Worker's script by force when the Worker
has not returned to its event loop, as I remember its source; I did not look
it up. A blocked process waits in `Atomics.wait`
(`src/process-worker.mjs:118-125`).

What the two seconds hold: the Worker's memory, up to the 8 GiB a program may
grow to, and for a loop one core. The supervisor waits for reclamation only
500 ms and only after an interactive process of 128 MiB or more
(`src/process-supervisor.mjs:28-29`, `:669-673`).

## The three lines that were measured

```diff
--- a/src/process-supervisor.mjs  (#disposeThread)
+      if (thread.control) this.#signal(thread, Atomics.load(thread.control, 0), deferredResult);
       if (process.threaded && this.threadHost) this.threadHost.release(thread.worker);
       else thread.worker.terminate();
--- a/src/process-worker.mjs  (call)
   const result = decodeResult();
+  if (result === -(1n << 63n)) throw PROCESS_EXIT;
```

The supervisor answers the system call the Worker waits in with the value the
kernel uses for a deferred call, which no program is ever handed; the Worker
unwinds as it does for `EXIT` and closes itself. A program cannot make the
value: results come from the supervisor alone.

Only `work/evidence-2026-10-14/crash/probe-linger.mjs` was run with it, in both
browsers. Not run with it: the core suite, the demo tests, a threaded program
(`threadHost.release`), a program entered through JSPI (`promisingEntry`).
