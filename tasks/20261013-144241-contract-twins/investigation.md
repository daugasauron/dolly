# `runtime.h` beside libc, and the twins and operation numbers of the process contract: the investigation

Read on `work/rust` (`integrate/round-1013`, head `1d1f6663`, 2026-10-14); history shared with `main`; tasks at `tasks/`. Line numbers of `src/`, `host/`, `abi/`, `include/`, `docs/`, `scripts/`, `config/`, `demos/` and `test/` files are of this tree unless a commit is named. Nothing was built or run; every number comes from `git`, `grep` and the files. Sibling investigations are cited where they already hold the history: `tasks/20261013-144241-spawn-interactive/investigation.md` (the roles and `3f875924`), `tasks/20261013-144241-line-discipline/investigation.md` (the terminal mode bits), `tasks/20261013-144241-test-surface/investigation.md` (`dolly_terminal_publish_result`), `tasks/20261013-144241-module-sdks/investigation.md` (what the seed packs), `tasks/20261013-144241-slop-and-run/investigation.md` (why Slop is compiled by `RUN`).

One agent wrote this report in two parts; the other part is [runtime.h beside libc](../20261013-144241-runtime-h/investigation.md).

# Part B: twins and operation numbers

## Summary (findings, no advice)

1. Every pair the task names was in `process.h`'s first version (`b95459ce`, 2026-09-05), already in 16-aligned blocks: 1-5 arguments and exit, 16-31 descriptors (full), 32-43 paths, 48-54 clocks, entropy, terminal and download, 64-66 processes, 80 HTTP, 96 display, 112 DSO, 120 FFI. None was ever one operation that was split, and none has been merged.
2. The shapes are WASI's and Linux's, as the libc adapter's function names show: `ARGUMENT_SIZES`/`ARGUMENTS` are `__wasi_args_sizes_get`/`__wasi_args_get` one to one (`src/process/libc-adapter.c:145-156`); `FD_STAT`/`PATH_STAT` and `FD_SET_TIMES`/`PATH_SET_TIMES` are WASI's `fd_filestat_*`/`path_filestat_*` and Linux's `fstat`/`fstatat`, `futimens`/`utimensat` (`:576-584`, `:923-931`, `:685-712`); `FD_STAT_FILESYSTEM`/`PATH_STAT_FILESYSTEM` are `fstatfs`/`statfs` (`:734-756`); `CLOCK_RESOLUTION` is `clock_res_get`/`clock_getres` (`:419-430`). No commit or comment names WASI (`git log -S'WASI' -- include/dolly/process.h`: none).
3. The pairs differ in packet and behaviour: `FD_STAT` answers for pipes, sockets, pty ends and the terminal, which have no path and no kernel descriptor (`src/process-kernel.c:1930-1942`); `PATH_STAT` resolves against `directory_descriptor` and honours `NOFOLLOW` (`:1984-2002`). `path_from_packet` rejects an empty path (`:928`), so "empty path means the descriptor" is not accepted today. The two `STAT_FILESYSTEM` operations return the same kernel-memory figures whatever the argument (`:1049-1063`). libc already multiplexes the two `SET_TIMES` operations by `path == NULL` (`:688-697`).
4. `CLOCK_RESOLUTION` calls `clock_getres` in the kernel (`:2288`), which the kernel's own libc shim answers with two constants: 1 000 000 ns for `REALTIME`, 1 000 ns for `MONOTONIC`, "Date.now counts milliseconds; performance.now is clamped to microseconds or coarser" (`src/libc-host.c:27-31`). The constant is in the kernel's libc, not in `process-kernel.c`.
5. `TERMINAL` (50) carries six sub-operations in one packet (`process.h:298-305`; `terminal_packet` `:1487-1545`); `FD_LOCK` (59) answers with a packet only under `LOCK_TEST` (`:157-159`; `:1459-1468`). They are not alone: `ALARM` changes meaning by request size (`:170-171`), and five modules put the operation word inside the packet under one number (gpu 128, audio 129, microphone 130, buttons 131, nena 133: `host/nena/dolly-nena-0.wat:6,13-17,21`).
6. Download 51 and upload 57 were core operations (`DOWNLOAD_FILE` at `b95459ce`; `UPLOAD_FILE` at `2ccaab24`, 2026-09-07, in the same block after 55/56) and kept their numbers when `cec22729` (2026-10-01) moved them into modules; the message gives no reason for keeping them, and the same commit restamped every client with a new 72-byte `dolly.host` record, so old executables were not what was preserved. `PATH_SET_MODE` 44 and `FD_SET_MODE` 58 lived one day (`26277ef5` to `d41df0cb`, 2026-09-30) and their numbers have stayed holes; `FD_LOCK` took 59, not 58 (`85a01262`).
7. The one written rule is `process.h:110-111`: modules number operations "in their own contracts (host/NAME/dolly-NAME-0.wat), never reusing a number below." Practice shows three habits: 16-aligned blocks (core, threads 144, sockets 160, pty 176), 8-aligned (http 80, input 88), and consecutive singles for lease modules (128-133). `test/host-modules.test.mjs:114-146` asserts only that ranges do not overlap, core included; it asserts no start and no block size.
8. Today: 50 core operations and 47 module operations across 15 contracts (97 numbers). All 50 core operations are issued by `src/process/*.c`; which programs reach `CLOCK_RESOLUTION` or `FD_SET_TIMES` is not counted (the method of `20261005-222449-spawn-users` could).
9. A merge of any pair edits `process.h`, whose exact bytes are the executable identity by the owner's decision ("replicability over rebuild time", `audit-09`, `0d42f4e2`): every executable restamped, the seed and every image rebuilt (`85a01262`'s own words for one added operation). A renumbering of download or upload changes those modules' digests (their numbers are in the hashed WAT, `scripts/generate-abi-constants.mjs:34-46`) and the immediates in `/bin/download` and `/bin/upload`; `process.h` and other executables are untouched; the seed still rebuilds, since it packs every client archive (`scripts/build.sh:183-187`).
10. Not found: any owner statement on twins or numbering; whether WasmFS's `fstatat` accepts an empty path with `AT_EMPTY_PATH`; the cost of a second kernel call for `fstat` on a merged path operation; why `UPLOAD_FILE` took 57 and not 55 (55/56 were taken the day before by `f0ffce09`).

