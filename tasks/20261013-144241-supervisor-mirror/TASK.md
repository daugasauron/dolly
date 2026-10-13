# The supervisor stops mirroring the kernel: no second process tree, no second limit

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,kernel,boundary

Owner (2026-10-13): "I want to get the core right, Dollyfile syntax, host
modules/bridge, browser runtime etc. It should be as clean and small as
possible in order to be extensible. Think unix philosophy (this is a core
thing)." One issue of
[the reflection on the direction](../20261013-142800-direction/TASK.md)
([reflection](../20261013-142800-direction/reflection.md), section 4).

Done when: the supervisor keeps no parent of a process and no limit of its
own; whom a signal, an interrupt or a forced end reaches is the kernel's
answer, handed over as it hands over an alarm; the core suite and Pi's,
JavaScript's and Python's demo tests pass in Chromium and Firefox.

## As filed (2026-10-13, main `e330d782`)

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
- Smallest change: an interrupt is taken like an alarm, one target at a time
  as the kernel chose them; one kernel export lists a process's descendants
  deepest first; the JavaScript walk and the JavaScript limit are deleted.
- Kernel C and page JavaScript: no image input, no rebuild of images.
