# Investigate: the supervisor keeps a process tree and a process limit of its own beside the kernel's

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,kernel,boundary,owner

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

## State (2026-10-14, 01:35): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read
`integrate/round-1013` and changed nothing. The integrator checked the
supervisor's limit and its comment, the kernel's refusal to retire a parent
before its children, the audit task behind the limit and the quoted decision
of 2026-10-01. It gives no verdict. What it found:

- The two limits have different origins. The kernel's 32 is the size of its
  process table since private processes came (`b95459ce`, 2026-09-05). The
  supervisor's 32 came on 2026-09-30 from a security audit, "No trusted cap
  on concurrent process Workers"
  ([audit 19](../20260930-100000-audit-19/TASK.md)), with the comment it
  still carries: "Trusted bound on concurrent process Workers, independent
  of kernel records". Under the threat model (the whole of Wasm
  compromised) it is what bounds Workers and memories when the kernel lies;
  the thread budget has the same shape for the same reason. No commit or
  task says why 32, on either side.
- A decision exists about that limit and is not built
  ([parallel Rust](../20260930-231102-parallel-rust/TASK.md), 2026-10-01,
  delegated): "Replace the fixed 32-process cap with a supervisor memory
  budget (admit a spawn while committed Wasm memory stays under a page
  budget), keeping a hard count limit as a backstop." A Worker's memory
  size is a fact only the supervisor has.
- The tree is as old as the supervisor and used to be larger. Since
  `3f875924` (2026-09-06) the kernel holds the foreground and marks a
  subtree exited; later the ending signal, the kill target and the launch
  after an ancestor's exit moved to the kernel too. What the supervisor's
  own `parent` still serves is two walks: who gets the display's `SIGINT`,
  and which Workers to drop, deepest first, when a process ends.
- The deepest-first order serves a rule of the kernel, which refuses to
  retire a parent while a child's Worker is not retired
  (`src/process-kernel.c:2508-2511`). The requirement is the kernel's, the
  order is computed in JavaScript.
- The kernel can be asked at every point where the supervisor walks (it is
  called synchronously on the same Worker), and its records of an exited
  subtree are still there until retirement. The parent links are therefore
  not only in the supervisor. Two facts are: each Worker's memory size for
  the 500 ms window after a large process, and a descendant's own pending
  retirement timer.
- The shape the reflection proposes exists for one kind of terminal: for a
  pseudo-terminal the kernel chooses the targets with its own tree and the
  supervisor delivers them one at a time, without a walk (tested by the pty
  and tmux tests). For the display's terminal the kernel hands over the
  owner only, because the rule is keyed on a flag the kernel does not read
  ([SPAWN_INTERACTIVE](../20261013-144241-spawn-interactive/investigation.md)).
- By reading, the kernel's count is never below the supervisor's, so the
  supervisor's check refuses only when the kernel's table is full too; it
  runs first, and both say `EAGAIN`. No test tells the two apart.
- About 43 of the supervisor's 825 lines exist for the tree and the limit.
- Not found out: a reason for 32; what a browser does with more Workers; a
  test of a Worker that crashes while it has children (and whether a Worker
  the browser kills for memory raises any event); what "backstop" was meant
  to be, a count in the page, in the kernel, or both.

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