---

## 1. History

### 1.1 The first contract (`b95459ce`, 2026-09-05)

`include/dolly/process.h` at `b95459ce:27-98`:

```
ARGUMENT_SIZES 1, ARGUMENTS 2, ENVIRONMENT_SIZES 3, ENVIRONMENT 4, EXIT 5
FD_READ 16 ... FD_SET_FLAGS 31   (16 numbers: FD_STAT 20, FD_PREAD 25,
                                  FD_STAT_FILESYSTEM 27, FD_SET_TIMES 28,
                                  FD_PWRITE 29, FD_GET_FLAGS 30, FD_SET_FLAGS 31)
PATH_OPEN 32 ... PATH_SET_TIMES 43   (PATH_STAT 33, PATH_STAT_FILESYSTEM 42)
CLOCK_TIME 48, RANDOM 49, TERMINAL 50, DOWNLOAD_FILE 51,
CLOCK_RESOLUTION 52, CLOCK_SLEEP 53, FD_POLL 54
SPAWN 64, WAIT 65, INTERRUPT_POLL 66
HTTP_START 80, HTTP_POLL 81, HTTP_CANCEL 82
DISPLAY_ACQUIRE 96 ... DISPLAY_RELEASE 104
DSO_OPEN 112, DSO_SYMBOL 113, DSO_CLOSE 114
FFI_CALL 120 ... FFI_CLOSURE_PREP 123
```

and `TERMINAL_READ 1 ... TERMINAL_PUBLISH_RESULT 6` (`:158-163`). The header's comment then: "A negative result is a negated POSIX errno value." The message says only "Preserve the process ABI migration". The descriptor block was full at 16 entries from day one; `DOWNLOAD_FILE` sat in the clocks-and-terminal block because it was a kernel operation like the others.

The libc adapter of the same commit named the WASI entry points the operations serve; today they read `__wasi_args_sizes_get` -> `ARGUMENT_SIZES`, `__wasi_args_get` -> `ARGUMENTS` (`src/process/libc-adapter.c:145-156`), `__wasi_environ_*` likewise (`:158-170`), `__wasi_clock_res_get` -> `CLOCK_RESOLUTION` (`:419-430`), `__syscall_fstat64` -> `FD_STAT` (`:576-584`), `stat_path` -> `PATH_STAT` (`:923-931`), `__syscall_utimensat` -> `FD_SET_TIMES` or `PATH_SET_TIMES` (`:685-712`), `__syscall_statfs64`/`__syscall_fstatfs64` -> the two `STAT_FILESYSTEM` (`:734-756`). Emscripten's musl calls exactly these WASI and syscall names, so one operation per libc entry point was the shape that made the adapter a one-line translation each.

