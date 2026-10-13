# The supervisor's process tree and process limit beside the kernel's: the investigation

Read on `work/rust` (`integrate/round-1013`, head `ef1f5073`, 2026-10-14); history shared with `main`; tasks at `tasks/`. Line numbers of `src/`, `host/`, `abi/`, `docs/` and `test/` files are of that tree unless a commit is named. Nothing was built or run; every number comes from `git`, `grep` and the files. The sibling investigation `tasks/20261013-144241-spawn-interactive/investigation.md` traced the path of a Ctrl+C and the history of the sparing rule; this one builds on it and does not repeat it.

## Summary

1. The supervisor's tree is as old as the supervisor (`b95459ce`, 2026-09-05). It was then larger: it held the foreground root, computed "interruptible" by walking its own tree and told the kernel the result, and told the kernel each descendant's exit itself. `3f875924` (09-06) moved the foreground into the kernel, made the kernel mark a subtree exited and refuse a parent's retirement before its children's, and left the supervisor the two walks it has today: who gets the display's SIGINT, and which Workers to drop, deepest first, when a process ends.
2. Since `3f875924` the `parent` the supervisor records is its own observation (0 for the page's spawn, the calling process for a `SPAWN` response), checked once against `_dolly_process_parent` at registration and never read from the kernel again (`src/process-supervisor.mjs:220-234`). Before that commit it was read from the kernel (`b95459ce:382`).
3. The limit came later and from a different place: `26277ef5` (09-30), from audit task `20260930-100000-audit-19` "No trusted cap on concurrent process Workers" (tagged `security,boundary,core`), with the comment "Trusted bound on concurrent process Workers, independent of kernel records". No commit says why 32 on either side; the supervisor's number was set equal to the kernel's table size.
4. An owner decision of 2026-10-01 (`tasks/20260930-231102-parallel-rust`, "Decision (2026-10-01, delegated)") says: "Replace the fixed 32-process cap with a supervisor memory budget (admit a spawn while committed Wasm memory stays under a page budget), keeping a hard count limit as a backstop." Not built (`20260930-100000-audit-53`, item 2). A Worker's memory size is a fact only the supervisor has (`process.memory.buffer.byteLength`, `:671`).
5. By reading, the kernel's table count is always at least the supervisor's map count (the kernel keeps exited-and-retired children until `WAIT`; the kernel never disposes a record the supervisor still maps). So the supervisor's check (`:537-542`) refuses only when the kernel's table is full too; it runs first, so it is the refusal a program sees when both are full, and the kernel's refusal is the one seen when zombies fill the table. Both are `EAGAIN`.
6. Pieces that have moved from the supervisor into the kernel: the foreground root (`3f875924`), the ending signal (`f82289ea`), the exit of descendants (`3f875924`), the launch-after-ancestor-exit detection through a side channel (`e04d78b5`, a declared export instead), and the kill target (`d5badb25`: the kernel validates `SIGNAL` and hands the supervisor the pid). A kernel copy of part of the Ctrl+C rule (the child scan in `refresh_foreground`) existed from `3f875924` to `ae86e8c0` and was deleted; the supervisor's target selection stayed.
7. The deepest-first order in `#terminateDescendantWorkers` (`:757-769`) serves a kernel rule: `dolly_process_worker_retired` refuses a parent while a child's Worker is not retired (`src/process-kernel.c:2508-2511`). The order is the supervisor's; the requirement is the kernel's.
8. Two facts exist only in the supervisor at the moment they are needed: each process's Worker memory size and `interactive` bit for the 500 ms reclamation window, which `#retire` takes as the maximum over the subtree (`:677-680, 765`); and a descendant's own pending `retirementTimer`, which an ancestor's retirement cancels and takes over (`:689-693`, `#stop` `:788-792`). The kernel knows neither.
9. The pty path (`host/pty/kernel.c:115-117`, `src/process-kernel.c:2422-2435`, `#deliverRaised` `:262-266`) already has the shape the reflection proposes for the display: the kernel chooses targets with its own tree and the supervisor delivers them one at a time without a walk. It is tested (`test/pty-browser.mjs`, `demos/tmux/test/tmux-browser.mjs:63-68`).
10. Not found anywhere: a reason for the number 32, a test that pins the retirement order or the termination of a crashed Worker's children, a measurement of what a browser does with more than 32 Workers, and whether an out-of-memory Worker death raises an `error` event. Section 6 lists them.

---

## 1. History

### 1.1 Before Workers (`aa0e63c0`, 2026-08-31)

Commands ran inside the kernel's memory; there was no supervisor, no Worker and no tree outside the kernel. The spawn-interactive investigation (§1.1) covers that commit.

### 1.2 The supervisor is born with a tree and a foreground of its own (`b95459ce`, 2026-09-05)

"Checkpoint private wasm64 processes and working Python/Pi images". The process record at that commit (`src/process-supervisor.mjs` at `b95459ce:205-211`):

> `pid, parent: 0, resolve, reject, worker: null, gate: null, control: null, memory: null, messageHandler: null, errorHandler: null, messageErrorHandler: null, started: false, failure: null, foregroundRoot: foreground, interactive, interruptTimer: null, deadlineTimer: null`

What the supervisor held and decided then, beyond today:

- `foregroundRootPid` (`:155`, `:213-216`) and `#updateForeground` (`:232-247`): it walked its own tree (`#descendsFrom`, `:221-230`) to compute `hasForegroundJob` and told the kernel the result through two exports, `_dolly_process_foreground_set(pid, interruptible)` and `foreground_clear` (`src/dolly.c` at `b95459ce:867-899`). The kernel's own `dolly_process_descends_from` (`src/process-kernel.c` at `b95459ce:95`) existed already and was used by `src/dolly.c` to check the page's interrupt target against the published foreground (`b95459ce:556-562`, `908-912`).
- `#interruptForeground` (`:259-269`) chose SIGINT targets from `foregroundRoot`, `interactive` and the walk: as today.
- `#terminateDescendantWorkers(parentPid, status)` (`:631-656`) found descendants by an inline walk, and for each one terminated the Worker **and told the kernel** (`_dolly_process_worker_failed(pid, status)` then `_dolly_process_collect(pid)`, `:648-649`) and rejected its promise (`:652-654`). The kernel at that commit already marked and disposed a subtree itself in `mark_process_exited` (`b95459ce` kernel: `mark_process_exited(child, status); dispose_process(child);`), so both sides reclaimed.
- The `parent` of a child was read **from the kernel** in `#launchPending` (`:382-383`: `const parent = this.dolly._dolly_process_parent(pid); if (parent <= 0) throw ...`), when `next_launch` first named a pid the supervisor did not know.
- The 500 ms reclamation window for large interactive memories (`:557-581`), with the reason: "Dedicated Worker termination has no completion event. Large QuickJS/Pi memories otherwise remain charged long enough for an immediately launched recovery process to stall in Chromium."
- The kernel's table: `DOLLY_KERNEL_PROCESS_LIMIT = 32` (`b95459ce` kernel `:22`), `-EAGAIN` from `allocate_process` (`:452`). No message or doc line of that commit says why 32. `docs/process-model.md` at that commit has no "32".

The supervisor WAT at that commit had 15 exports, `dolly_process_parent` among them, and no `spawn_flags`, `worker_retired`, `exited`, `take_alarm` or terminal words.

### 1.3 The foreground goes to the kernel; the tree stays (`3f875924`, 2026-09-06)

"Move image startup and recovery into userspace". No message body. The diff of the supervisor (`git show 3f875924 -- src/process-supervisor.mjs`):

- Deleted: `foregroundRootPid`, `foregroundRoot`, `#updateForeground`, the "already has a foreground process tree" refusal, the kernel reads of `_dolly_process_parent` in `#launchPending`, the per-descendant `worker_failed`/`collect`/reject in `#terminateDescendantWorkers`.
- Added: `#registerProcess(pid, parent)` with the check `this.dolly._dolly_process_parent(pid) !== parent` (today `:220-224`), called with `0` from `spawn()` and with `process.pid` from the `SPAWN` response (today `:214`, `:599`); `#descendantDepth` (a depth instead of a boolean); `#terminateDescendantWorkers` sorted deepest first and returning the list and a reclamation deadline; `retiring`, `retirementTimer`, `reclamationDeadline` per process; `#retire` with its `retired()` closure acknowledging descendants and then the process; `#canLaunch` ("An ancestor's EXIT can reach the kernel before its Worker posts finished").
- The kernel in the same commit: `spawn_flags`, `worker_retired`, `foreground_pid`, `refresh_foreground` with a child scan for "interruptible", `mark_process_exited` no longer disposing children (they stay until retirement), `worker_retired` refusing a parent while a child's Worker is not retired (`-EAGAIN`) and disposing the children once it is accepted, `WAIT` needing `worker_retired`.

The reason given in the docs of that commit (`docs/process-model.md` at `3f875924:225-229`):

> "An exited child is not waitable until the trusted supervisor has dropped its Worker, memory and gate references and acknowledged retirement. Parent shutdown retires descendants first. Large interactive processes get one bounded browser reclamation window before that acknowledgment; Worker termination itself has no completion event. This applies equally to nested and root processes."

So from this commit on the division is: the kernel says who is exited and when a child is waitable; the supervisor says which Workers to drop, in what order, and when the browser has had its window.

### 1.4 Signals through the kernel's answers (2026-09-06 to 09-07)

- `d5badb25` (09-06, "Connect Python and Janis children and aborts to real process handles"): the kernel validates a process's `SIGNAL` request and the supervisor reads the target pid and number from the response (`signalDelivery`, today `:601-608`, `:621-623`) and delivers it with `#deliverSignal`. The first "the kernel hands the supervisor a target" pattern.
- `df37c09d` (09-06): a second Ctrl+C within a second forced an exit (`terminalInterruptAt`, supervisor-side); `SIGNAL_ACKNOWLEDGE` clears the interrupt timer; a deferred `EXIT` clears it (today `:554-559`). The double Ctrl+C was dropped by `9f1cdbb5` (10-01, "one that ignores SIGINT now keeps running, as in POSIX").
- `1f2954b6` (09-07): SIGWINCH never arms a deadline (`:285-287`).

### 1.5 The limit (`26277ef5`, 2026-09-30) and its task

Audit task `20260930-100000-audit-19`, "No trusted cap on concurrent process Workers", `PRIORITY: 210`, `TAGS: security,boundary,core`:

> "`src/process-supervisor.mjs:417-419` creates a Worker per spawn with no limit (threads are capped at 16 per process / 64 total in `src/host/threads.mjs:25`)."
>
> "Expected: The supervisor enforces a maximum number of live process Workers and spawn fails with EAGAIN beyond it."

`26277ef5` ("Fix kernel process semantics and make the process ABI explicit"): "A failed launch fails only its own process; the supervisor admits at most 32 process Workers (EAGAIN)". The diff adds `// Trusted bound on concurrent process Workers, independent of kernel records.` and `const processWorkerLimit = 32;`, the root check (today `:201`) and the `SPAWN` check before dispatch (today `:537-542`). The same commit's "The kernel exports exactly its declared contract functions" declared `take_interrupt` and removed `#canLaunch` with its `-2` side channel; `e04d78b5` the same day restored `#canLaunch` on a declared export, `dolly_process_exited`, with the reason: "EXIT marks every descendant exited, while the supervisor may still hold a compiled child for launch."

The task's result (`be26e24f`, 10-01): "The supervisor caps live processes at 32 ... a process `SPAWN` beyond it returns `EAGAIN`. `test/fixtures/process-lifecycle.c` now spawns sleeping children until the spawn fails, checks `-EAGAIN`, kills and reaps them, and spawns again". Note: "with the cap expectation changed to `ENOMEM` the browser test fails" shows that `EAGAIN` is returned, not which side returns it (§2.6).

Why the same number: the commit sets the supervisor's constant to the kernel's existing table size and says nothing else. The history has no browser measurement behind 32 on either side. The only text relating 32 to the browser is `tasks/20260930-100000-audit-32`: "32 Workers at once is not for the browser suite", and `docs/architecture.md:52-54`: "Every process is a fresh Worker and memory, and Worker termination has no completion event, so `N` multiplies memory pressure in one tab."

### 1.6 The 2026-10-01 round: ISIG, alarms, and the memory-budget decision

- `ae86e8c0` "Make Ctrl+C follow termios ISIG": the kernel's child scan in `refresh_foreground` (the copy of "an interactive owner with children" that `3f875924` had put in C) was deleted; the kernel now publishes `(owner, ISIG)` only (`src/process-kernel.c:180-194`). The supervisor's line became today's `:277`. This is the one case of a rule that was in both places and was removed from the kernel, not from the supervisor. What the kernel's copy computed was "is Ctrl+C a signal at all"; what the supervisor's computes is "to whom": not the same decision, but the same scan over the same links.
- `9b3e8c99` SIGALRM: "The supervisor's service tick asks the kernel for due timers. A default-action SIGALRM is delivered like kill". The kernel decides (default or handled, `alarm_handled`) and hands one pid at a time (`take_alarm`, `:2553-2567`); the supervisor delivers (`:253-255`).
- `cca6a6c0` "Stop processes through one supervisor helper": `#stop`.
- `32e3d5ff`: the root spawn lost its `interactive` option; the page can give only `foreground` (`:200-202`).
- The owner's decision, recorded in `tasks/20260930-231102-parallel-rust/TASK.md` ("Decision (2026-10-01, delegated)"): "Replace the fixed 32-process cap with a supervisor memory budget (admit a spawn while committed Wasm memory stays under a page budget), keeping a hard count limit as a backstop. Until then LLVM-sized builds run at `-j4`." Its "Remaining (2026-10-07)" repeats it: "The decision of 2026-10-01: a supervisor memory budget in place of the fixed 32-process cap, which bounds CMake builds at `-j4`." `tasks/20260930-100000-audit-53` (open), item 2: "The supervisor admits 32 processes (`processWorkerLimit`, `src/process-supervisor.mjs`), and a spawn past them fails: the same Makefile at `make -j16` ends in a second with 'compiler process failed' and `Error 126` for five targets. It holds CMake builds and LLVM at `-j4`. Decided on 2026-10-01 and not built: a memory budget ..., the count kept as a backstop."
- `tasks/20261001-214000-core-polish` ("Left, with reasons"): "The `cc` proxy's retry on 126: restored deliberately by the owner (`5221de8`). A supervisor-level `EAGAIN` before guest entry would be the proper home."

### 1.7 October: what else left the supervisor, and what the studies said about it

- `fd4c9a4b` (10-05): the kernel's 500 ms grace on a signalled child and the parked parent `EXIT` (`:2335-2343`); the supervisor's timer is the same length (`interruptGraceMilliseconds`, `:24`; kernel comment `:39-41`).
- `d2bad2db` (10-05): `getrlimit(RLIMIT_NPROC)` reports 32 (`src/process/libc-adapter.c:779`).
- `f82289ea` (10-06): "The supervisor rebuilt the signal from the exit request it had seen ... the kernel ends a process itself when a signal arrives before the program has entered, and on SIGKILL ... the signal was lost. The kernel always recorded it, for wait. `dolly_process_collect` now returns that record with the status, and the supervisor's copy is gone."
- `1f0b9f57` (10-06): no foreground published while an exited owner's Worker retires (kernel `:188-193`).
- `85a01262` (10-06): `#retire` services pipes and locks at once (`:682-685`).
- Studies: `tasks/20261002-073000-runtime-process-modules` ("spawn grants no browser authority beyond the Workers and memory the ENTRY process already has (the 32-process quota stays in the supervisor)"); `tasks/20261005-222449-spawn-users` ("What stays in the runtime with a `spawn@0`: the process table and its 32 slots; ... the supervisor's launch loop, module cache and retirement"; "about 50 of the supervisor's 748 lines, 2 of its 23 exports" for spawn); `tasks/20261012-230015-audit-fable/core.md` item 8 (quoted in §4) and `boundary.md`: "Stated, no code: ... 'process bookkeeping in Wasm' versus the supervisor's mirrored tree (`process-supervisor.mjs:226-247`, the core auditor's item)"; its `TASK.md` row 15: "the supervisor stops mirroring the process tree and the 32-process limit | a 669-line `process_dispatch`; two limits, two tree walks | no round".
- `tasks/20260930-100000-audit-24` (open): the supervisor is the largest trusted file (825 lines, `boundary.md` C7).

### 1.8 Pseudo-terminals: a kernel-chosen target list (2026-10-12/13)

`d9f8104e` (prototype), `a095e7d0` "the interrupt key spares only the first holder of a slave" (kernel `dolly_kernel_socket_holders(..., foreground, ...)`, `src/process-kernel.c:2422-2435`, `src/process-kernel.h:73-75`: "With `foreground` the one the other holders descend from is left out while it has them, as a terminal's interrupt key spares the shell that waits for its command"), `ec45edee` "the supervisor delivers a slave's signals": "The interrupt key, the resize and the hang-up of a pseudo-terminal were only marked pending in the kernel, so a program that makes no system call never heard them. The module now queues them for the supervisor (dolly-pty-supervisor-0.wat), which delivers each as it delivers a kill". `tasks/20261012-130814-tmux`: "Marked pending in the kernel alone, as a first version did, Ctrl+C left `for (;;) {}` running in its pane (measured)."

`06872986` (10-13): `/proc/processes`, the kernel writing `PID PARENT STATE ARGUMENTS` for programs (`src/process-kernel.c:886-920`); the kernel can print its tree to a program, and has no export that gives it to the supervisor.

### 1.9 What the history does not contain

No commit or task states a reason for 32. No task proposes moving the tree walk into the kernel before the reflection; the audit-fable core item 8 is the first. No task records a case where the supervisor's tree and the kernel's disagreed. No commit tried a kernel export listing descendants.

## 2. What each does today

### 2.1 The supervisor's record and where each field is written and read

`#registerProcess` (`src/process-supervisor.mjs:220-236`) creates: `pid, parent, resolve, reject, worker, gate, control, memory, messageHandler, errorHandler, messageErrorHandler, started, failure, interactive, retiring, interruptTimer, deadlineTimer, retirementTimer, reclamationDeadline, tid, threads, threaded`; `#launchPending` adds `gate, module, processInterface, threaded, largeStack, local` (`:425`) and `memory` (`:420`).

The fields that belong to the tree and the limit:

| Field | Written | Read |
| --- | --- | --- |
| `parent` | `:227` (from the argument: `0` at `:214`, the caller's pid at `:599`) | `#descendantDepth` `:241-243`; `#retire` `:694` (root → `#finish`) |
| `interactive` | `:230` (from `_dolly_process_spawn_flags`) | `#interruptForeground` `:277`; `#reclamationDeadline` `:671` |
| `retiring` | `:676`, `:789` | `:270, :272, :283, :466, :633, :735, :751, :806` |
| `reclamationDeadline`, `retirementTimer` | `:678-680, :701`; cleared `:493-496, :687` | `:700` |
| `memory` (its `buffer.byteLength`) | `:420`; nulled `:797` | `:671` |
| the map itself (`processes.size`) | `:234` set; `:710`, `:818` delete | `:201`, `:538`, `:240` (loop bound) |

The kernel is the runtime Worker's own Wasm instance (`src/runtime-worker.mjs:139`), called synchronously; the supervisor runs on that Worker's event loop (`docs/architecture.md:51`: "only the kernel's system call dispatch stays serial"). So no kernel call is ever "in flight" when the supervisor handles a timer, a tick or a Worker event; the kernel can be asked at every point below.

### 2.2 The walks and the decisions they serve

**Walk 1: SIGINT targets for the display's Ctrl+C.** `#serviceTick` (`:249-258`, every 16 ms) takes the owner pid from `dolly_process_take_interrupt` (`src/dolly.c:80-90`: the target only if it is still the interruptible owner). `#interruptForeground` (`:268-280`) lists every map entry that is not retiring and whose `parent` chain reaches the owner (`#descendantDepth`, `:238-247`: walks up at most `processes.size` steps; 0 for a root, a missing link, or no match), then applies the INTERACTIVE rule (`:277`) and delivers in map order (registration order: parents before children). Data: the supervisor's `parent`, `retiring`, `interactive`. The kernel contributed the owner pid and, at registration, the flag.

**Walk 2: which Workers to drop when a process ends, and in what order.** `#retire(process)` (`:675-703`) calls `#terminateDescendantWorkers` (`:757-769`): every map entry with a non-zero depth under the process, sorted deepest first, each `#stop`ped (`:788-792`: `retiring`, timers cleared, Workers terminated and listeners removed, `:771-798`), and the largest reclamation deadline among them. `#retire` is reached from:

- `#message` `"finished"` (`:657-660`): the Worker posted that `_start` returned or `EXIT` was recorded;
- `#fail` (`:734-746`): the Worker's `error` or `messageerror` event (`:453-457`), a `"failed"` message (`:661-663`, a trap or JS exception caught in `src/process-worker.mjs:164-176`), an invalid syscall (`:516-522`), a refused launch (`:434-438`), a start the kernel rejected (`:639-640`), `threads@0` withdrawn (`:193-198`);
- `#forceExit` (`:748-755`): the interrupt timer (`:299-304`), the deadline timer (`:483-488`), a SIGKILL or a signal the kernel refused or sent to a process not yet started (`:288-290`), the last thread retired (`:655`);
- `#canLaunch` (`:465-473`): the kernel reports the process exited before its launch.

Then `retired()` (`:686-696`) acknowledges each descendant in that order (`_dolly_process_worker_retired`, then `_dolly_process_collect`), then the process; a root is finished. The order is required by the kernel: `dolly_process_worker_retired` returns `-EAGAIN` while any child's Worker is not retired (`src/process-kernel.c:2508-2511`), and `#acknowledgeRetirement` throws on any non-zero result (`:705-711`). Data: the supervisor's `parent`, `retiring`, `retirementTimer`, `reclamationDeadline`, `memory`, `interactive`.

**Walk 3: root or child.** `process.parent === 0` (`:694`) decides whether the ending resolves the page's promise.

**The kernel is told of the exit before walk 2** in every path but one: `"finished"` → `worker_exited` (`:659`); `#fail` → `worker_failed` (`:741`); `#forceExit` → `worker_exited` (`:752`); `#canLaunch` is the one where the kernel already knew (`:468`). Each of those kernel calls marks the whole subtree exited (`mark_process_exited`, `:351-368`, recursing on `parent_pid`), closes its descriptors and republishes the foreground. So at the moment walk 2 runs, the kernel's records of the descendants are `EXITED` with `parent_pid` intact and not yet disposed.

### 2.3 What the kernel's own tree is used for

`parent_pid` is set once at spawn (`:722`) and never changed (no `exec`, no reparenting: `docs/process-model.md:369-372`; `tasks/20261006-214244-process-exec` is open). Uses:

- `dolly_process_descends_from` (`:168-178`): the `-EBUSY` rule for `SPAWN_FOREGROUND` from outside the foreground tree (`:716-718`); SIGWINCH to every running process under the owner (`:337-345`); the pty holders rule (`:2422-2435`, `host/pty/kernel.c:116`).
- Scans of `parent_pid`: `mark_process_exited` (`:355-359`); `refresh_foreground` walking up past retired or non-FOREGROUND owners (`:180-187`); `WAIT` (`:2183-2191`); `EXIT` parked while a child is in its grace (`:2338-2343`); `worker_retired`'s refusal and disposal of children (`:2508-2517`); SIGCHLD to the parent (`:2521-2523`); `INFO` (`:2205-2207`); `/proc/processes` (`:905`).

### 2.4 How the two trees are kept in step

Once: `#registerProcess` compares `_dolly_process_parent(pid)` with the parent the supervisor observed (`:221-224`). On a mismatch for a child, the throw is caught in `#syscall` (`:610-612`) and the **spawning** process is failed (126, one line on its stderr); the kernel's child record exists unregistered, so `next_launch` names it, `#launchPending` throws "kernel supplied unregistered process" (`:398`) and records its exit with 126 (`:438`). For the page's spawn the throw leaves `spawn()` and the image does not start. After registration nothing re-reads the kernel's parent; `#launchPending` only refuses pids it has not registered (`:395-398`).

Where the supervisor's `retiring` and the kernel's `EXITED` can differ: `retiring` is set in `#retire` and `#stop`; every path that sets it either told the kernel first (§2.2) or learned it from the kernel (`#canLaunch`). The kernel marks a process exited without the supervisor's knowledge in three places: a parent's `EXIT` (`:2344`), a signal before entry or SIGKILL (`:2546-2549`), and a Worker failure of an ancestor. In all three the supervisor learns when the ancestor's Worker posts or the forced exit runs, and then walks its own map. Between the kernel's marking and that moment, a signal to such a process is refused `-ESRCH` (`:2535-2537`) and `#deliverSignal` turns that into `#forceExit` (`:288-290`), whose `worker_exited` the kernel refuses (`:2478`, return value not checked at `:752`) and whose `#retire` then acknowledges a record the kernel already holds as `EXITED` (`:2506` passes). Section 5(e) walks this.

### 2.5 The two limits

| | Supervisor | Kernel |
| --- | --- | --- |
| Constant | `processWorkerLimit = 32` (`:23`) | `DOLLY_KERNEL_PROCESS_LIMIT = 32` (`src/process-kernel.c:21`) |
| Counts | `processes.size`: registered and not yet acknowledged retired (`PENDING`, `RUNNING`, exited with a Worker, in the reclamation window) | non-`FREE` slots: the same, plus exited-and-retired children until `WAIT` (`:2200`) or the parent's retirement (`:2516`) disposes them |
| Where | root spawn `:201` (throws `Error("Dolly process limit reached")`); `SPAWN` syscall `:537-542` (`-EAGAIN`, before `dispatch`) | `allocate_process` returns `NULL` → `-EAGAIN` (`:370-386`, `:720-721`), after the packet's `-EINVAL` and `-EBUSY` checks (`:689-718`) |
| Documented | `docs/process-model.md:62-63` ("at most 32 processes exist at once and further spawns fail `EAGAIN`"), `docs/slop.md:129`, `docs/architecture.md:20` | `RLIMIT_NPROC` 32 (`src/process/libc-adapter.c:779`); `/proc/processes` sized by it (`:890`) |

Relation of the counts, by reading: the supervisor deletes a map entry only in `#acknowledgeRetirement` (`:710`) and `dispose()` (`:818`). The kernel disposes a record in `spawn_packet` on failure (`:795`, before any registration), in `WAIT` for a child that is `EXITED && worker_retired` (`:2188`, `:2200`: the supervisor acknowledged it, so it is gone from the map), in `worker_retired(parent)` for the parent's children after all are retired (`:2508-2517`), and in `collect` (`:2583`), which the supervisor calls right after its own delete (`:690-691`, `:717`). So the kernel never disposes a record the supervisor still maps, and the kernel's count is at least the supervisor's. Consequences:

- When the two are equal (no zombie: every exited child has been waited for), the supervisor's check at `:537-542` is the one that fires, because it runs first; the kernel is not asked, so a spawn that would have been `-EINVAL` or `-EBUSY` gets `-EAGAIN`.
- When zombies exist (a shell that has not run `wait` on `&` jobs: `tasks/20261013-132514-ps`: "Slop collects a `&` program only at `wait`"), the kernel's table fills first and the kernel refuses while the supervisor's count is below 32.
- The reclamation window counts on both sides. A process the kernel marked exited by an ancestor's `EXIT`, whose Worker the supervisor has not yet dropped, counts on both sides.
- The root check (`:201`) is reached only at ENTRY or a build's start; it throws rather than returning an errno.

The lifecycle test (`test/fixtures/process-lifecycle.c:264-276`) spawns sleeping children, each waited for later, so the counts are equal there and the supervisor is the side that refuses; the fixture pins `spawned == -EAGAIN && count > 0 && count < 64`, not 32 and not the side.

### 2.6 Under the threat model

`AGENTS.md`: "Assume total compromise of the in-Wasm userspace. The outer imports of the main runtime and their trusted browser implementations are the security perimeter; internal command isolation is not required for host containment." `docs/browser-boundary.md:11`: "Private processes help recovery, not containment."

Facts from the code:

- The supervisor creates a Worker only for a pid it registered (`:395-398`), and registers only from its own `spawn()` or a `SPAWN` response it handled (`:214`, `:599`). So the number of process Workers and process memories (each up to the maximum the executable declares and `validateProcessInterface` admits, `:345`, `src/process-abi.mjs:44-56`) is bounded by `processWorkerLimit` whatever `next_launch` or the kernel's table says. With only the kernel's count, that bound would be the kernel's honesty; a kernel answering every `SPAWN` with a fresh pid would get a Worker per answer. The thread budget has the same shape for the same reason (`host/threads/threads.mjs:16`: "Trusted resource limits, independent of kernel bookkeeping or guest claims"; 16 per process and 64 total on the page against `DOLLY_THREADS_PER_PROCESS = 64` in `host/threads/kernel.c:12`, so the thread limits are also two, with different numbers).
- `#terminateDescendantWorkers` reads only the map: the supervisor terminates exactly the Workers it created whose recorded parent chain reaches P, whatever the kernel says at that moment. A kernel-provided list would be the kernel's claim at that moment. What a wrong claim could do: name fewer (Workers outlive their tree until the count stops new ones; the kernel's own records of them are `EXITED`, so their next call is `-ESRCH`, `:1684-1687`) or name more (end Workers of the compromised userspace's own processes). Neither reaches the host beyond the Worker count, which the limit bounds either way.
- The acknowledgement order is enforced by the kernel (`-EAGAIN`, `:2508-2511`), and the supervisor treats a refusal as fatal for that retirement (`:707-709`: throws).

## 3. Counted

**Supervisor lines that exist for the tree and the limit** (by hand, of 825): `:22-23` (2, the constant), `:201` (1), `:223` (1, the registration check), `:227` (the `parent` field, part of a line), `:238-247` (10, `#descendantDepth`), `:271-274` (4, the descendant filter), `:537-538` and `:542` (3, the `SPAWN` check; `exhausted` also covers threads), `:677-680` (4), `:689-692` (4), `:694` (1), `:757-769` (13). About 43 lines; `:277` and `:671` read `interactive` and belong to the sibling task. `tasks/20261005-222449-spawn-users` counted "about 50 of the supervisor's 748 lines" for spawn as a whole.

**Kernel exports the supervisor calls** (`grep "this.dolly._" src/process-supervisor.mjs`: 29 symbols; the contract is `abi/dolly-supervisor-0.wat`, plus `host/pty/dolly-pty-supervisor-0.wat` and `host/threads/dolly-threads-supervisor-0.wat`):

- Decisions the kernel made and hands over: `take_interrupt` (the owner pid, only while interruptible), `take_alarm` (one pid per call, default action decided in C), `pty_take_signal`/`pty_taken_signal` (pid and number, sparing decided in C), the `SIGNAL` response (`signalDelivery`, a validated target), `next_launch`, `exited`, `collect` (status and signal), `deadline_remaining`, `deferred_milliseconds`, `take_wakeup`.
- Raw facts the supervisor computes on: `spawn_flags` (the INTERACTIVE bit → `:277`, `:671`), `parent` (checked once, then the supervisor's own copy is used), `image_address`/`image_size` (bytes to compile and hash).
- Facts the supervisor tells the kernel: `spawn_serialized`, `dispatch`, `image_consumed`, `worker_started`, `worker_exited`, `worker_failed`, `worker_retired`, `threads_attach/retired/unstarted`.
- Memory and text: `malloc`, `free`, `terminal_write_bytes`.

Of the display's Ctrl+C the kernel hands the owner only; the supervisor expands it. Of the pty's Ctrl+C the kernel hands each target. Of `kill` the kernel hands the one target the program named.

**Tests that pin the behaviour:**

- `test/fixtures/process-lifecycle.c:264-276` (run by `test/process-browser.mjs:99`): spawn until `-EAGAIN`, `0 < count < 64`, kill and reap, spawn again. Pins an `EAGAIN` at a cap, not 32 and not which side.
- `process-lifecycle.c:162-172`, `:256-262`, eight rounds: a parent exits leaving a retired unreaped child and four children still queued for launch, and exits 0 (the kernel's subtree marking, `#canLaunch`, the retirement handshake for children without a Worker).
- `test/process-browser.mjs:119-137`: `timeout 15 interrupt linger`: "a child still running after its grace ends with its parent" (kernel grace `fd4c9a4b` and the supervisor's termination of the lingering child's Worker through walk 2).
- `test/process-browser.mjs:162-208` (from the sibling investigation): a nested `foreground -i` tree; Ctrl+C ends `sleep 30` and the `.dollyrc` shell with it.
- `test/shell-browser.mjs:161-168`: a CPU loop ended by Worker termination; shell and files survive.
- `test/display-browser.mjs:94-125`: the 500 ms window of a 160 MiB `-i` program.
- `test/ending-browser.mjs:39-54`: SIGINT ends an `ENTRY /bin/slop loop.slop`; `kill -9 $$` is ended by the kernel and the notice names SIGKILL (`f82289ea`: the supervisor's forced exit is refused, the kernel's record is the fact).
- `test/threads-browser.mjs` (`be26e24f`): exit racing eight threads, ten times (the supervisor's `threads` map, the same kind of bookkeeping).
- `test/pty-browser.mjs` with `test/fixtures/pty.c` `spared()`, and `demos/tmux/test/tmux-browser.mjs:63-68`, `:111-117`: kernel-chosen pty targets delivered by the supervisor.
- Not found: a test of a Worker that crashes (trap, `"failed"`, `error` event) while it has running children; a test of the deepest-first order; a test that distinguishes the supervisor's `EAGAIN` from the kernel's.

## 4. The reflection's claims, checked

**"The supervisor keeps `parent` per process (line 227) and walks it in `#descendantDepth` (238-247), `#interruptForeground` (268-280) and `#terminateDescendantWorkers` (757-769)."** True; the line numbers match this tree. Two further readers the reflection does not name: `#retire` `:694` (root detection) and `retired()` `:689-693` (the acknowledgement order), both over the list walk 2 produced.

**"The kernel has `dolly_process_descends_from` (`process-kernel.c:168`) and decides the foreground itself (180-195)."** True of `:168-178` and `:180-194`. `refresh_foreground` decides the owner and the ISIG bit; it does not list targets. The kernel's `descends_from` serves `-EBUSY`, SIGWINCH and the pty rule (§2.3); nothing in C lists a process's descendants to the supervisor.

**"The supervisor chooses whom SIGINT reaches (`:277`): the INTERACTIVE policy lives in JS and C."** Partly: the sibling investigation (§4) found the display rule in one place, JS, and a different rule for ptys in C. The kernel's copy of the child scan was deleted by `ae86e8c0`.

**"The limit twice: `processWorkerLimit = 32` (`:23`, `:201`, `:538`) beside `DOLLY_KERNEL_PROCESS_LIMIT = 32` (`:21`, `EAGAIN` at `:697`)."** True of the two constants and the three supervisor lines; the kernel's `EAGAIN` is at `:721` (`:697` is the INTERACTIVE flag check). What "twice" means in effect is in §2.5: one count is never larger than the other, the supervisor's runs first, and the two were introduced for different reasons (a table size in `b95459ce`, a trusted cap in `26277ef5` from a security audit). `core.md` item 8's "pre-empts the kernel's `EAGAIN`" is true in the equal-count case.

**"The pattern that removes it exists: `take_alarm` and `dolly_pty_take_signal` hand the supervisor the next PID to signal (`:253-265`)."** True of `:253-255` and `:262-266`, and of `signalDelivery` (`:601-608`, `:621-623`) which the reflection does not name. What those three have that the display's Ctrl+C does not: the kernel knows the rule (alarm: `alarm_handled`; pty: holders and descent; kill: the program named the pid). For the display, the kernel does not read INTERACTIVE after validation (sibling §2.1), so handing targets would need the rule in C.

**"One kernel export lists a process's descendants deepest first; the JavaScript walk and the JavaScript limit are deleted."** A proposal, not a claim; what it would need and no longer need is in §5. One fact: the deepest-first order that the walk computes is what the kernel's `worker_retired` demands (`:2508-2511`), so a kernel list would carry a requirement the kernel itself makes. Another: the list would not carry the reclamation deadline, which is computed from Worker memory sizes the kernel does not have (`:671`, `:765`).

**"Kernel C and page JavaScript: no image input, no rebuild of images."** True for the supervisor and `src/process-kernel.c`: `f82289ea` and `1f0b9f57` are kernel-and-page commits whose messages record "image inputs stay"; image inputs are recipe and artifact digests (`src/image-inputs.mjs`), and the spawn-interactive investigation found `process.h` and Slop in the seed but not the supervisor. A new export in `abi/dolly-supervisor-0.wat` changes `dist/dolly.wasm` and the artifact test (`26277ef5`: "the artifact test checks every dolly_* export against the contracts"), not an image. A change to `include/dolly/process.h` would be a seed change; the proposal names none.

**`core.md` item 8: "`#descendantDepth`, `#terminateDescendantWorkers`, `#interruptForeground` walk a mirrored `parent` while the kernel has `dolly_process_descends_from` (`kernel:168`) and uses it for the same decision (`kernel:342`)."** `:342` is SIGWINCH to the foreground tree: the same set (the owner's running descendants) for a different signal, computed in C; the kernel sets the pending bit itself there and needs no supervisor, because SIGWINCH never forces termination (`:285-287`, `1f2954b6`). The sets differ in one detail: the kernel's includes the owner; the supervisor's excludes a retiring process (`:272`), which the kernel would see as `EXITED` (§2.4).

## 5. What a change would mean, on real cases

"Today" is the code above. "Alternative" is the reflection's: the kernel hands interrupt targets one at a time as it chose them; one export lists a process's descendants deepest first; the supervisor keeps no `parent` and no count. Read, not run.

**(a) Ctrl+C at a shell running `make` with a compiler under it.** Tree: `slop` (`foreground -i`, owner) → `make` → `cc` → the compiler process (`docs/process-model.md:55-56`: `cc` spawns the compiler and waits). Today: the tick takes the owner from the kernel (`src/dolly.c:80-90`); walk 1 lists `make`, `cc`, compiler; `:277` spares `slop`; each gets `_dolly_process_signal(pid, 2)` and a 500 ms timer (`:282-306`), in registration order; `make`'s and `cc`'s parked `WAIT`s are answered `-EINTR` (`:293-298`); the compiler, in a CPU loop that enters the kernel at least once a millisecond (`src/process-worker.mjs:92-101`), polls and ends; `cc` and `make` see the wait status. Data that decided: the supervisor's `parent` and `interactive`. Alternative: the kernel would list the same three (its `parent_pid` links are the same); to spare `slop` it would have to apply the INTERACTIVE rule, which no C code applies today, or the reflection's companion change (no INTERACTIVE, Slop handles SIGINT) would make the list "owner and descendants". What would no longer be needed: walk 1 and the `interactive` read at `:277`. What would stay: `#deliverSignal` and its timer per target, and `interactive` at `:671`.

**(b) A Worker that crashes while it has children.** Who learns first: the supervisor, through a `"failed"` message (`src/process-worker.mjs:164-176`: a Wasm trap or JS exception in the Worker's `try`) or the Worker's `error` event (`:453-456`, `{ once: true }`). Then `#fail` (`:734-746`): a line into the kernel mailbox, `worker_failed` (the kernel writes the line to the process's stderr, marks the subtree exited, closes descriptors, `:2485-2496`), `#retire`. The kernel can be called: the event is handled on the runtime Worker's loop and the kernel is synchronous there. Order of the children's termination: walk 2 sorts deepest first (`:761`) and `#stop`s in that order (grandchildren before children; siblings in registration order); each child's Worker is terminated at once, before `retired()`, which may wait for a reclamation window (`:700-702`). Acknowledgement follows the same order (`:689-693`), as the kernel requires. A child's syscall message arriving after that is dropped (`:633-634`). Alternative: after `worker_failed`, the supervisor asks the kernel for the subtree; the records are still there (`EXITED`, `parent_pid` intact, disposed only by retirement). It would need: the export to be callable from a Worker event handler (it is, by the same reasoning), and the order (or a retry on `-EAGAIN`). What it would not carry: each child's `memory.buffer.byteLength` and `interactive` for the deadline (`:765`), and a child's own pending `retirementTimer` that the ancestor's retirement must cancel (`:689-693` over `#stop`); the supervisor would still look each listed pid up in its map for those. Not known: whether an out-of-memory death of a Worker raises an `error` event at all (§6).

**(c) `timeout 1 sh -c 'sleep 100'`.** `timeout` spawns with a deadline (`src/commands/run-program.h:47-60`, `dolly_spawn_mapped(..., timeout_milliseconds)`). The kernel validates and stores the deadline (`:700`, `:724`) and exports the remaining time (`:2569-2575`); it does not act on it: `process->deadline_nanoseconds` is read nowhere else in `src/process-kernel.c` (the `deadline_nanoseconds` at `:1522`, `:1648`, `:2302` are per-call deadlines of reads, polls and sleeps). The supervisor arms a timer at registration (`:235`, `:483-488`) and at expiry `#forceExit(sh, 124)` → `worker_exited` (the kernel marks `sh` and `sleep` exited) → `#retire(sh)` → walk 2 stops `sleep`'s Worker → acknowledges `sleep`, then `sh`; `timeout`'s `WAIT` returns 124. So "a kill of a subtree by the kernel's own decision" is, today, a kill decided by a supervisor timer from a kernel-stored value, with the subtree marked by the kernel and its Workers ended by the supervisor's map. Alternative: the same, with the kernel listing `[sleep]` after `worker_exited`. The deadline timer is not part of the tree or the limit; it is one more supervisor-side fact (a `setTimeout`) whose source is the kernel.

**(d) The 33rd process.** With no zombies (every earlier child waited for), the supervisor refuses at `:537-542` with `-EAGAIN` before the kernel sees the packet; the program's `spawn` returns `EAGAIN` (`cc` prints "compiler process failed", `make -j16` shows `Error 126`: `audit-53` item 2). With zombies the kernel refuses at `:721` with the same errno. At ENTRY (`:201`) the page's spawn throws. If only the kernel counted: the number of Workers would equal the number of pids the kernel answers with; a kernel that lied would get a Worker and a memory per answer until the browser refused (not measured, §6). What else the count carries today: nothing; it is one comparison in two places and one constant. The 2026-10-01 decision (a page-side memory budget with the count as a backstop) names a bound the kernel cannot compute, since Worker memories are private to the supervisor (`:419-420`, `:671`).

**(e) A forced page-side termination of a process the kernel already marked exited.** Example: a child's 500 ms interrupt timer fires after its parent's `EXIT` marked it exited but before the parent's Worker posted `"finished"`. Today: `#forceExit(child)` → `worker_exited` returns `-EINVAL` (`:2478`), unchecked at `:752`; the kernel's record keeps its earlier status and signal (`abi/dolly-supervisor-0.wat:33-34`; `f82289ea`); `#retire(child)` → walk 2 (its own descendants, if any) → `retired()` → `worker_retired(child)` accepted (`EXITED`, `:2506`) → map delete. When the parent's `"finished"` then arrives, walk 2 for the parent no longer lists the child, and `worker_retired(parent)` passes because the child is retired. The two orders converge; the guards are the supervisor's `retiring` (`:751`, `:735`) and the kernel's idempotent `worker_retired` (`:2507`). The one place the supervisor consults the kernel's exit record is `#canLaunch` (`:468`). Alternative: a kernel list at the child's forced exit would be empty or the same; nothing in this case depends on the walk's data except `retiring`.

**(f) A pseudo-terminal's Ctrl+C inside tmux.** Today: byte 3 written to the master under ISIG makes the kernel call `dolly_kernel_socket_holders(slave, 1, raise_signal, SIGINT)` (`host/pty/kernel.c:115-117`): every holder except the one the others descend from while it has them (`src/process-kernel.c:2427-2433`, using the kernel's `descends_from`); the targets wait in `raised[]` (`host/pty/kernel.c:33-47`); the supervisor's tick and every `#syscall` and `#retire` drain them (`:262-266`, `:624`, `:684`) into `#deliverSignal`, which only looks the pid up in the map. No JS walk; the kernel decided with its own tree, by descent and not by flag (sibling §2.4). Tested: `demos/tmux/test/tmux-browser.mjs:63-68` ("Ctrl+C is for the program in the pane; its shell reads the next line"). This is the alternative's shape already in the tree for one terminal kind; the display's path differs in that `take_interrupt` returns one owner and the sparing rule is keyed on a flag the kernel does not read.

**What is only in the supervisor at the moment it is needed, exactly:** each Worker's memory size and the resulting reclamation deadline (`:669-673`, `:678-680`, `:765`); a descendant's pending `retirementTimer` and `retiring` state (`:493-496`, `:687`); the deadline timer of a timed spawn (`:486`); the thread Workers of a process (`:431`, `:583-591`). The `parent` links are not only there: the kernel has the same links and `#registerProcess` checked them against it.

**What would get simpler, as observed:** the ~43 lines of §3 minus whatever the alternative adds in the supervisor to call the new export and keep the order; the `parent` check at registration and the `parent` field (root detection would need another key: `_dolly_process_parent(pid) === 0` at retirement, or a flag set at `:214`). What would move into C: a walk over the table that `dolly_process_descends_from` already does per pair, a sort by depth, and, for the display's Ctrl+C, the sparing rule. What would be unchanged: `#deliverSignal` and its timers, `#retire`'s deadline and handshake, the thread bookkeeping, the deadline timer.

## 6. What could not be found out

- **Why 32.** No commit, task or doc gives a reason on either side. Whether a browser bounds Workers per page, and at what number, is not measured anywhere in the tree; `audit-32` only says 32 at once "is not for the browser suite".
- **Whether the two refusals ever differ in practice.** No test distinguishes the supervisor's `-EAGAIN` from the kernel's; §2.5's "kernel count ≥ supervisor count" is by reading. A browser run with zombies (`sleep 1 &` without `wait`) and one without would show which side refuses in each.
- **A crashed Worker with children.** No test traps a parent while a child runs; the order and timing of §5(b) are by reading. Whether a Worker killed by the browser for memory raises `error`, `messageerror` or nothing is not in the code; if nothing, the supervisor learns only when the kernel's `EXIT` grace or a timer acts, and the children's Workers stay until then.
- **The 2026-10-01 memory-budget decision's shape.** The task records the decision and that it is not built; what "committed Wasm memory" means (declared maxima, `buffer.byteLength` at spawn time, or something the browser reports) is not written down.
- **The owner's words on the mirror itself.** The tree walk has never been the subject of a task or decision; the limit's reasons are the audit's ("trusted cap") and the 10-01 decision (a budget with the count as backstop). Whether the owner meant "backstop" as a supervisor-side count, a kernel-side count, or both is not stated.
- **Firefox's double entry** (`:540-541`, `511cd751`): whether a kernel export called from a Worker event handler is exposed to the same engine behaviour as `dispatch` was is not known; the `Reflect.apply` workaround covers `dispatch` only.
- **Retirement races in Firefox.** `tasks/20261006-142127-kboundary-02` reports a Firefox failure "not explained" after a rename of these very call sites; nothing ties it to the tree, and nothing rules it out.