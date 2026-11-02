# A process that ends keeps its memory resident until the runtime Worker collects garbage

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: core,memory,processes


Found 2026-11-01 (`demo/lean-2`, agent E) when the `lean` image build was killed by its 9 GB cap.

The runtime Worker creates each process's shared `WebAssembly.Memory` and its gate instance; when
the process ends the supervisor drops both (`#disposeWorker`), and the Worker that ran it is
terminated. The memory's pages stay resident until the runtime Worker's isolate collects garbage,
which its small heap rarely needs, and no browser frees a shared memory on request.

Measured (`work/lean/build/lean-evidence/leak/leak.mjs`, `system`, six runs in a row of a program
that touches 512 MiB, the scope's anonymous memory after each, Chrome 156 and Firefox 155):

- `main`, Chrome: 1.33, 1.83, 2.31, 2.81, 3.30, 3.80 GiB (then a collection: 1.28).
- `main`, Firefox: rises by 0.5 GiB a run, collected about every third run.
- With the runtime Worker made to collect after each process (`--js-flags=--expose-gc`, a
  diagnostic): flat at 0.8 GiB in Chrome.
- With an untouched 1 GiB `ArrayBuffer` allocated as each process ends: Chrome collects every
  other run, Firefox every run. That steers the collectors' heuristics; it frees nothing itself.

A build of large processes in a row keeps several dead ones resident: the `lean` image's modules
each import 1.7 GB, beside the kernel's 2.4 GB of libraries.

## Made (2026-11-01): the supervisor reports the garbage

A process's memory taken to its maximum before its second thread
(`tasks/20261030-090000-chrome-grown-memory`) grows once, by another isolate, so the runtime Worker
no longer allocates a buffer object at each of its steps, which likely made it collect even less
(not measured apart): the `lean-meta`
image build was killed by its 9 GB cap while it copied the finished image (8.7 GB before). So
`#disposeWorker` allocates an untouched `ArrayBuffer` of the dead memory's size (at most 2 GiB) and
drops it: the bytes that became garbage, which the collectors' own count lacks. It touches no page.
Same six runs: Chrome keeps at most one dead process with or without threads (0.78 to 1.28 GiB),
Firefox none without threads and at most two with them.

This steers the collectors' heuristics rather than freeing anything, the one lever JavaScript has.
The deterministic design is for the owner: the runtime Worker holding no reference to a process's
memory at all, the copies between it and the kernel's done in the process's own Worker, ended with
it (the gate's job today), at the price of kernel memory in process Workers, which the security
perimeter allows (in-Wasm compromise is assumed) but the design has kept out. Read on 2026-11-02:
the gate (`abi/dolly-process-gate-0.wat`) is the runtime Worker's only access to a process's
bytes besides its size, and every call goes through the kernel's one mailbox. Done in the process
Worker against that mailbox, each call would need two more hand-offs between the Workers; with a
mailbox of each process's own in kernel memory, written before the call is posted and read after
its answer, it needs none, but that changes the supervisor contract (`abi/dolly-supervisor-0.wat`).

Done-when: a process's memory is released when it ends, measured with that program in Chromium and
Firefox, without steering a collector. A pool handing dead memories to the next process would not
do: it never frees one either, a memory never shrinks, and a process with threads has all 8 GiB.

## Decision (2026-11-02, agent M): the runtime Worker never holds a process's memory

What held a process's memory in the runtime Worker (`src/process-supervisor.mjs` at fa949c1b):
`process.memory`, made there by `createProcessMemory`; `process.gate`, an instance importing it;
the `configure` message to each of its Workers and the grower's message (clones, gone once
delivered); the closures of `#reserveMaximum`. `#disposeWorker` drops the first two, and from then
on the pages wait for the runtime Worker's collector. A shared memory's pages go when the last
agent holding a wrapper drops it: a terminated Worker's wrappers go with its isolate, a living
Worker's only with its collection, which a small heap rarely needs. So the rule is the one E
proposed, taken whole: nothing that needs a process's memory runs in the runtime Worker; it runs
in a Worker that ends with the process. Its consequences, each decided here:

1. The process Worker makes its memory and the gate (it is given the kernel memory and the
   gate module), copies its request into a mailbox of its own in kernel memory before it posts
   the call, and the answer out after the reply. The supervisor allocates that mailbox per Worker
   (`kernel.malloc`, 1 MiB, freed when the Worker is disposed) and registers it with the kernel
   when the Worker starts, `dolly_process_worker_mailbox(pid, tid, address)` (`abi/dolly-
   supervisor-0.wat`, withdrawn with zero): the process record keeps an unthreaded process's,
   the threads module's thread record a thread's, through a `mailbox` hook of the kernel module
   interface, and both dispatches find it by the thread. In the kernel `process_mailbox` becomes
   the pointer each entry sets; the supervisor's own packets (the page's spawn, a refusal or
   failure line) keep a static mailbox at `dolly_process_mailbox_address()`.
   A first version named the mailbox to each dispatch call instead, which changed
   `dolly_threads_dispatch`'s signature in `host/threads/dolly-threads-supervisor-0.wat`: that
   moved the `image inputs` hash (`a58af3f9…` to `ef0f4919…`), since a module's ABI digest, which
   every executable linking it records and the loader checks, is the SHA-256 of all its
   contracts, the supervisor-side one included (`scripts/generate-abi-constants.mjs`). An edit to
   a kernel-to-runtime contract is thus a seed change today; registration at start needs none,
   and is the better shape anyway (one registration per Worker, not a parameter per call).
