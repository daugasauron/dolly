# Investigate: the supervisor keeps a process tree and a process limit of its own beside the kernel's

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,kernel,boundary

Owner (2026-10-13), on
[the reflection](../20261013-142800-direction/reflection.md): "The audit is
too blunt. Some of the points are good but some are garbage. Both SLOP and
RUN are needed, see the history, this is hard earned wisdom. Create tasks to
investigate each of your points more in detail without deciding if they
should go or not".

This task investigates one of its points (section 4). It decides nothing.

Done when it holds, with the evidence and without a verdict:

- how the thing came to be: the commits and tasks that introduced it and
  changed it, quoted, and the reason each gives (`git log -S`, `git log
  --follow`, `tatr find`, the closed tasks);
- what it is for today and who uses it, counted from the code and the
  recipes, not from the reflection;
- each claim of the reflection below, checked: true, false or partly, with
  what was looked at;
- what would break, be lost or become harder if it changed, and what would
  get simpler, each shown on a real case;
- what could not be found out.

The owner decides what, if anything, follows.

## What the reflection claims and proposes (2026-10-13, unchecked)

- `src/process-supervisor.mjs` keeps `parent` per process (line 227) and
  walks it in `#descendantDepth` (238-247), `#interruptForeground` (268-280)
  and `#terminateDescendantWorkers` (757-769); the kernel has
  `dolly_process_descends_from` (`src/process-kernel.c:168`) and decides the
  foreground itself (180-195). The limit is twice: `processWorkerLimit = 32`
  (supervisor 23, 201, 538) beside `DOLLY_KERNEL_PROCESS_LIMIT = 32`
  (kernel 21, `EAGAIN` at 697).
- The pattern that removes it exists: `take_alarm` and
  `dolly_pty_take_signal` hand the supervisor the next PID to signal
  (supervisor 253-265).
- It proposes: an interrupt is taken like an alarm, one target at a time
  as the kernel chose them; one kernel export lists a process's descendants
  deepest first; the JavaScript walk and the JavaScript limit are deleted.
- Kernel C and page JavaScript: no image input, no rebuild of images.
