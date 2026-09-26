# Add a generic thread substrate to Dolly

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: architecture,runtime,abi,performance

User requested investigation of a generic interface for real Dolly threads.
Box3D is the first consumer; this must also support ordinary C/C++ libraries and
later language runtimes. Production images remain unchanged. The branch selects
four workers for the world; canonical image verification passed in both browsers.
Prerequisite: 20260926-092542-codex-host-modules defines headers, client libraries
and versioned host-provider requirements. Implement threads through that system.
Blockwalker's 20 Hz controller choice and unfinished Lua migration remain in
20260923-211500-codex-01. Keep the existing image44 preview recoverable.

Existing foundation and blockers:

- Each process already imports its own shared memory64 object. Additional
  threads can share that same process memory without sharing another process's
  memory or the kernel's memory. See `abi/dolly-process-0.wat`.
- `src/compiler.cpp` already enables atomics/bulk-memory and links shared memory,
  but accepts `-pthread` without enabling thread support. Its `--threads=1`
  linker option controls LLD itself; it is not the game's runtime worker count.
- `src/process/pthread-stubs.c` supplies serialized stubs. The libc adapter
  makes gettid equal getpid and has no real per-thread initialization. The
  existing CRT initializes main TLS and constructors, not child-thread startup.
- Supervisor state has one Worker/control mailbox and one deferred syscall per
  PID (`src/process-supervisor.mjs`). Thread B must be able to write a pipe while
  thread A is blocked reading it; a process-wide syscall lock cannot cover waits.
- Kernel HTTP request-body staging is one mutable buffer per PID. Concurrent
  body uploads need separate staging ownership, preferably per calling thread,
  while requests retain the same process policy and aggregate broker quota.
- DSO/FFI tables and loader state currently belong to one JS Worker. Ordinary
  WebAssembly tables cannot simply be sent to another Worker as shared tables.
- `src/gamedev/box3d-platform.c` uses dummy mutex/semaphore/thread operations;
  Blockwalker selects workerCount=1. Raising the count alone would be incorrect.

Proposed execution model:

One PID owns one shared memory, filesystem descriptors, cwd, environment, network
policy and lifetime. Each TID gets a Worker, a module instance, private stack/TLS,
its own syscall acknowledgement and its own pending operation. Program heap,
thread records and synchronization state remain in Wasm memory. The supervisor
retains only browser resources, admission state and validated associations.
Kernel dispatch remains serial; only application Wasm runs in parallel.

Start with a separately versioned thread extension of the existing process
contract. Keep the base two imports (memory and dolly_process_0.call) and old
processes/images valid. Put extension packet layouts in a separate header and
bind their digest to an assembled WAT contract/custom-section stamp; do not
change the base header's digest merely to add the extension. Assign operation
numbers from an audited unused range when the contract is implemented.

The child entry's proposed exact type is:

```wat
(func (export "dolly_thread_start") (param $tid i32) (param $arg i64)
  (result i64) (unreachable)) ;; contract schema, not executable startup
```

The argument and return value are opaque 64-bit values. A libc trampoline can
interpret the argument as the address of its own start record, but neither the
browser nor the kernel interprets a pthread structure or dereferences that
value. This is an explicit scalar-cookie addition to the packet convention;
it is not a host pointer or a syscall request-buffer span.

All packets use fixed-width little-endian fields and exact byte sizes:

| Operation | Request | Response / behavior |
| --- | --- | --- |
| THREAD_SPAWN | u64 argument | u32 tid, u32 zero; child may run before return |
| THREAD_SELF | empty | u32 tid, u32 zero |
| THREAD_EXIT | u64 result | does not return; exits only the caller |
| THREAD_WAIT | u32 tid, u32 flags | u64 result, then reaps the thread |

Keep the existing call result convention: response byte count or negative errno.
Only WAIT_NONBLOCK is initially defined. Reject unknown flags, self-wait and
multiple concurrent waiters; a nonblocking wait on a live thread returns EAGAIN.
Use positive signed-32-bit-compatible TIDs, allocated in kernel memory. Bind
PID/TID and generation to the actual Worker context; never trust a message's
claimed identity. Reuse must not let an old completion match a new thread.

WAIT completes only after the Worker can no longer execute guest code. This
makes it safe for the runtime to reclaim that thread's stack/TLS. Returning
from the entry is equivalent to THREAD_EXIT(returned_value). pthread_join and
pthread_detach are library policy above these operations; detached allocations
need a bounded deferred-reaping path, with reuse only after confirmed retirement.
Do not publish detach as supported until that reclamation path is verified.