2. A thread Worker receives the memory from the Worker that spawned it: the spawner opens a
   `MessageChannel` for that call, sends one port with the spawn, and posts the memory on the
   other once the reply names the thread; the supervisor hands the port to the thread Worker
   without opening it. Nested Workers were rejected: the main thread's Worker closes itself at
   `pthread_exit`, which would end the threads under it.
   Firefox 155 drops what was posted on a port whose sender closes it before the receiver has
   started, re-transferred or not; Chrome 156 delivers it (`build/proc-mem-evidence/relay/`, a
   bare page: "sender closes" times out in Firefox in both the relayed and the direct case,
   "sender keeps" gets the memory in both browsers). So the thread's Worker sets a word sent
   with the memory once it has it, and the spawner closes such channels at its next call.
   Found because a thread Worker that waited ten seconds for its memory threw at top level,
   and the supervisor's `error` listener did not cancel the event: the browser then reports a
   nested Worker's uncaught error again in the runtime Worker, whose end it is (`fatal`,
   `src/browser.mjs`). The listener now cancels it, and a memory the Worker cannot make or
   receive is a `failed` message, status 126 for that process alone.
3. The reservation of the maximum before a second thread (`tasks/20261030-090000-chrome-grown-
   memory`) stands; the spawning Worker makes it itself, before it posts the spawn, and a refusal
   is `EAGAIN` there. The grower Worker and `#reserveMaximum` go: the grower existed so that the
   runtime Worker would not touch the memory, and the process's own Worker is as much "a Worker
   that ends after it", with no start-up and no busy wait for the new size in either Worker.
   `host/runtime/grower.mjs` stays for the kernel's memory.
4. The spawn budget and the large-interactive window read the size the Worker reports with each
   call; a threaded process's reports at its maximum are ignored, so the budget keeps the size
   before the reservation, as `budgetBytes` did.
5. A deferred call is retried against the request still in the mailbox, so a handler that
   defers must have written nothing: that is now the module contract (`process-kernel.h`), and
   `fd_poll_packet`, the one handler that wrote its results over its queries before it could
   defer, finds readiness first and writes only when it answers. The other 25 deferral sites in
   the kernel and the modules already left the request alone. A first version had the
   supervisor keep a copy of the request at the first deferral and restore it before each
   retry; taken after the dispatch, the copy held poll's clobbered queries, and a thread's
   `poll` on a pipe, a pty master's read and a parent's read of a child's pipe never completed
   (`threads-browser`, `pty-browser`, `process-browser`; `build/proc-mem-evidence/trace2-
   chromium.log` shows the two retries alternating forever). The invariant is the smaller rule
   and costs nothing per call.

Rejected: steering the collector (c53115b6: frees nothing, measured to leave one or two dead
processes); a memory pool (never frees, 8 GiB for a threaded one); making the memory in the Worker
but copying in the runtime Worker (any wrapper there retains); a lock on the one kernel mailbox
(the supervisor would wait on a process Worker).