### 1.2 Additions in the same blocks (2026-09-06 to 2026-09-14)

- `f0ffce09` (2026-09-06): `FD_GET_DESCRIPTOR_FLAGS` 55, `FD_SET_DESCRIPTOR_FLAGS` 56, placed in the 48-block because the descriptor block was full. The second flag pair is a split by meaning, not an accident: "Descriptor and open-file flags are distinct kernel state" (`libc-adapter.c:1393-1395`), `process.h:233-234`.
- `2ccaab24` (2026-09-07): `UPLOAD_FILE` 57, "path_request -> no response; user-selected file, no overwrite", next number after 56.
- `86a11131` (2026-09-14): `HTTP_BODY_WRITE` 83.
- `d19df4bc` (2026-09-14): the first number outside `process.h`: `DOLLY_GPU_PROCESS_OP` 128 in `abi/dolly-gpu-0.wat`, "Experimental, additive process operation. The base process call/layout is unchanged; an older kernel returns ENOSYS. No image needs a new libc." (`host/gpu/dolly-gpu-0.wat:2-3` today). This is also the first module whose packet carries its own operation word. Threads 144 (`018c5f27`, 2026-09-27) and audio 129 (`faf8f364`, 2026-09-30) followed in `abi/`.

### 1.3 The identity decided (2026-09-30)

- `26277ef5`: "process.h defines signal numbers, seek origins, clock ids, open-description status bits and permission-only stat modes; one C/C++ layout-assert list. The layout identity hashes process.h without comments or whitespace." It added `PATH_SET_MODE` 44 and `FD_SET_MODE` 58.
- `d41df0cb` (same day): removed both, by the owner's one-user decision: "26277ef added PATH_SET_MODE (44) and FD_SET_MODE (58) ... That reversed a documented design ... Remove both operations from process.h". 44 and 58 have been holes since.
- `0d42f4e2` (same day): "Hash the exact bytes of the ABI layout sources again ... replicability matters more than avoiding rebuilds after a prose edit." `audit-09`'s resolution: "By design: executable identity hashes the exact bytes of process.h, so any change rebuilds everything downstream (owner: replicability over rebuild time)."

### 1.4 Modules take their numbers with them (2026-10-01 to 2026-10-13)

- `cec22729` (2026-10-01): "Display, HTTP, download and upload operations and packets leave the ABI-hashed process.h: op numbers become globals in each module's WAT contract and packets move into its header. process.h keeps only the core process ABI." The rule was written then: "Host modules number their operations in their own contracts (host/NAME/dolly-NAME-0.wat), never reusing a number below." Numbers kept: download 51, upload 57, http 80-83, display 96-104. The same commit: "Its client stamps the digest into its dolly.host record (now 72 bytes) ... the loader refuses an executable or DSO whose digest differs", so every client executable was rebuilt anyway; the message gives no reason for keeping the numbers, and the kernel's dispatch (a `switch` until `5a9b77e0`) needed no change if they stayed.
- `5a9b77e0` (2026-10-01): `module_for()` over a table of `[first_operation, last_operation]` per module (`src/process-kernel.c:132-139`); "dispatches through a table generated from the manifests and no longer names any module". `fe9cac9a` (2026-10-01): the manifests; gpu, audio and threads numbers moved to `host/NAME/dolly-NAME-0.wat`.
- `9b3e8c99` (2026-10-01): `ALARM` 70 ("an empty request only reads the timer"), `ALARM_HANDLED` 71 ("no response").
- `85a01262` (2026-10-06): `FD_LOCK` 59, skipping 58; "One process operation, DOLLY_PROCESS_FD_LOCK = 59, and one kernel table of 1024 locks ... A process ABI change: every executable is restamped, the Rust seed and every image rebuild." The reason given is for one operation over two kinds of lock ("The two kinds do not conflict"); nothing is said about why 58 was passed over or why the TEST answer is a flag.
- `56255e61` (2026-10-06): input@0 88-91, in the 80-block beside http; display's `NEXT_EVENT` 103 left and `RELEASE` moved from 104 to 103 (a renumbering inside a module whose digest changed anyway). `5dbcfad9` (2026-10-06): dso 112-114 and ffi 120-123 leave `process.h`. `21c855b7` (2026-10-08): sockets 160-169. `ef06bf34`, `7a6daada` (2026-10-10): microphone 130, buttons 131-132. `d9f8104e` (2026-10-12): pty 176-177. `a182787a` (2026-10-13): nena 133.
- `tasks/20261006-214244-process-exec/TASK.md:36-37` (open, "very low priority"): "number 61 is reserved for it; 58 and 60 are file modes, 59 locks". 60 never existed in `process.h`; the reservation is prose in a task.

