# `runtime.h` beside libc, and the twins and operation numbers of the process contract: the investigation

Read on `work/rust` (`integrate/round-1013`, head `1d1f6663`, 2026-10-14); history shared with `main`; tasks at `tasks/`. Line numbers of `src/`, `host/`, `abi/`, `include/`, `docs/`, `scripts/`, `config/`, `demos/` and `test/` files are of this tree unless a commit is named. Nothing was built or run; every number comes from `git`, `grep` and the files. Sibling investigations are cited where they already hold the history: `tasks/20261013-144241-spawn-interactive/investigation.md` (the roles and `3f875924`), `tasks/20261013-144241-line-discipline/investigation.md` (the terminal mode bits), `tasks/20261013-144241-test-surface/investigation.md` (`dolly_terminal_publish_result`), `tasks/20261013-144241-module-sdks/investigation.md` (what the seed packs), `tasks/20261013-144241-slop-and-run/investigation.md` (why Slop is compiled by `RUN`).

One agent wrote this report in two parts; the other part is [twins and operation numbers](../20261013-144241-contract-twins/investigation.md).

# Part A: `runtime.h` beside libc

## Summary (findings, no advice)

1. `runtime.h` is older than the libc. In the first commit (`0d224977`, 2026-08-29) it declared 29 functions and was the target's libc overlay: the compiler rewrote libc names onto them with `-D exit=dolly_exit`, `-D fclose=dolly_fclose`, `-D system=dolly_system` ... (`src/compiler.cpp:264-275` at that commit; `-D isatty=dolly_isatty` at `aa0e63c0:285`). Commands ran in the kernel's memory and the kernel implemented the functions (`src/dolly.c` at `0d224977`: `dolly_spawn` :842, `dolly_wait` :916, `dolly_waitpid` :565, `dolly_kill` :577).
2. Private processes (`b95459ce`, 2026-09-05) brought Emscripten's musl and a syscall adapter, deleted the `-D` mapping, and removed ten declarations (`fork`, `exec*`, `setsid`, `umask`, ...). The direction reversed: since `d5badb25` and `1f2954b6` (2026-09-06/07) libc's `isatty`, `wait4`, `kill`, `tcgetattr`/`tcsetattr`, `posix_spawn`, `system` and `popen` are implemented by calling the `dolly_` functions (`src/process/libc-adapter.c:51,93,100,1252,1285`; `src/process/runtime-adapter.c:537,569,618`), not the other way round.
3. Two removals were by the criterion "callers": `26277ef5` (2026-09-30, "dead dolly_* socket, system, popen, getpass, alarm and fclose wrappers") and `f21825b1` (2026-10-01, "Drop process API that only tests or copies used": `dolly_spawn_env`, `dolly_getrandom`, `dolly_interrupt_checkpoint`, `dolly_exit`). The header has had today's 19 names since 2026-10-06 (`e75f6b7b`).
4. Four of the names are also the kernel's own functions: `dolly_write_file` (`src/dolly.c:138`, exported for the page's boot files, `abi/dolly-image-0.wat:48`), `dolly_terminal_publish_result` (`src/dolly.c:44`), `dolly_terminal_columns`/`rows` (`host/display/kernel.c:138-143`; declared `src/process-kernel.h:97-98,125`). One header, two implementations: the kernel's and the process adapter's packet wrappers.
5. `posix_spawn` did not exist until `9d35db82` (2026-10-01, for GNU Make), after every `dolly_spawn*` caller in the core was written (Slop's `dolly_spawn_mapped`: `f70583ce`, 2026-09-30). As implemented it always inherits all non-CLOEXEC descriptors (`runtime-adapter.c:538`), has no deadline (`-1`, same line), no role flags, and honours only `adddup2` and `addchdir` actions (`:493`). Descriptor inheritance `NONE`/`STDIO`, the deadline and the foreground/interactive role have no POSIX spelling; `runtime.h` is their only C declaration as functions (`process.h` has the packet).
6. Libc is present for every compile, the engine's and Slop's included: `cc` links `libdolly-process.a` whole (`src/compiler.cpp:891-893`); `bootstrap.c:38-51` compiles the engine with that compiler; `Dollyfile-system-build:109-112` requires `libc` and `runtime` before `RUN`-compiling Slop. "No libc yet" is not why those two call `dolly_` functions; the record gives no reason at all.
7. Counted (section 3): production callers outside `src/process/` are `src/slop.c`, `src/dollyfile.c`, `src/commands/amy.c`, `src/commands/foreground.c`, `src/commands/run-program.h` (so `timeout`, `time`, `env`, `xargs`), six demo C files, two upstream patches (`config/git-dolly.patch`, `config/samurai-dolly.patch`), and the kernel (point 4). No production caller outside `src/process/`: `dolly_waitpid`, `dolly_kill`, `dolly_spawn_env_timeout` (a probe only). One production caller: `dolly_spawn_timeout`, `dolly_isatty`, `dolly_terminal_rows`, `dolly_terminal_publish_result`, `dolly_exit_signal`.
8. The reflection's claims: "19 functions" true; "duplicate libc" true of the spelling and false of the code (one body each, libc's on top; `dolly_write_file` is the one built on libc); "six spawn wrappers of one call" true, and `posix_spawn`, `system`, `popen` are three more; "callers: seven demo files, Slop, dollyfile.c, amy.c" leaves out `foreground`, `run-program.h` and its four commands, the two patches and the kernel. The audit's "`dolly_spawn_foreground` only `demos/codex/launch.c`" is false (`src/commands/foreground.c:21`).
9. A `runtime.h` change rebuilds the seed (`runtime-adapter.c` is in `libdolly-process.a`, `scripts/build.sh:168-181`; the header is in the seed sysroot, `host/runtime/module.json:13`, `toolchain/CMakeLists.txt:87`) and, through the root recipe's SHA pin (`Dollyfile-system-build:10`), every image. It does not change the `dolly.process` digest, which hashes `process.h` alone (`abi/dolly-process-0.wat:2-4`, `scripts/build.sh:97-99`).
10. No owner statement on `runtime.h`'s shape exists. The nearest: the owner's "Subprocesses: undecided, leaning toward a module" (2026-10-06, `tasks/20261002-073000-runtime-process-modules/TASK.md`), under which `runtime.h`'s spawn functions were measured as a module's client (43 of its 120 lines then; `tasks/20261005-222449-spawn-users/TASK.md`), and the decision was deferred "when single-program images exist in number".