A Worker the supervisor ends unprompted (Ctrl+C, a deadline, EXIT by another thread) may be
inside the copy into its mailbox when the supervisor frees it: termination has no completion
event, and a free racing a copy would corrupt the kernel heap, a race today's design does not
have since the supervisor copies. So the Worker copies under word 4 of its control block (1), and
the supervisor seals the word (2) before it frees the mailbox, waiting for a copy in flight
(`Atomics.wait`, at most a second, after which the mailbox is left to the kernel unfreed): a sealed
Worker copies no more and leaves. The request copy alone writes kernel memory; the response copy
reads it.

## Measured (2026-11-02)

The tree's images came from an older seed, so the core closure (`system-build,system,default`,
78 images) was built first with fa949c1b's runtime, one job in a 6 GB scope, sampled every 5 s
(`build/proc-mem-evidence/closure-*.log`): 1175 s, the scope's `memory.peak` 3.39 GiB; per image,
zig-build 3234 MiB over 150 samples, system 2945, system-build 2676 (76 s), ghostty-build 2520,
system-tools 2286 (the browser, node and the kernel's memory included).

`test/process-memory-browser.mjs` (new): a program that touches 512 MiB, run twenty times in a row,
then again with the touch on a second thread (the memory at its 8 GiB maximum), then `make -j4`
of 32 C++ files on `<regex>`; the anonymous resident memory of the browser's process tree
(`RssAnon` of node's descendants) sampled after each run and every 250 ms while make runs
(`build/proc-mem-evidence/before-process-memory-3.log`). Before, fa949c1b with c53115b6's garbage
report:

- Chromium: baseline 927 MiB, then 1439, 927, 1441, 904, ... after each run: one dead process,
  collected every other run, 514 MiB over the baseline; the thread variant the same (520 MiB);
  make -j4 (31 s) peaks 488 MiB over its baseline, 68 MiB over it two seconds after.
- Firefox: flat without threads (1180 MiB before, 1174 after twenty runs); with a thread 1686 MiB
  after every run, then 2201, 2715, 2719: three dead processes, 1550 MiB over the baseline, still
  there two seconds after the last; make -j4 (42 s) peaks 391 MiB over its baseline.

After (`after-process-memory-2.log`, the test passes in both):

- Chromium: 1028 MiB, then 1028 to 1033 after each run, 1005 two seconds after the last; with a
  thread 893, then 894 to 898; make -j4 in 21 s peaks 418 MiB over its baseline, 87 over it two
  seconds after.
- Firefox: 1286, then 1287 to 1301, 1217 after; with a thread 1217, then 1180 to 1219; make -j4 in
  26 s peaks 373 MiB over its baseline, 8 over it two seconds after.

The memory goes with the process in both browsers, and make runs a third faster: the runtime
Worker no longer copies any packet. A Worker's teardown follows the shell's prompt by some
milliseconds, more on a loaded machine (beside an image build a sample right after a run read
up to 288 MiB over the baseline once, flat two seconds later), so the test's sample has a second
to come within its bound; a memory kept for a collection does not. On the final code, beside
that build, both browsers pass (`final-process-memory.log`: Chromium 1031 MiB, then 1032 to
1089 after each run; Firefox 1210, then 1209 to 1308).

The image build of `system-build` (about 100 compiler processes, 76 s unloaded), three times
through the reproducibility check in a 6 GB scope sampled every 2 s, the three snapshots
byte-identical with each other and with the morning's (`293147bb…`): fa949c1b's runtime peaks at
3059, 3185 and 3343 MiB a build (`before-repro-samples.log`), this one at 3143, 3330 and 3183
(`after-repro-samples.log`, beside the other agents' builds, each build half as fast). Within
noise: this build's compilers are small and short, and c53115b6's garbage report kept Chrome to
one dead one. The gain is where a dead process is large (one 512 MiB process in Chrome, three
with threads in Firefox) and in make's time.

Verified (`build/proc-mem-evidence/tests-*.log`), in Chromium and Firefox each: `core`, `ending`,
`pty`, `threads`, `process` (pipes, signals, exec among them), `stack`, `host-compute`, `sockets`,
`dso`, and the merged fix's `boundary` and `memory-growth-notify`; the source suite (466).
`fix/boundary-hang` (41c6a754, the kernel's grower asked through its control word) is merged:
its three lines in `#reserveMaximum` had no function to land in, since a process's memory is
grown by the Worker that spawns its first thread, with no message and no wait.

Found on the way: `integrate/2026-11-02` (fa949c1b) pins `src/commands/{install,du,xargs,find,timeout}.c`
at digests older than the files (ba1e63b1 changed them without `update-recipe-pins.mjs`), which
`npm run image` silently corrects at its start since re-pinning is its first phase; 162 recipes
move with them. Committed apart here as the pins this tree builds with.

Kernel memory reaches process Workers, which the design had kept out.

## Closed 2026-11-02

Done-when met: `test/process-memory-browser.mjs` fails on fa949c1b (one dead process retained
in Chrome, three in Firefox with threads) and passes on `core/process-memory` in both browsers,
with no collector steered. Commits: ccabef7e (pins), 02d36f09 (the memory in the Workers),
b1e680c5 (deferral invariant, poll), b3fe9813 (fixture), 96ded447 (merge of fix/boundary-hang),
b0a0d69d (a spawner waits for its threads' memory), 9b25cbff (the test's sample settles).
Image inputs unchanged (`a58af3f9…`). `tasks/20261030-090000-chrome-grown-memory` notes where
the reservation moved.

## Proposal for the owner: a module's ABI digest should cover what its executables link

`DOLLY_NAME_ABI_DIGEST`, which every executable linking a module records and the loader checks,
is the SHA-256 of the module's `contracts` (the kernel-to-runtime WAT, such as
`dolly-threads-supervisor-0.wat`), its `process` WAT and its headers
(`scripts/generate-abi-constants.mjs`). A supervisor contract is internal to the runtime and the
kernel, which ship together; an executable compiles against the process WAT and the headers
alone. Hashing the supervisor contract makes any edit to it, a comment included, a seed change
that refuses every threaded and every pty program in the catalog, which is what stopped the first
shape of this fix. The smallest diff: `files("process")` and the headers alone in the digest
(`generate-abi-constants.mjs:50`). It changes the threads and pty digests once, so it needs a
catalog round, and it is the owner's call: the process contract's identity is part of the ABI.

## Lessons

- A browser engine frees a shared memory when the last wrapper goes, and a wrapper in a Worker
  that lives on goes only with that Worker's collection: ownership of a memory must follow the
  Worker whose end should free it. The collector cannot be steered into determinism (c53115b6
  left one to three dead processes); moving the gate into the process Worker made it a non-issue.
- A Worker ended by `terminate()` may still be inside a bulk copy for a moment, and termination
  has no completion event: a shared buffer it writes into must be sealed (a word the supervisor
  takes before it frees) rather than freed after a delay.
- A tree serves its `src/` live to every browser it starts, test servers and image builds alike:
  an edited supervisor meets whatever kernel `dist/` holds. A "before" measurement needs the old
  sources back in the tree, and a kernel rebuild must wait for a build in that tree to end. A
  narrowed `DOLLY_BUILD_IMAGES` build also narrows `dist/dolly-images.mjs` and `dist/static`;
  after a failed one, the first three phases of `npm run image` restore the catalog without
  building.
- The harness refuses a stale image; with a new seed every image a test opens is stale. Start the
  closure build before anything else: the core closure took 20 minutes in a 6 GB slot.
- A copy of a request taken after the call ran is a copy of whatever the call left: when the
  retry of a deferred call needs the request, the rule belongs where the request is consumed
  (the handler writes nothing until it answers), not in a cache beside it. The one-thread
  memory fixture passed; the threads, pty and process tests found it within the hour.
- Firefox drops a message on a `MessagePort` whose sender closes the port, or ends, before the
  receiver has started; Chrome delivers it. Anything handed over a port needs the receiver's
  acknowledgement before the sender lets go: a bare page settled it in ten minutes where the
  full test had only said "not provided". The process module cannot
name it: its imports are checked to be `env.memory` and `dolly_process_0.call` alone, and
`host/dso/process.mjs` builds a DSO's import object from the process's own memory. The security
perimeter is unchanged (AGENTS.md: total compromise of the in-Wasm userspace is assumed).