Mutexes, condition variables, semaphores, once and barriers belong in libc,
using Wasm atomics and memory.atomic.wait32/notify. Do not add a browser call for
each lock or Box3D job. A long-lived pool belongs in the application/library;
start with Box3D's own pool, not a second Dolly task scheduler.

Startup and lifecycle requirements:

- A stackless Wasm trampoline must establish the child stack before any C
  prologue, then initialize its TLS and enter the library's thread start routine.
  TLS layout belongs to the toolchain/runtime, not the stable thread ABI.
- Link shared data with guarded, once-only initialization. Never rerun main,
  global constructors or main TLS initialization on a child. Verify memory64
  TLS exports/types and static function-table indices in the actual compiler.
- Supply a threaded libc/allocator/stdio build with real locks, distinct errno
  and correct gettid; remove reliance on stub symbols in thread-enabled builds.
  Audit process adapters, shared libc scratch state, mmap, signals and memory
  growth. Refresh JS views after growth; stacks themselves remain fixed regions.
- Each thread has an independent syscall exchange, keyed by PID/TID/sequence.
  Preserve serial FD-offset updates and common cwd/descriptor ownership.
  Multi-call HTTP staging cannot be protected by serial dispatch alone.
- Normal thread return ends one thread. exit/_exit/abort or a trap in any thread
  ends the entire process; forcibly killing one thread while continuing its
  siblings could strand allocator or application locks. Last-thread exit ends
  the process. Retire all its Workers before reclaiming shared memory or
  reporting process completion; shell/kernel and unrelated processes survive.
- Initial signal delivery should have one designated receiver with explicit
  rules for blocked siblings. Do not pretend to support asynchronous pthread
  cancellation or thread-directed signals before their semantics are implemented.
- Thread creation can only instantiate the already admitted program with its
  existing memory and policy. No guest-selected Worker URL, new browser imports,
  ambient fetch, host filesystem or native subprocess. Enforce worker quotas
  independently in the trusted supervisor even after complete Wasm compromise.
  The coordinator's event loop must remain available while a parent waits.
- First support statically linked thread-enabled processes. Explicitly reject
  DSO loading and runtime-generated FFI closures in that profile until table,
  TLS and loader-state synchronization has a defined protocol. Existing serial
  DSO/FFI programs keep their current contract. This is an initial limitation,
  not a claim that arbitrary pthread-using packages will immediately work.

Implementation and verification order:

1. Typed optional contract, startup trampoline and thread retirement. In Chrome
   and Firefox prove shared counter/barrier, separate stacks/TLS/errno, one-time
   constructors, spawn-then-immediate-join, capacity failure and stack reuse.
2. Threaded libc and independent syscalls: one blocked reader plus a writing
   sibling, common FD offsets/cwd, concurrent HTTP body staging and cancellation,
   heap growth under contention, detach cleanup, process exit and forced kill.
   Keep exact ABI/import allowlists and host resource quotas covered by real
   browser tests. Update `docs/browser-boundary.md` when implementation lands.
3. Compile an ordinary pthread C example and C++ std::thread example inside
   Dolly. Then replace Box3D's dummy platform calls with pthread/semaphore calls,
   using upstream POSIX code where target support allows. No game-specific host API.
4. Compare 1/2/4 persistent workers on the same saved world, with controllers at
   20 Hz and physics still 60 Hz/eight substeps. Record solver time, controller
   time, rendered FPS, startup cost and memory, plus poses, deliveries and errors.
   Parallel Lua controllers are a separate change: they need immutable sensor
   inputs and deterministic command/radio commits, not concurrent writes to world.

The earlier pre-20-Hz profile spent about 19% of frame time in the solver. If
that split held, even an ideal fourfold solver speedup would increase overall
FPS by only about 17%. Re-measure the current split; threads are useful generic
infrastructure but not a guarantee of 60 FPS by themselves.

September 26 browser feasibility probe: `build/dolly-threads-investigation/`.
Both Chrome and Firefox ran two Workers with the same shared memory64, completed
800,000 Wasm atomic increments exactly, retained a sentinel and returned distinct
instance-local global values. Source is `shared-memory64.wat`; results are
`chrome-proof.txt` and `firefox-proof.txt`. WAT was assembled with the repository's
pinned ABI toolchain. This proves browser primitives, not Dolly pthreads, TLS,
constructor safety, true speedup or the proposed lifecycle contract. No production
thread ABI/runtime changes or deployment were made by this investigation.