### 1.5 Owner statements on the contract's shape

On twins and numbers: none. On identity: `audit-09` and `0d42f4e2` (exact bytes). On the single user: `d41df0cb`, `audit-04` ("By design, not a bug. Dolly has one user and no permission bits (owner, 2026-09-30)"). On modules: "Of course it needs to be declared" (2026-10-08, module-sdks investigation, finding 8). On the direction: `AGENTS.md`, "The core interface must remain small, typed, inspectable, and versioned" and "Do not automatically allow every import emitted by a new program ... evolve a versioned contract deliberately."

## 2. What is there today

### 2.1 Every operation number

Core, `include/dolly/process.h:112-176` (50): 1-5; 16-31; 32-43; 48, 49, 50, 52, 53, 54, 55, 56, 59; 64-71. Unused inside 1-71: 6-15, 44-47, 51 (download), 57 (upload), 58, 60-63.

Modules (47), from each `host/NAME/dolly-NAME-0.wat` and `host/NAME/kernel.c`'s `dolly_NAME_kernel = {first, last, ...}`:

| Module | Numbers | Where | Kernel range line |
|---|---|---|---|
| download | 51 | `dolly-download-0.wat:26` | `kernel.c:94-95` |
| upload | 57 | `dolly-upload-0.wat:45` | `kernel.c:133-134` |
| http | 80-83 | `dolly-http-0.wat:66-69` | `kernel.c:332-333` |
| input | 88-91 | `dolly-input-0.wat:44-47` | `kernel.c:266-267` |
| display | 96-103 | `dolly-display-0.wat:74-81` | `kernel.c:502-503` |
| dso | 112-114, 120-123 | `dolly-dso-0.wat:32-34, 44-47` | served in the process Worker (test `:128-137`) |
| gpu | 128 | `dolly-gpu-0.wat:9` | `kernel.c:29` |
| audio | 129 | `dolly-audio-0.wat:6` | `kernel.c:29` |
| microphone | 130 | `dolly-microphone-0.wat:6` | `kernel.c:29-30` |
| buttons | 131-132 | `dolly-buttons-0.wat:6-7` | `kernel.c:33-34` |
| nena | 133 | `dolly-nena-0.wat:6` | `kernel.c:30` |
| threads | 144-147 | `dolly-threads-0.wat:12-15` | `kernel.c:169-170` |
| sockets | 160-169 | `dolly-sockets-0.wat:28-37` | `kernel.c:329-330` |
| pty | 176-177 | `dolly-pty-0.wat:37-38` | `kernel.c:237` |

`module_for` (`src/process-kernel.c:132-139`) hands a number to the first module whose range holds it, before the core's `switch` (`:1693-1694`), so a module number inside the core's block is served by the module.

### 2.2 The named pairs, side by side

