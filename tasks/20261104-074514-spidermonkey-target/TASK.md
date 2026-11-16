# SpiderMonkey builds without claiming __wasi__

- STATUS: OPEN
- PRIORITY: 90
- TAGS: port,0ad,investigation

## State (2026-11-16, ports audit)

The recipe still exports `CC='cc -D__wasi__'` (`Dollyfile-spidermonkey:52`) and configures
`--host=wasm64-unknown-wasi` (`:55`), twelve days after the owner's decision, and the task is in
no release's scope. Step 1's table is below (by reading the pinned tree; nothing built); Step 2
is left. The build also still carries
`toolchain/spidermonkey.patch:251` ("Dolly has no exec": the linker wrapper runs the linker as a
child); Dolly has exec since 2026-10-23, and the hunk stays only while Dolly's Python lacks
`os.execvp` (`tasks/20261116-140352-ports-01`). `0ad-spidermonkey-browser.mjs` passed in the 0.1.7
round (`work/round1113/build/round-1117.log`, gpu stage).

## Step 1: what the claim selects (2026-11-16, ports audit)

Read in the pinned `mozjs-128.13.0` as prepared (`work/round1113/build/generated/zero-ad-build-*/`):
107 `__wasi__` lines outside `js/src/shell` and `js/src/jsapi-tests`, which the build does not
compile (`--disable-js-shell`, `--disable-tests`), listed with file and line in
`work/audit-1116-evidence/ports/spidermonkey-wasi-lines.txt`, and the build files' `OS_ARCH ==
"WASI"` and `target.os == "WASI"` choices.

| What it selects | Where | For Dolly |
| --- | --- | --- |
| No threads: no-op mutexes and condition variables, no-op threads and CPU count, thread-locals as globals ("There are no threads on WASI"), `WasiAtomic.h` in place of `<atomic>`, no helper threads | `mozglue/misc/moz.build:132-137`, `PlatformMutex.h:15,51`, `PlatformConditionVariable.h:17,57`, `MutexPlatformData_noop.h:10`, `js/src/moz.build:505-510`, `threading/ConditionVariable.h:15`, `mfbt/ThreadLocal.h:123`, `mfbt/moz.build:153`, `Atomics.h:21`, `AtomicBitfields.h:18`, `RefCounted.h:21,173`, `TimeStamp_posix.cpp:53,65`, `vm/Runtime.cpp:68` (`gCanUseExtraThreads = false`), `ProfilerUtils.cpp:15` | false: the process links `-pthread` and has `threads@0` (`spidermonkey.patch`'s `old-configure` hunk says so); safe only while SpiderMonkey runs on one thread, which 0 A.D.'s serial task manager gives it (`engine.patch:887`, no workers) |
| Memory by `posix_memalign`, committed: no `mmap` reservation, `mprotect` or poisoning | `gc/Memory.cpp:30-198`, `vm/ArrayBufferObject.cpp:21-250`, `vm/SharedArrayObject.cpp:244`, `vm/TypedArrayObject.cpp:24`, `mfbt/Poison.cpp:19-108`, `TaggedAnonymousMemory.h:36,70`, `MmapFaultHandler.*` | true: Dolly refuses `MAP_FIXED`, commits every mapping and cannot protect pages (`demos/ocaml/ocaml-dolly.patch`, Wine's patch) |
| Recursion counted, not measured by the stack pointer | `jsapi.cpp:1530`, `frontend/FrontendContext.cpp:54,225`, `FrontendContext.h:204`, `vm/JSContext.cpp:1407`, `util/NativeStack.cpp:13,120` | true: the browser's stack cannot be measured either (`docs/browser-stack.md`) |
| No JIT executable memory, no wasm signal handlers | `jit/ProcessExecutableMemory.cpp`, `wasm/WasmSignalHandlers.cpp:37`, `WasmBCMemory.cpp`, `WasmCompile.cpp`, `WasmDebugFrame.h`, `vm/Runtime.cpp:156`, `zydis` | true, and moot under `--disable-jit` |
| libc and platform details: no `tzset` before `localtime_r`, `arc4random`, WASI preopen path normalization, no assertion stack dumps, a `size_t` JSON overload, no interrupt check in the portable baseline interpreter (not enabled here) | `vm/DateTime.cpp:55`, `mfbt/RandomNum.cpp:32`, `util/CompleteFile.cpp:13-131`, `mfbt/Assertions.h:13-223`, `vm/JSONPrinter.cpp:203`, `JSONPrinter.h:56`, `vm/PortableBaselineInterpret.cpp:3149,3317`, `builtin/TestingFunctions.cpp:449,8165` | mixed: Dolly's libc has `tzset` (false); path normalization is WASI's own (false, harmless); the rest neutral |
| Build system: target tables, clang only, no hardening flags, no shell | `python/mozbuild/mozbuild/configure/constants.py:45,60,151`, `build/moz.configure/init.configure:549,940`, `toolchain.configure:1012,1534,2673`, `js/moz.configure:1249` | build-only |

So Step 2's honest build keeps WASI's memory, stack and no-JIT choices and takes the POSIX
threading paths (pthreads, `<atomic>`, real thread-locals) with helper threads still off at run
time; whether that builds and passes `spidermonkey-check` is not tried.

## Found

`demos/zero-ad/Dollyfile-spidermonkey:52-56` exports `CC='cc -D__wasi__'` and configures
`--host=wasm64-unknown-wasi --target=wasm64-unknown-wasi`, because mozbuild knows no Dolly (the
compiler's own target is `wasm64-unknown-dolly`). That is a detection claim of the kind the porting
rules forbid for Linux and AMD64: SpiderMonkey compiles its WASI paths (a wasi-libc without
threads) on a musl libc with threads. zero-ad-engine's `spidermonkey-check` passes today, so nothing
is known to break (`tasks/20261102-133232-recipes-apps`, F11).

Decided 2026-11-04 (`tasks/20261102-133353-owner-decisions`): the claim goes; what it selects is
measured first. Step 1: list every `__wasi__` conditional the build compiles (`js/src`, `mfbt`,
`mozglue`, `memory`, `build`, `python/mozbuild` of the pinned source) and classify each: true for
Dolly too (a Wasm target without JIT or signals), false for Dolly (threads, libc details, the
filesystem), or build-system only (target tables, configure checks). Step 2, from that table, the
smallest honest build: a `dolly` OS in mozbuild's target tables and `js/moz.configure`, with the
branches the table marks true selected by what they test rather than by `__wasi__` where a
feature test exists, and nothing speculative; carried as the demo's source patch
(`demos/zero-ad/prepare-sources.sh`) and recorded in its README. No report upstream.

Done when: the table is in this task; the recipe sets no `-D__wasi__` and names the real target;
`spidermonkey-check` prints "wasm64 realms, GC, callbacks and clone passed" and
`demos/zero-ad/test/0ad-spidermonkey-browser.mjs` passes in Chromium and Firefox; zero-ad-engine
builds in a round. If the table shows every selected branch is true for Dolly and the patch would
be a table entry alone, that entry is still made: the target's name is the claim.