References:

- [WASI threads design](https://github.com/WebAssembly/wasi-threads): useful
  instance-per-thread/opaque-argument precedent, explicitly marked legacy now;
  do not adopt its wasm32 ABI or wait on future shared-everything support.
- [WebAssembly linking conventions](https://github.com/WebAssembly/tool-conventions/blob/main/Linking.md):
  guarded shared-memory initialization, passive data segments and TLS. Its
  illustrated i32 TLS types need verification for Dolly's memory64 target.
- [Emscripten pthreads](https://emscripten.org/docs/porting/pthreads.html):
  Worker/event-loop constraints and upstream libc integration considerations.

Implementation progress, September 26 (not a completion claim):

- Optional threads@0 provider, typed child/supervisor contracts, separate ABI
  stamp and 144–147 process operations are implemented. Base process.h/digest
  and outer imports are unchanged. Each Worker has its own syscall/deferred
  state; thread IDs/results and HTTP staging live in kernel Wasm.
- Chrome and Firefox pass the freestanding substrate exercise: 15 concurrent
  children, exact atomic counts, distinct stacks/TLS, constructor/sentinel
  preservation, nonblocking waits, quota refusal, immediate joins/stack reuse,
  blocked pipe reader, memory growth, different simultaneous >1 MiB POST bodies,
  child trap/process exit and shell recovery. Evidence:
  build/threads-substrate-{chrome,firefox}/proof.json and matching .log files.
- cc -pthread and c++ -pthread now compile ordinary programs inside Dolly using
  a disposable SDK overlay. Mutex/barrier/semaphore/once/TLS/errno/TSD/allocator
  checks and std::thread/condition-variable/exception/TLS-destructor checks pass
  both browsers. Compiler evidence: build/threads-compiler-{chrome,firefox}/.
  Expanded Chrome and Firefox runs also pass 300 detached threads with bounded
  heap growth and C11 threads.
- Adapter uses upstream musl synchronization unchanged, direct Wasm atomic
  wait/notify, a stackless child trampoline and real MT libc/allocator. DSO/FFI,
  asynchronous cancellation, nonzero protected-stack guards and directed thread
  signals are explicitly unsupported. Serial process/DSO support is retained.
- Five targeted artifact checks pass in build/threads-abi-check.log, including
  exact typed supervisor exports and derived Emscripten exports. Both browsers
  also reject incompatible/duplicate thread stamps, missing child entry exports
  and a disabled provider. SIGTERM interrupts a main-thread join, runs its handler
  on the main TID and resumes the join. Multiple raw waiters, concurrent mmap,
  shared cwd/descriptor offsets, robust mutex owner-death recovery, interruption
  of two busy siblings, and the global 64-Worker cap/reclamation pass both browsers.

The SDK overlay (build/threads-overlay.tar) is disposable: it installs the new
seed compiler and threaded target libraries into an existing system sandbox;
ordinary C/C++ test programs compile there. Canonical build scripts now prepare
that target. The full native seed build now passes; its 13-image Blockwalker
dependency build is running. Helpers:
build/threads-{kernel,compiler,toolchain,substrate,pthread}-build.sh and
build/threads-overlay.py. No preview, commit or deployment contains this work.
The normal-image verification and local preview are recorded below. Neither
frozen earlier preview contains this work.

Serial core-browser regression passes Chrome and Firefox: ABI admission, C/C++,
filesystem, dynamic libraries, rg/fd, HTTP and foreground interruption. Evidence:
`build/threads-core-browser.log`.

Box3D integration probe (September 26): its unchanged upstream timer.c now links
through real pthreads/semaphores in the private SIMD library. All Box3D/game C
was compiled inside Dolly using the SDK overlay. One/two/four-worker runs in
Chrome each advance the same 134-object Lua save by 1,800 physics steps; all six
complete output saves, including poses and controller memories, are identical.
Paired 1/2/4/4/2/1 means: simulation 14,253/13,357/13,138 ms; physics
3,234/2,366/2,019 ms. Four workers reduce physics time 37.6% and total simulation
time 7.8%; this is not a rendered-FPS claim. Evidence and reproduction harnesses:
`build/blockwalker-threads/chrome/comparison.json`, `probe-browser.mjs`,
`physics.c`, `compare.mjs`. Browser FPS and Firefox comparisons follow below.

The probe exposed Emscripten sched_yield's browser event-queue dependency.
The threaded adapter explicitly returns ENOTSUP for this unavailable scheduling
hint; upstream Box3D ignores that hint's return and its atomic scheduler remains
unchanged. Interrupted raw waits now release their waiter claim when that thread
makes a different call; the expanded signal test passes both browsers.

Chrome render-loop samples (1/2/4/4/2/1, 15 s warmup +15 s measured) are
75.4/91.4/78.7/74.6/72.2/67.2 FPS with no program faults or lost characters.
Variation prevents a reliable rendered-FPS uplift claim; p95 frame intervals
remain 32 ms despite all averages exceeding 60. These count submitted game
frames, not distinct physical-monitor presentations. Evidence:
`build/blockwalker-threads/render-chrome/proof.json`.

Firefox repeats the same complete-save equality across all six physics runs.
Its 1/2/4 means are simulation 13,714/12,884/12,508 ms and physics
3,674/2,817/2,452 ms (four workers: 33.3% less physics time, 8.8% less total).
Evidence: `build/blockwalker-threads/firefox/comparison.json`.

The canonical seed rebuild passes (`build/threads-native-build.log`), followed
by 282 source tests and five targeted exact ABI checks. Runtime ID:
`d9dee7375fb5ec91f293a97359d2e2f5a64bbb9a8e4fc7e15c848eb99a995299`;
image-build ID: `8affcfc8ac0fe1dff92eae8d4f017a539a933dc55e1dda4b9e37cc247a922530`.
`build/threads-blockwalker-image.log` records the completed canonical rebuild.
The permanent compiler check now uses the normal SDK by default; `--overlay`
is only for development against an older image.

Firefox render-loop samples are 191.0/202.9/208.6/207.0/203.9/191.7 FPS for
1/2/4/4/2/1 workers. Four-worker mean is 8.6% higher than one-worker mean;
p95 frame interval is 18 ms versus 19 ms. These remain game frame submissions,
not monitor refreshes. All simulation steps advance at real time and the same
134 objects survive without controller faults. Chrome remains noisy. Evidence:
`build/blockwalker-threads/render-{chrome,firefox}/comparison.json`.

Completed September 26 on the uncommitted branch:

- Full 13-image build passed in 578.6 s; final Blockwalker build took 42.4 s.
  Snapshot: 253,529,766 bytes,
  `47c8b72bcb56826f34810000f7de7eaf8499f81e9c47c04b1d5e8ec838f61d2d`.
  The Dollyfile dependency declares threads@0 and the bundled executable has
  its thread ABI stamp/entry. No SDK overlay is needed.
- Chrome/Firefox pass ordinary in-image C/C++ compilation, both thread ABI and
  quota/lifecycle suites, and serial core regressions. Logs:
  `build/threads-normal-{compiler,substrate}-{chrome,firefox}.log`,
  `build/threads-normal-core.log`.
- Normal game startup, fresh 81-object roster, 134-object mature restore,
  real-time simulation and clean exit pass. Thirty-second mature-world samples
  have no controller errors, deaths or lost characters. Chrome: 93.6/103.5 FPS;
  Firefox: 214.0/215.6 FPS. These are submitted frames, not monitor presentations
  or a controlled improvement over image44. Normal-image evidence and screenshots:
  `build/blockwalker-threads/image-{chrome,firefox}/`.
- Empty Box3D world heap growth for 1/2/4 workers is
  174,160/2,418,768/6,887,504 bytes in both browsers: four workers add about
  6.4 MiB of guest heap over one. The initial 16 MiB linear memory fits all three;
  browser Worker overhead is additional and not measured. Mature-world startup
  averages are 286/267/270 ms in Chrome and 292/287/288 ms in Firefox.
- Both browsers pass actual named-session save/reload, blueprint/world recovery,
  typing isolation, fullscreen, quick-save and preserving the last good snapshot
  after failed storage. Logs: `build/threads-game-session-{chrome,firefox}.log`.
- Local preview: http://127.0.0.1:9097/blockwalker/ using
  `dolly-threads-preview.service` and this live worktree. Frozen 9098/9099 services
  remain unchanged. No commit, push or production deployment.

The generic threading checkpoint is complete. Lua migration/test reconciliation
remains tracked separately; parallel controllers are not part of this change.