---

## 1. History

### 1.1 The prototype: the header was the libc (`0d224977`, 2026-08-29)

`include/dolly/runtime.h` at that commit (91 lines) declared: `dolly_spawn`, `dolly_spawn_env`, `dolly_wait`, `dolly_write_file`, `dolly_terminal_publish_result`, `dolly_exit`, `dolly_fclose`, `dolly_system`, `dolly_popen`, `dolly_pclose`, `dolly_atexit`, `dolly_chmod`, `dolly_umask`, `dolly_getpass`, `dolly_getrandom`, `dolly_fork`, `dolly_execve`, `dolly_execvp`, `dolly_execl`, `dolly_execlp`, `dolly_waitpid`, `dolly_wait_any`, `dolly_kill`, `dolly_setsid`, `dolly_getpgid`, `dolly_tcgetpgrp`, `dolly_alarm`, `dolly_sleep`, `dolly__exit`. Its comments:

> "Starts a filesystem-resident Dolly command with explicitly routed standard descriptors. Version 0 runs it synchronously and returns a positive pid once its exit status is available."
> "Mutates the runtime-owned WasmFS directly. Dynamic language runtimes use this narrow call instead of retaining executable-local stdio state around a filesystem operation." (`dolly_write_file`)
> "Terminates only the currently executing Dolly command. The compiler maps ordinary C exit() calls to this lifecycle operation." (`dolly_exit`)
> "Dolly has no ambient shell or host subprocesses. These preserve the libc call shapes while failing explicitly inside the Wasm userspace." (`system`/`popen`/`pclose`)
> "Version 0 has no concurrent native-style process model. These calls are explicit in-Wasm failures; they never delegate to the browser or host." (`fork`, `exec*`, `waitpid`, `kill`, ...)

The compiler made libc names mean these: `src/compiler.cpp:264-275` at `0d224977` passes `-D main=dolly_main`, `-D exit=dolly_exit`, `-D fclose=dolly_fclose`, `-D system=dolly_system`, `-D popen=dolly_popen`, `-D pclose=dolly_pclose`, `-D __assert_fail=dolly_assert_fail`, `-D atexit=dolly_atexit`, `-D chmod=dolly_chmod`, `-D umask=dolly_umask`, `-D getpass=dolly_getpass`, `-D getrandom=dolly_getrandom`. The functions lived in the kernel (`src/dolly.c` at `0d224977`: `dolly_terminal_publish_result` :341, `dolly_waitpid` :565, `dolly_kill` :577, `dolly_write_file` :786, `dolly_spawn` :842, `dolly_wait` :916, `dolly_spawn_env` :930). Commands were modules loaded into the kernel's memory (line-discipline investigation, 1.1).

### 1.2 Terminal and interrupt functions (`aa0e63c0` 2026-08-31, `9e013dd9` 2026-08-31, `c4dbe3ad` 2026-09-03)

`aa0e63c0` added `dolly_terminal_read_raw_timeout`, `dolly_terminal_columns`, `dolly_terminal_rows` ("Runtime event-loop support ... These read Ghostty-encoded bytes and dimensions from the in-Wasm display mailbox"), `dolly_interrupt_poll` ("Ordinary programs normally rely on compiler-inserted checkpoints rather than calling this"), `dolly_interrupt_checkpoint` ("Compiler-inserted cancellation safepoint"), and `dolly_isatty`:

> "Dolly terminals are WasmFS character devices whose browser-free line and raw disciplines live in the runtime. Emscripten's generic isatty probes a native-style ioctl that those devices intentionally do not expose, so the target uses this descriptor-kind check instead."