**`FD_STAT` (20) and `PATH_STAT` (33).**
- Request: `dolly_process_fd_request {u32 descriptor; u32 reserved}` 8 bytes (`process.h:339-342`) against `dolly_process_path_request {u32 directory_descriptor; u32 flags; u32 reserved; u32 path_size} + path bytes` 16+ (`:586-592`), flags `PATH_NOFOLLOW` (`:266-269`). Response: `dolly_process_stat_response`, 88 bytes, for both (`:609-626`).
- Kernel: `FD_STAT` `:1926-1945` (20 lines): `decode_fd_request`; a default answer for descriptors without a kernel file (`.mode 0600, .link_count 1, .block_size 4096, .file_type` the socket kind's or `FIFO`, `:1930-1934`); `fstat` and `encode_stat` only when a kernel descriptor exists (`:1935-1938`); terminal descriptors become `CHARACTER_DEVICE` (`:1939-1941`). `PATH_STAT` `:1984-2002` (19 lines): `decode_path_request`, `fstatat` with `AT_SYMLINK_NOFOLLOW` by flag, `encode_stat`. `encode_stat` (`:1024-1047`) is shared.
- Behaviour: `FD_STAT` works on pipes, sockets, pty ends and the terminal, which have no path; `PATH_STAT` resolves relative to `directory_descriptor` (`UINT32_MAX` is the cwd, `path_from_packet` `:933-937`) and follows or does not follow a symlink. `path_from_packet` returns `EINVAL` for `size == 0` (`:928`).
- libc: `fstat`, `__wasi_fd_fdstat_get` (`:905-921`), `descriptor_is_regular_file` for the first read packet (`:191-199`, `:206`), `fadvise` (`:614-620`) use `FD_STAT`; `stat`, `lstat`, `fstatat`, and the existence checks of `chmod`/`chown`/`access` (`:935-940`) use `PATH_STAT`.

**`FD_STAT_FILESYSTEM` (27) and `PATH_STAT_FILESYSTEM` (42).**
- Request: 8-byte fd request against the 16+ path request. Response: `dolly_process_filesystem_stat_response`, 96 bytes (`:633-646`).
- Kernel: `:1759-1770` (12 lines): `decode_fd_request`, `fstat` to validate, `encode_filesystem_stat`; `:2125-2143` (19 lines): `decode_path_request`, `fstatat` to validate, the same encoder. `encode_filesystem_stat` (`:1049-1063`) reports kernel memory and ignores its argument: there is one filesystem.
- libc: `fstatfs64` (`:746-756`), `statfs64` (`:734-744`); musl's `statvfs`/`fstatvfs` call these.

**`FD_SET_TIMES` (28) and `PATH_SET_TIMES` (43).**
- Request: `dolly_process_fd_times_request {u32 descriptor; u32 reserved; timestamp access; timestamp modification}` 40 bytes (`:350-355`) against `dolly_process_path_times_request {u32 directory_descriptor; u32 flags; u32 reserved; u32 path_size; access; modification} + path` 48+ (`:594-602`). No response.
- Kernel: `:1771-1784` (14 lines): `futimens`; `:2144-2167` (24 lines): `path_from_packet` (not `decode_path_request`, since the header differs), `utimensat` with `NOFOLLOW` by flag. `decode_timestamps` shared.
- libc: one function, `__syscall_utimensat` (`:685-712`): `path == NULL` -> `FD_SET_TIMES` (musl's `futimens` passes NULL), else `PATH_SET_TIMES`. The libc side already multiplexes the pair on one condition.

**`ARGUMENT_SIZES` (1) and `ARGUMENTS` (2); `ENVIRONMENT_SIZES` (3) and `ENVIRONMENT` (4).**
- Request: empty (`request_size != 0` is `EINVAL`, `:1696`). Response: `dolly_process_vector_sizes {u32 count; u32 reserved; u64 bytes}` 16 bytes (`:307-311`), then the NUL-terminated strings up to `response_capacity` (`ENOBUFS` when short, `vector_bytes` `:823-`).
- Kernel: `:1695-1710` (4 lines each) over `vector_sizes` (`:810-821`) and `vector_bytes`.
- libc: `__wasi_args_sizes_get` and `__wasi_args_get` (`:145-156`), the latter calling the former first; the environment the same (`:158-170`). Emscripten's crt calls these two WASI functions in that order.

**`CLOCK_RESOLUTION` (52).**
- Request: `dolly_process_clock_request {u32 clock_id; u32 reserved; u64 precision_nanoseconds}` 16 bytes, precision must be 0 (`:2285-2286`). Response: `{u64 nanoseconds}`.
- Kernel: `:2279-2293` (15 lines): `clock_getres(clock)`. The kernel is an Emscripten build whose WASI clock functions are Dolly's own `src/libc-host.c`; `__wasi_clock_res_get` (`:27-31`) returns `1000000` for `REALTIME` and `1000` for `MONOTONIC` with the comment "Date.now counts milliseconds; performance.now is clamped to microseconds or coarser."
- libc: `__wasi_clock_res_get` (`:419-430`), reached by `clock_getres`. `CLOCK_TIME` has a Worker fast path (`docs/process-model.md:310-311`); `CLOCK_RESOLUTION` has none.

**`TERMINAL` (50).**
- Request: `dolly_process_terminal_request {u32 operation; u32 descriptor; u32 flags; u32 reserved; u64 deadline_nanoseconds}` 24 bytes (`:572-578`); operations `READ` (deadline), `ISATTY`, `MODE_GET`, `MODE_SET` (flags), `SIZE`, `PUBLISH_RESULT` (flags = status) (`:298-305`). Response: `{i64 value; u32 columns; u32 rows}` 16 bytes for all six (`:580-584`).
- Kernel: `terminal_packet` `:1487-1545` (59 lines), one function: `PUBLISH_RESULT` first (`:1499-1503`, skipped on a pty slave), a kind dispatch for sockets with a terminal (`:1512-1515`, pty slaves), then the display terminal inline (`:1516-1544`).
- libc: `ioctl` `TCGETS`/`TCSETS*`/`TCFLSH`/`TCSBRK`/`TCXONC`/`TIOCGWINSZ` (`libc-adapter.c:1250-1322`), `discard_terminal_input` (`:1221-1233`), `isatty` through `dolly_isatty`, and the adapter's `terminal_call` (`runtime-adapter.c:340-350`).

**`FD_LOCK` (59).**
- Request: `dolly_process_fd_lock_request {u32 descriptor; u32 flags; u32 type; u32 whence; i64 start; i64 length}` 32 bytes (`:402-409`); flags `DESCRIPTION`, `WAIT`, `TEST` (`:391-397`). Response: none, or under `TEST` alone `dolly_process_fd_lock_response {u32 type; u32 pid; u64 start; u64 length}` 24 bytes (`:413-418`); `TEST` with any other flag or with `UNLOCK` is `EINVAL` (`:1432-1434`).
- Kernel: `fd_lock_packet` `:1421-1482` (62 lines) plus `lock_range` (`:1395-1419`); the TEST branch `:1459-1468`.
- libc: `flock` (`:1359-1373`), `record_lock` for `F_GETLK`/`F_SETLK`/`F_SETLKW` (`:1376-1393`) through `lock_call` (`:1343-1356`); `F_GETLK` is the TEST request.

**The audit's further pairs (`core.md:32`), for completeness.** `FD_GET_FLAGS`/`FD_SET_FLAGS` (30/31, open-description status) and `FD_GET_DESCRIPTOR_FLAGS`/`FD_SET_DESCRIPTOR_FLAGS` (55/56, per-handle): kernel `:1821-1893`; libc's `fcntl` switches `F_GETFD`/`F_SETFD`/`F_GETFL`/`F_SETFL` to the four (`:1396-1422`), `ioctl` `FIOCLEX`/`FIONBIO` too (`:1238-1248`). `FD_READ`/`FD_PREAD` (16/25) and `FD_WRITE`/`FD_PWRITE` (17/29): different request structs (`fd_io_request` 16 bytes, `fd_pread_request` 24 with `offset`, `:320-331`); the reflection says it would keep these apart.

### 2.3 Packet conventions across the whole contract

One operation, one request, one response: most of the core. One number, the operation inside the packet: `TERMINAL` and the five lease modules (gpu, audio, microphone, buttons' 131, nena), each with "LE header [32]: u32 version,operation; u64 scope,sequence; u32 body,reserved" (`host/nena/dolly-nena-0.wat:21`, `host/gpu/dolly-gpu-0.wat`, `host/audio/dolly-audio-0.wat:20`, `host/microphone/dolly-microphone-0.wat:22`, `host/buttons/dolly-buttons-0.wat:26-27`). A response that depends on a flag: `FD_LOCK`. A request whose meaning depends on its size: `ALARM` (`:170-171`). Operations with no response: `FD_SET_TIMES`, `PATH_SET_TIMES`, `FD_SET_FLAGS`, `FD_SET_DESCRIPTOR_FLAGS`, `ALARM_HANDLED`, download, upload, and others.

## 3. Counted

Kernel dispatch lines per pair (the `case` bodies, helpers excluded): `FD_STAT` 20 + `PATH_STAT` 19; `FD_STAT_FILESYSTEM` 12 + `PATH_STAT_FILESYSTEM` 19; `FD_SET_TIMES` 14 + `PATH_SET_TIMES` 24; `ARGUMENT_SIZES` 4 + `ARGUMENTS` 4 (and the same 8 for the environment, over two shared helpers of 12 and about 12 lines); `CLOCK_RESOLUTION` 15; `TERMINAL` 59 in one function; `FD_LOCK` 62 plus 25.

Operations without a caller in the process libc: none. Each of the 50 is issued from `src/process/libc-adapter.c`, `runtime-adapter.c`, `signal.c`, `time.c` or `poll.c` (grep over `DOLLY_PROCESS_*` in `src/process/*.c`). Which programs reach each operation was not counted; `tasks/20261005-222449-spawn-users` did it for SPAWN, WAIT, INFO, SIGNAL, DSO and FFI by scanning the immediates of every `call` in 136 executables, and the same scan would answer it for `CLOCK_RESOLUTION`, `FD_SET_TIMES` and the rest.

Recipes declaring the two modules in the core's block: `REQUIRES HOST download@0` in 51 recipes, `upload@0` in 48 (grep); their executables are `/bin/download` and `/bin/upload` built in `Dollyfile-system-tools:99-153`.

## 4. The reflection's claims, checked

**"50 operations (`include/dolly/process.h`)."** True.

**"Twins: `FD_STAT`/`PATH_STAT`, `FD_STAT_FILESYSTEM`/`PATH_STAT_FILESYSTEM`, `FD_SET_TIMES`/`PATH_SET_TIMES` though the path request already carries `directory_descriptor` (586-592)."** True as pairs and true of the field (`:586-592` here as well). What the sentence leaves out: the fd request is 8 bytes against 16 or more; `path_from_packet` refuses an empty path (`:928`); `FD_STAT` serves descriptors with no path (`:1930-1942`); `directory_descriptor` is resolved through `descriptor_for` (`:935-936`), a directory handle for `openat`-style calls, not any descriptor. The `STAT_FILESYSTEM` pair is the closest to one operation: both answers are the same figures (`:1049-1063`).

**"`ARGUMENT_SIZES`+`ARGUMENTS`."** True; it is WASI's two-call shape, implemented one to one (`:145-156`).

**"`CLOCK_RESOLUTION` returns a constant (`src/process-kernel.c:2201-2215`)."** Partly. The lines (`:2279-2293` here) call `clock_getres`; the constant is two values in the kernel's libc shim (`src/libc-host.c:27-31`), chosen for the browser's two clocks. Whether a non-browser kernel would answer differently is the one thing the operation leaves open.

**"Three conventions of packet in one contract: `TERMINAL` alone multiplexes six sub-operations (298-305), `FD_LOCK` alone changes its response by a flag (157-159)."** The line references are right. "Alone" is false for the contract as a whole: five module contracts multiplex through one number with an operation word in the packet (2.3), and `ALARM` varies by request size. True within `process.h`'s own enum for the multiplexing; true for the response-by-flag.

**"`download` uses operation 51 and `upload` 57, inside the core's 48-59; `process.h:110` says 'never reuse a number below' and nothing says where a module starts."** True on all three points (`host/download/dolly-download-0.wat:26`, `host/upload/dolly-upload-0.wat:45`, `process.h:110-111`). The unwritten practice is three habits (summary, 7).

**"`test/host-modules.test.mjs:114` already checks collisions."** True (`:114-146`): it takes every core constant, each kernel module's `[first, last]` from `kernel.c` via `abi.mjs`, and the process-Worker module's handled numbers, sorts, and asserts `previous.last < next.first`. It checks nothing about where a range starts or how large it is.

**The audit's "`DOLLY_NAME_VERSION` is exported by 4 WATs only."** Five today (`grep`: gpu, audio, microphone, buttons, nena), as the reflection says; `module.json` has `version` for all 18.

## 5. What a change would mean, on real cases

Read, not run. Every edit of `process.h` is a new `dolly.process` digest: "every executable is restamped, the Rust seed and every image rebuild" (`85a01262`), by the owner's exact-bytes decision.

**`FD_STAT` into `PATH_STAT` by an empty path.** Packet: `path_request` with `path_size 0` and `directory_descriptor` = the descriptor, or a flag `PATH_EMPTY` (`AT_EMPTY_PATH`'s shape). Kernel: `path_from_packet` gets a branch; the pipe, socket, pty and terminal cases (`:1930-1942`) move under the path operation; the file case must call `fstat` on the descriptor rather than `fstatat(dirfd, "")`, because `descriptor_for` and `openat` expect a directory and whether WasmFS honours `AT_EMPTY_PATH` is not known. libc: `fstat`'s request grows from 8 to 16 bytes and the first-read check (`:191-199`) with it. Simpler: one `case` label and the 20 lines of `FD_STAT`; new: the empty-path rule, stated once in `path_from_packet` for every path operation or guarded in one. The same for `STAT_FILESYSTEM` (where nothing but validation differs) and `SET_TIMES` (where libc already chooses by `path == NULL`, so the libc side would lose a branch and the kernel gain one).

**`ARGUMENTS` without `ARGUMENT_SIZES`.** The strings are bounded by `DOLLY_PROCESS_PACKET_LIMIT` (1 MiB, `:17`); a single response needs the caller to offer a buffer first and retry on `ENOBUFS` with the sizes the kernel would then have to put in the error path or a header. libc's `__wasi_args_sizes_get` and `__wasi_args_get` would remain two functions, one caching the other's result. Four `case` labels and two helpers become two and one.

**`CLOCK_RESOLUTION` removed.** The two constants of `src/libc-host.c:29` would be written again in the process libc; `clock_getres` callers unchanged; a kernel on another host could not change the answer without a libc rebuild.

**`TERMINAL` as six operations, `FD_LOCK` as two.** Six numbers in a block that has four free (`60-63`) or in a new block; `terminal_packet`'s one function becomes six `case` labels over the same kind dispatch; the adapter's one `terminal_call` becomes six packets. `FD_LOCK`: a `FD_LOCK_TEST` operation with its own response; `lock_call` (`:1343-1356`) loses its `holder ? sizeof : 0` branch. Both are `process.h` edits.

**A rule "modules start at N" applied to download and upload.** Their numbers live in the hashed WAT (`generate-abi-constants.mjs:34-46`: the digest is "the SHA-256 of the exact bytes of its contracts and other headers"), so a renumbering is a new `DOLLY_DOWNLOAD_ABI_DIGEST`/`DOLLY_UPLOAD_ABI_DIGEST`; the loader refuses an executable whose record differs (`cec22729`; `docs/process-model.md:64-69`). The number is also an immediate in the executable (spawn-users: "every call site in all 136 executables resolved to a constant"). So: `/bin/download` and `/bin/upload` and every image holding them (51 and 48 recipes) rebuild; `process.h` is untouched, other executables keep their stamps; the seed rebuilds regardless, because it packs every client archive (`scripts/build.sh:183-187`; module-sdks finding 9: "images rebuilt: all, in each case, because the seed changed"). A rule that only forbids the core's block for new modules changes nothing built.

**Where the present arrangement is the only place a fact is held.** The partition of the number space exists in three places and nowhere as a rule: `process.h`'s enum, each WAT's globals, and the non-overlap test. That 58 and 60 are "file modes" is held only in the exec task's prose. That a lease module takes one number and multiplexes is held in five WAT comments and no document.

## 6. What could not be found out

- Any owner words on twins, on packet conventions, or on numbering; the owner's recorded decisions are the exact-bytes identity and the single user.
- Whether Emscripten's WasmFS `fstatat` accepts an empty path with `AT_EMPTY_PATH`, which a merged stat by descriptor would need, or whether it would have to be `fstat` under the path operation: needs a build.
- Why `UPLOAD_FILE` took 57 on 2026-09-07 (55 and 56 had been taken the day before) and why `FD_LOCK` passed over 58: no message says; both fit "never reuse a number", applied to the core as well, by reading.
- Whether the download and upload numbers were kept in `cec22729` on purpose: the message is silent; the same commit rebuilt every client.
- Which programs in the catalog reach `CLOCK_RESOLUTION`, `FD_SET_TIMES`, `PATH_SET_TIMES`, `FD_STAT_FILESYSTEM` or `PATH_STAT_FILESYSTEM`: needs the executable scan.
- The per-call cost of a 16-byte request against an 8-byte one for `fstat`, which libc issues before a first full read (`:206`): unmeasured.
- Whether `process.h` edits of the kind above would cross a packet-size limit in `src/process-worker.mjs`'s copy path: not read for this question.