with `-D isatty=dolly_isatty` in the compiler (`aa0e63c0:src/compiler.cpp:285`). Janis wrapped it as `Dolly.isatty` the same day (`aa0e63c0:src/runtimes/quickjs-main.c:634-641`). `9e013dd9` added `dolly_spawn_timeout`. `c4dbe3ad` added `dolly_terminal_mode_get`/`set` and the `DOLLY_TERMINAL_*` bits (the bits' own history is the line-discipline investigation, 1.1: "Small terminal discipline contract. Language/libc adapters translate their own termios layouts above these two stable semantic bits").

### 1.3 Private processes reverse the direction (`b95459ce` 2026-09-05 to `1f2954b6` 2026-09-07)

`b95459ce` ("Checkpoint private wasm64 processes") removed the `-D` mapping from the compiler (`git log -S'isatty=dolly_isatty' -- src/compiler.cpp`: added `aa0e63c0`, removed `b95459ce`) and ten declarations: `dolly__exit`, `dolly_chmod`, `dolly_execl`, `dolly_execlp`, `dolly_execve`'s siblings, `dolly_fork`, `dolly_getpgid`, `dolly_setsid`, `dolly_sleep`, `dolly_tcgetpgrp`, `dolly_umask`, `dolly_wait_any`. It added `dolly_spawn_env_timeout`. The functions moved to the process side (`src/process/runtime-adapter.c`) as wrappers over `dolly_process_call`. Then, each without a message body:

- `d5badb25` (2026-09-06): `dolly_spawn_env_cwd`, `dolly_exit_signal`; the adapter's `__syscall_wait4 -> dolly_waitpid` and `kill -> dolly_kill` (`git log -S`).
- `f0ffce09` (2026-09-06): `dolly_spawn_mapped` with descriptor inheritance and mappings.
- `3f875924` (2026-09-06): `dolly_spawn_foreground` (the roles: spawn-interactive investigation 1.3).
- `91a7fa2b` (2026-09-06): `dolly_atexit`, `dolly_execve` removed.
- `1f2954b6` (2026-09-07): `isatty() { return dolly_isatty(); }` in the adapter (`git log -S'return dolly_isatty'`).

From this point libc's functions sit on the `dolly_` ones. The names stayed because the callers had them: Slop, Janis, the commands.

### 1.4 The two caller-criterion removals (2026-09-30, 2026-10-01)

`26277ef5` ("make the process ABI explicit"): "Cleanup: dead dolly_* socket, system, popen, getpass, alarm and fclose wrappers". The deleted comments: "Compatibility spelling used only by the resident kernel display plugin" (`dolly_fclose`), "POSIX-shaped shell helpers execute /bin/slop as another private process" (`dolly_system`/`popen`/`pclose`). libc's `system`, `popen`, `pclose` stayed, in `runtime-adapter.c` (today `:566-668`), calling `dolly_spawn` and `dolly_waitpid`.

`f21825b1` (`tasks/20261001-214000-core-polish`, "every image rebuilds"): "dolly_spawn_env had no caller, dolly_getrandom duplicated getrandom, dolly_interrupt_checkpoint existed for one test fixture under a comment claiming the compiler inserts it, dolly_exit was a test-only masked exit ... The fixtures use _exit; the two demos use getrandom." It also rewrote `dolly_spawn_env_timeout`'s comment, deleting the sentence "Keeping both controls in one spawn operation avoids mutating a parent's environment merely to configure a child."

`ae86e8c0` (2026-10-01) rewrote the terminal comment for ISIG; `5dbcfad9`/`e75f6b7b` (2026-10-06) added and removed `dolly_dl*` with the dso module and rewrote the read comment to "These read the terminal's decoded input bytes and its dimensions." Nineteen names since.

### 1.5 `posix_spawn` (`9d35db82`, 2026-10-01)

"Run GNU Make jobs in parallel through posix_spawn ... The libc adapter implements posix_spawn over the spawn mappings: the inherited non-CLOEXEC set plus adddup2 actions replayed in order. Other file actions, a session, process group or scheduler and a blocked child mask return ENOTSUP." Make's upstream `posix_spawn` path replaced `src/runtimes/make-dolly.c`. Slop had been moved to `dolly_spawn_mapped` the day before (`f70583ce`, 2026-09-30, "Give Slop explicit POSIX pipeline, subshell and variable semantics"); `run-program.h` came `3c43dca1` (2026-09-30, "Share command spawning and fix find, xargs, timeout, diff, patch and curl"). No message or task says why those did not wait for, or move to, `posix_spawn`.

### 1.6 Owner statements that touch the header

- Owner direction 2026-09-30 (`tasks/20260930-090100-owner-direction`): "the product is the modular runtime and the minimal POSIX userspace".
- `AGENTS.md`: "The process contract sits below libc. Its current Emscripten musl adapter is a bootstrap implementation, not the stable interface." `docs/process-model.md:52-54`: "The libc is a bootstrap whose headers test `__dolly__`".
- Owner question 2026-10-02: "I thought subprocesses would be a host module? And the dolly-runtime?" (`tasks/20261002-073000-runtime-process-modules/TASK.md:7-9`). The measurement there: a `process@0` "would move ... `dolly_spawn*`, `dolly_wait*` and `dolly_kill` (60 lines of `runtime.h`)". Owner decisions 2026-10-06: "Subprocesses: undecided, leaning toward a module ... Before deciding, measure: (a) how many catalog executables link the spawn client at all, once it is its own archive member stamped the way `-pthread` stamps `threads@0`".
- `tasks/20261005-222449-spawn-users` (closed 2026-10-07): 43 of 136 executables reach SPAWN; a `spawn@0` would hold "`runtime.h` (120 lines) 43"; recommendation "spawn@0: no ... Decide again when single-program images exist in number"; the owner took the dso recommendation ("I like the dso thing") and the spawn one "is listed for the owner".
- Audit resolutions (owner): executable identity hashes exact bytes of `process.h`, "replicability over rebuild time" (`audit-09`); "a seed or upstream change rebuilds every downstream image; the owner prefers complete replicability over rebuild time" (`audit-51`).

Nothing in any task or commit says what belongs in `runtime.h`.

## 2. What is there today

### 2.1 The nineteen declarations (`include/dolly/runtime.h`)

| # | Function (line) | Operation | libc function and where it is implemented | Direction | What it expresses that the libc call does not |
|---|---|---|---|---|---|
| 1 | `dolly_spawn` (:16) | SPAWN via `spawn_process` (`runtime-adapter.c:142-156`): `INHERIT_FDS_NONE` + three mappings, `environ`, no cwd, no deadline, flags 0 | `posix_spawn` (`:552`), `system` (`:566`), `popen` (`:594`) | libc on top: `system`/`popen` call `dolly_spawn`; `posix_spawn` calls `dolly_spawn_mapped` | `NONE` inheritance (`posix_spawn` is always `ALL`, `:538`) |
| 2 | `dolly_spawn_foreground` (:21) | SPAWN with `FOREGROUND` and optionally `INTERACTIVE` (`:132-140`) | none | — | the roles; no POSIX name |
| 3 | `dolly_spawn_timeout` (:26) | SPAWN with `deadline_nanoseconds` (`:158-163`) | none | — | the kernel deadline (`process.h:529-531`) |
| 4 | `dolly_spawn_env_timeout` (:32) | envp + deadline (`:165-170`) | `posix_spawn` takes envp, no deadline | — | deadline |
| 5 | `dolly_spawn_env_cwd` (:38) | envp + cwd + deadline + three fds (`:172-177`) | `posix_spawn` + `addchdir_np` (`FDOP_CHDIR`, `:503-511`) + `adddup2` | — | `NONE` inheritance, deadline |
| 6 | `dolly_spawn_mapped` (:44) | the full packet minus flags (`:123-130` over static `spawn_mapped` `:34-121`) | `posix_spawn` is built on it (`:537`) | libc on top | inheritance mode, deadline |
| 7 | `dolly_wait` (:52) | WAIT; returns `-errno` and the raw status 0..255 or 128+signal (`:196-203`) | `waitpid`/`wait4` (`libc-adapter.c:91-95` -> `dolly_waitpid`) | — | nothing; a different status encoding (shell-style) |
| 8 | `dolly_write_file` (:55) | none: `open`/`write`/`close` (`:433-449`) | it is built on libc | reverse | nothing; a 17-line convenience. The kernel has its own, different one (`src/dolly.c:138`: validates the path, creates parents) |
| 9 | `dolly_terminal_publish_result` (:59) | TERMINAL/`PUBLISH_RESULT` (`:407-411`) | none | — | the page's result word (test-surface investigation) |
| 10 | `dolly_terminal_read_raw_timeout` (:64) | TERMINAL/`READ` on fd 0 with a deadline (`:352-364`) | `poll` (FD_POLL with deadline) + `read` (FD_READ: a terminal read returns at least one byte and up to the bytes queued, `src/process-kernel.c:1153-1168`; defers without deadline, `EAGAIN` under `O_NONBLOCK`) | — | one call instead of two; the kernel's two paths both end in `dolly_kernel_terminal_read` (`:1155`, `:1521`) |
| 11-12 | `dolly_terminal_columns`/`rows` (:65-66) | TERMINAL/`SIZE` on fd 0, fallback 80/24 (`:366-376`) | `ioctl(TIOCGWINSZ)` issues the same packet itself (`libc-adapter.c:1305-1320`) | parallel | nothing |
| 13-14 | `dolly_terminal_mode_get`/`set` (:82-83) | TERMINAL/`MODE_GET`/`MODE_SET` (`:394-405`) | `tcgetattr`/`tcsetattr` via `ioctl(TCGETS/TCSETS)` (`libc-adapter.c:1250-1288`) call them | libc on top | nothing: the same five bits; `tcsetattr` refuses other termios flags with `EINVAL` (`:1201-1218`) |
| 15 | `dolly_interrupt_poll` (:88) | INTERRUPT_POLL then SIGNAL_ACKNOWLEDGE; returns SIGINT once, `raise`s any other signal (`:413-423`) | none: `sigpending` reads libc's own set (`signal.c:232-236`), never the kernel | — | a cooperative poll from a loop that makes no system call |
| 16 | `dolly_isatty` (:93) | TERMINAL/`ISATTY` (`:378-392`) | `isatty` (`libc-adapter.c:51`) | libc on top | nothing |
| 17 | `dolly_exit_signal` (:96) | EXIT with status 128+n and `signal_number` (`:425-431`) | `raise(n)` with `SIG_DFL` reaches it (`signal.c:108-113`); `raise(SIGKILL)` directly (`:136`) | libc on top | nothing beyond skipping the disposition check |
| 18 | `dolly_waitpid` (:100) | WAIT with `WAIT_NONBLOCK`; POSIX status encoding (`:306-322`) | `waitpid`/`wait4` (`libc-adapter.c:91-95`) | libc on top | nothing |
| 19 | `dolly_kill` (:101) | SIGNAL (`:325-338`) | `kill` (`libc-adapter.c:98-101`; self goes to `raise`) | libc on top | nothing |

Every spawn wrapper, and `posix_spawn`, ends in `spawn_mapped` (`:34-121`), the one SPAWN call site in the libc (confirmed by the executable scan of `20261005-222449-spawn-users`: "`spawn_mapped` ... is the only SPAWN call site").

### 2.2 The same names in the kernel

`src/dolly.c` and `src/process-kernel.c` include `dolly/runtime.h` (grep). The kernel defines, for itself: `dolly_write_file` (`src/dolly.c:138-`, "The Worker's boot files (abi/dolly-image-0.wat, abi/dolly-supervisor-0.wat)", exported `abi/dolly-image-0.wat:48`, called by `host/runtime/boot-files.mjs:26`); `dolly_terminal_publish_result` (`src/dolly.c:44-50`, the mailbox store); `dolly_terminal_columns`/`rows` (`host/display/kernel.c:138-143`, used at `:125,238-239` and by `terminal_packet`, `src/process-kernel.c:1533-1534`). Declared for the kernel in `src/process-kernel.h:97-98,125`.

### 2.3 Where the header sits in the build

- `host/runtime/module.json:13` lists it among the runtime module's five headers; `scripts/build.sh:95-96` copies every manifest header into `build/include/dolly`; `toolchain/CMakeLists.txt:87` preloads that directory into the seed at `/usr/include/dolly`.
- `src/process/runtime-adapter.c:4` includes it and is a member of `libdolly-process.a` (`scripts/build.sh:168-181`), which `cc` always links whole (`src/compiler.cpp:891-893`).
- `Dollyfile-system-build:10` pins it by SHA-256 as `SOURCE`; `:63` `EXPORTS HEADER runtime`; six recipes say `REQUIRES HEADER runtime` (`Dollyfile-system-build:109`, `Dollyfile-system-tools:163`, `demos/javascript/Dollyfile-janis:15`, `demos/cmake/Dollyfile-cmake-build:13`, `demos/python/Dollyfile-python:13`, `demos/codex/Dollyfile-codex:17`).
- The `dolly.process` layout digest hashes `process.h` only (`abi/dolly-process-0.wat:2-4`; `scripts/build.sh:97-99`; `scripts/generate-abi-constants.mjs:54`).

## 3. Who uses it, counted

From `grep -rn` over `.c`, `.h`, `.cpp`, `.js`, `.mjs`, `.patch`, recipes and scripts, excluding `src/process/`, `tasks/`, `docs/`:

| Function | Production callers | Tests and probes |
|---|---|---|
| `dolly_spawn` | `src/dollyfile.c:887`, `src/commands/amy.c:258`, `src/process/bootstrap.c:18` (a command, in `src/process/`), `demos/javascript/quickjs-main.c:1329` (`Dolly.shell` without timeout), `demos/rust/rust-linker.c:91`, `demos/codex/launch.c:76`, `config/samurai-dolly.patch:72`; inside the adapter: the toolchain proxy `:223`, `system` `:569`, `popen` `:618` | fixtures `process-interrupt.c`, `process-lifecycle.c` (5), `upload-race.c`, `process-sigchld.c`, `slop-interrupt.c`, `process-io-stress.c`, `process-signals.c` (7), `threads-quota.c`, `cwd-check.c`, `dollyfile-parser.c` (defines it); inline C in `test/threads-browser.mjs:96`, `test/nena-browser.mjs:45-60`; probes `env-driver.c:27`, `pipe-driver.c` (5) |
| `dolly_spawn_foreground` | `src/commands/foreground.c:21`, `demos/codex/launch.c:75` | `process-lifecycle.c` (6 sites) |
| `dolly_spawn_timeout` | `demos/javascript/quickjs-main.c:1331` | `process-lifecycle.c:280` |
| `dolly_spawn_env_timeout` | none | `src/process/env-driver.c:38` (probe) |
| `dolly_spawn_env_cwd` | `demos/javascript/quickjs-main.c:1143` (`child_process`, timeout `-1` from `demos/javascript/janis.js:1643`), `demos/tmux/osdep-dolly.c:113` | `process-lifecycle.c` (2), `self-exe-check.c:19` |
| `dolly_spawn_mapped` | `src/slop.c:3061`, `src/commands/run-program.h:54` (used by `src/commands/timeout.c:52`, `time.c:26`, `env.c:47`, `xargs.c:161`), `config/git-dolly.patch:96,99`, `demos/python/cpython-process.c:94`, `demos/cmake/libuv/process.c:175` | `process-descriptors.c` (7), `native-spawn.c:21` (a native stand-in), `slop-denied-host.c:5` (weak stub) |
| `dolly_wait` | `foreground.c:28`, `run-program.h:68`, `amy.c:259`, `dollyfile.c:891`, `bootstrap.c:26`, `quickjs-main.c:1335`, `rust-linker.c:93`, `codex/launch.c:79`, `samurai-dolly.patch:74` | fixtures and probes as above |
| `dolly_write_file` | `src/dollyfile.c` (11 sites: :969, :1047, :1195, :1874, :1909, :1916, :1928, :1932, :1969, :2143), `demos/javascript/quickjs-main.c:560` (`Dolly.writeFile`) | `dollyfile-parser.c:28` (stub) |
| `dolly_terminal_publish_result` | `src/slop.c:5269` | `slop-denied-host.c:13` (stub) |
| `dolly_terminal_read_raw_timeout` | `src/slop.c:5010,5012,5018,5021,5050`, `demos/javascript/quickjs-main.c:887` | `terminal-ui.c` (10), inline `test/host-modules-browser.mjs:160`, stub |
| `dolly_terminal_columns` | `src/slop.c:4927`, `quickjs-main.c:962` (+ the kernel's own) | stub |
| `dolly_terminal_rows` | `quickjs-main.c:964` (+ the kernel's own) | — |
| `dolly_terminal_mode_get` | `src/slop.c:5197`, `quickjs-main.c:909` | `terminal-ui.c` (5), inline `demos/neovim/test/neovim-browser.mjs:37`, stub |
| `dolly_terminal_mode_set` | `src/slop.c:5198`, `quickjs-main.c:910` | `terminal-ui.c` (9), inline `host-modules-browser.mjs:160`, stub |
| `dolly_interrupt_poll` | `src/slop.c:197`, `quickjs-main.c:38` | `process-jump.c:115`, stub |
| `dolly_isatty` | `quickjs-main.c:926` (`Dolly.isatty`) | — |
| `dolly_exit_signal` | `quickjs-main.c:1951,1964` | — |
| `dolly_waitpid` | none (the adapter's `system`, `pclose`, `wait4`) | `threads-quota.c:65` |
| `dolly_kill` | none (the adapter's `kill`) | `threads-pthread.c:40` |

Files under `demos/` and `config/` that include `<dolly/runtime.h>`: `demos/cmake/libuv/process.c`, `demos/codex/launch.c`, `demos/javascript/quickjs-main.c`, `demos/python/cpython-process.c`, `demos/rust/rust-linker.c`, `demos/tmux/osdep-dolly.c`, `demos/neovim/test/neovim-browser.mjs` (a test), `config/samurai-dolly.patch`; `config/git-dolly.patch` calls `dolly_spawn_mapped` under `#ifdef __dolly__` (`:27`) without naming the header in the hunk shown.

Two native fixtures use the names as a seam: `test/fixtures/native-spawn.c:1-2` ("Native test stand-in for Dolly's spawn/wait contract: posix_spawn with the kernel's packet limit and deadline status 124. Never linked into Dolly") implements `dolly_spawn_mapped`/`dolly_wait` over native `posix_spawn`; `test/fixtures/dollyfile-parser.c:4-5,28-45` includes `src/dollyfile.c` and replaces `dolly_write_file`, `dolly_spawn`, `dolly_wait`.

## 4. The reflection's and the audit's claims, checked

**"19 functions."** True: 6 spawn, `dolly_wait`, `dolly_write_file`, `dolly_terminal_publish_result`, `_read_raw_timeout`, `_columns`, `_rows`, `_mode_get`, `_mode_set`, `dolly_interrupt_poll`, `dolly_isatty`, `dolly_exit_signal`, `dolly_waitpid`, `dolly_kill`.

**"`dolly_isatty`, `dolly_kill`, `dolly_waitpid`, `dolly_terminal_mode_*` and `dolly_write_file` duplicate libc (`libc-adapter.c:51` is `isatty() { return dolly_isatty(); }`)."** Partly. The line is as quoted (`:51`). For `isatty`, `kill` (`:98-101`), `wait4` (`:91-95`), `TCGETS`/`TCSETS` (`:1252`, `:1285`) libc's function is a call to the `dolly_` one: two spellings, one body, the `dolly_` one underneath. `dolly_write_file` is the reverse (over `open`/`write`/`close`) and has no POSIX name; its kernel namesake has a different body. "Duplicate" is true of the names in a program's view and false of the code.

**"six spawn wrappers of one call (`runtime-adapter.c:123-178`)."** True: `:123-177` define six public functions over the static `spawn_mapped` (`:34-121`). The same file adds `posix_spawn`/`posix_spawnp` (`:481-564`) over `dolly_spawn_mapped` and `system`/`popen` (`:566-643`) over `dolly_spawn`: nine entry points to one call.

**"Callers outside `src/process`: seven demo files, Slop, `dollyfile.c`, `amy.c`."** Partly. Seven files under `demos/` do (six C, one test). Left out: `src/commands/foreground.c`, `src/commands/run-program.h` and through it `timeout`, `time`, `env`, `xargs`; `config/git-dolly.patch` and `config/samurai-dolly.patch`; `src/process/bootstrap.c` (a command that happens to live in `src/process/`); about twenty test fixtures and inline test programs; and the kernel, which implements four of the names for itself (2.2).

**The audit's "of which three are needed" (`tasks/20261012-230015-audit-fable/core.md:6,26`).** The three it names: `dolly_spawn_mapped`, `dolly_wait`, `dolly_terminal_publish_result`; the argument: "everything else in it duplicates POSIX or has one user". The reflection narrows to two ("`dolly_spawn_mapped` and `dolly_wait` are the interface; the rest is libc's job"). Against the table in 2.1: duplicates of a POSIX spelling with equal power are `isatty`, `waitpid`, `kill`, `terminal_mode_get`/`set`, `terminal_columns`/`rows`, `exit_signal` (via `raise` with `SIG_DFL`), and `write_file` (a convenience); near-duplicates with one capability missing on the POSIX side are `dolly_spawn` and `dolly_spawn_env_cwd` (`NONE` inheritance) and `dolly_terminal_read_raw_timeout` (two calls for one); no POSIX spelling exists for `dolly_spawn_foreground` (roles), `dolly_spawn_timeout`/`_env_timeout` (deadline), `dolly_interrupt_poll` (a kernel poll from a syscall-free loop), `dolly_terminal_publish_result`. "One user": true of `dolly_spawn_env_timeout` (a probe), `dolly_spawn_timeout` (Janis), `dolly_isatty` (Janis), `dolly_terminal_rows` (Janis; the kernel also), `dolly_exit_signal` (Janis), `dolly_terminal_publish_result` (Slop); false of `dolly_spawn_foreground` (the audit's "only `demos/codex/launch.c`" misses `src/commands/foreground.c:21`, the launcher of every `ENTRY`). `dolly_wait` differs from `dolly_waitpid` only in status encoding; which of the two the audit counts as "needed" it does not say.

**The audit's "Slop uses `dolly_terminal_read_raw_timeout` five times where `poll`+`read` exist (`slop.c:5008-5048`)."** True in count (five sites, `:5010-5050`); the kernel's `read` on a terminal returns the queued bytes up to the request size (`src/process-kernel.c:1153-1168`), so `read(0, &byte, 1)` is a one-byte read, and `poll` with a timeout is `FD_POLL` with a deadline.

## 5. What a change would mean, on real cases

Read, not run. "Alternative" means: the program calls only libc.

**(a) Slop's `spawn_command` (`src/slop.c:3038-3068`).** Today: `dolly_spawn_mapped(path, argc, argv, environment, NULL, INHERIT_FDS_ALL, NULL, 0, -1)`; "The child inherits the shell's descriptors 0-9 and its exported variables" (`:3038`); stages are set up on the shell's own descriptors before the spawn. Alternative: `posix_spawn(&pid, path, NULL, NULL, argv, environment)` expresses exactly this (`ALL` inheritance, `:538`; envp; no actions). Slop already waits with libc's `waitpid` (it is not among `dolly_wait`'s callers). What changes: nothing in semantics by reading; the error path is `errno` instead of `-pid`.

**(b) Slop's line editor (`:5008-5055`) and mode toggle (`:5195-5200`), Janis's `readKey` (`quickjs-main.c:887`) and `setRawMode` (`:909-910`).** Today: `TERMINAL_READ` with a 25 ms or infinite deadline per byte; `MODE_GET`/`SET` with the five bits. Alternative: `poll({0, POLLIN}, 1, 25)` then `read(0, &b, 1)`; `tcgetattr`/`tcsetattr` toggling `ISIG` (the adapter maps the five bits both ways, `libc-adapter.c:1201-1218, 1250-1288`). Two kernel calls per byte instead of one; cost unmeasured. The line-discipline investigation (finding 9) notes that whether a future discipline applies to `TERMINAL_READ` or to `FD_READ` decides whether these two programs change.

**(c) Slop's `dolly_interrupt_poll` every 64 builtins (`:195-201`) and QuickJS's interrupt handler (`:35-41`).** Today: a kernel poll with no libc name. Alternative: any call that enters the kernel; `docs/process-model.md:310-311` says clock reads "enter the kernel at least once per millisecond so signals arrive in clock-only loops", so a `clock_gettime` would serve as the poll by that documented rule; the measured per-command poll cost was 8.5x (`ae86e8c0`'s task, spawn-interactive 1.6). `sigpending` would not (`signal.c:232-236`).

**(d) `/bin/foreground` (`src/commands/foreground.c:21`) and Codex's launcher (`demos/codex/launch.c:75`).** Today: `dolly_spawn_foreground(path, argc, argv, interactive)`. Alternative: none in POSIX; `posix_spawnattr_t` has no attribute for a terminal role, and the adapter refuses unknown flags with `ENOTSUP` (`:488`). Either a Dolly-specific attribute extension or a direct `dolly_process_call` with `process.h`'s packet (what the adapter does at `:84-116`). Every `ENTRY` row goes through this command (spawn-interactive, 3).

**(e) `timeout` (`src/commands/timeout.c:52` -> `run-program.h:54`) and Janis's `Dolly.shell` with a timeout (`quickjs-main.c:1331`).** Today: the kernel deadline; "the supervisor ends the child with status 124 even inside a pure CPU loop" (`docs/process-model.md:254-255`), "without a host process" (`runtime.h:25`). Alternative: no `posix_spawn` form; a parent-side `setitimer` plus `kill` would end the child (a kill is forced after 500 ms, `:278`) and the parent would synthesize 124; the deadline then dies with the parent. `env`, `time`, `xargs` pass `-1` and `ALL` inheritance: `posix_spawnp` expresses them.

**(f) The engine (`src/dollyfile.c:884-893`) and `amy` (`amy.c:255-262`).** Today: `dolly_spawn` with `/dev/null` as input, `NONE` inheritance plus three mappings. Alternative: `posix_spawn` with `adddup2(null, 0)`, inheriting every non-CLOEXEC descriptor of the engine (recipe files, the HTTP slot's descriptors) unless each is opened `O_CLOEXEC`. The native parser fixture (`test/fixtures/dollyfile-parser.c:31-45`) replaces `dolly_spawn`/`dolly_wait`; with `posix_spawn` it would have to interpose that name instead (it already does `#define main`). `dolly_write_file`'s eleven sites would become a local helper of the same 17 lines or `fopen`/`fwrite`.

**(g) Janis's `child_process` (`quickjs-main.c:1143`, timeout `-1`) and tmux (`osdep-dolly.c:113`).** Today: `dolly_spawn_env_cwd`: envp, cwd, three fds, `NONE`. Alternative: `posix_spawn` with `addchdir_np` (honoured, `:503-511`) and three `adddup2`, inheriting `ALL`: tmux's pty master and Janis's open files would reach the child unless CLOEXEC.

**(h) Ports calling `dolly_spawn_mapped` directly.** libuv (`demos/cmake/libuv/process.c:175`): `NONE` plus mappings. CPython (`cpython-process.c:94-97`): `STDIO` or `ALL` by `close_fds`. Git (`config/git-dolly.patch:36-37`): `NONE` or `ALL` by `close_fd_above_stderr`, cwd, three mappings, an `ENOEXEC` retry through the shell (`:96-100`); it already sets `FD_CLOEXEC` on its owned descriptors for the `ALL` case (`:80-84`). The one capability all four use that `posix_spawn` lacks is the inheritance mode `NONE`/`STDIO`; the POSIX substitute is CLOEXEC on every other descriptor, which none of the four was written to guarantee.

**Which images rebuild.** Any edit of `runtime.h`: the seed (`libdolly-process.a` and the sysroot header) and, through `Dollyfile-system-build:10`'s pin, every image; not the process digest. The owner's recorded preference for this cascade: `audit-51`, `audit-09`.

**Where a fact is held only here.** The C declaration, as a function, of a SPAWN with a deadline, with an inheritance mode, or with a role; of `TERMINAL_READ` with a deadline; of `INTERRUPT_POLL`; of `PUBLISH_RESULT`. Without the header these are reachable only as packets through `dolly_process_call` (`process.h:25-27`), which is how the adapter itself reaches them.

## 6. What could not be found out

- Any owner words on the header itself; the spawn-module question is the nearest and is deferred.
- Why Slop and `run-program.h` were put on `dolly_spawn_mapped` on 2026-09-30, one day before `posix_spawn` existed, and not moved after: no message or task.
- Whether libuv, CPython, Git and tmux could run on `posix_spawn` with CLOEXEC everywhere: not tried; nothing records an attempt.
- The cost of `poll`+`read` against `TERMINAL_READ` in Slop's editor, and of a `clock_gettime` poll against the 64-builtin poll: unmeasured.
- Whether any program compiled by a user inside an image includes `runtime.h`: outside the repository.
- What `dolly_isatty`'s comment of 2026-08-31 ("Emscripten's generic isatty probes a native-style ioctl") still refers to: the adapter now owns `ioctl`; no commit says when the reason lapsed.
