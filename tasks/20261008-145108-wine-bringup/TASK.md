# Bring Wine up inside Dolly: a classic Windows program on the Dolly display

- STATUS: OPEN
- PRIORITY: 150
- TAGS: demo,wine

The owner, 2026-10-08: "use a subagent to try to make wine work in parallel.
Would be really cool to be able to launch a classic windows environment that
can run dlls etc. paint, notepad."

A feasibility bring-up on branch `demo/wine` (worktree `work/wine`), everything
in `demos/wine/`. This file records each step as measured.

## What "run Windows programs" can mean here

- **Wine's own programs and DLLs compiled from Wine's source for wasm64** (Winelib):
  the path taken. Notepad, Winemine and the DLLs they use are C; Dolly's `cc`
  compiles them.
- **Arbitrary Windows binaries** (`.exe`/`.dll` from Microsoft or anyone): x86
  machine code. Wine is not an emulator and Dolly has no x86 CPU; this needs an
  x86 emulator in Wasm under Wine (as Hangover or Box64 do natively) and is not
  started. Assessment at the end.

## Dolly measured against what Wine needs (headless Chrome, `build/wine-fixtures/probe/probe.c`)

| Wine needs | Dolly | Consequence |
| --- | --- | --- |
| `wineserver` in a process of its own, descriptors passed over a Unix socket | `sendmsg` with `SCM_RIGHTS`: `ENOTSUP` (errno 138) | no separate server process: approach (b) is closed without a kernel change |
| threads | `-pthread`: thread, `socketpair`, `poll`, TLS work across threads | the server runs as a thread of the one program |
| `dlopen` of `.dll.so` | `dso@0`, but not together with `-pthread` | every module linked statically into one executable |
| `mmap(MAP_FIXED)`, partial `munmap`, `mprotect` | `MAP_FIXED`: `ENOTSUP`; partial `munmap`: `EINVAL`; `mprotect` returns 0 and protects nothing; anonymous `mmap` zeroed, 64 KiB pages | ntdll's virtual memory needs a Dolly path: no fixed addresses, no guard pages, no write watches, file views are copies |
| `fork`/`exec` for `CreateProcess` | `fork`: `ENOSYS` | one Win32 process; `CreateProcess` fails |
| assembly (`winebuild` emits it; per-CPU thunks) | `cc`: "WebAssembly assembly is unsupported" | `winebuild` gets a wasm64 backend that writes C |
| signals `SIGSEGV`, `SIGUSR1`, `SIGIO` | `sigaction` accepts them; none is ever raised | no fault-driven exceptions |
| unresolved calls into DLLs left out | `-Wl,--unresolved-symbols=ignore-all` links a trap (status 126, "unreachable") | available, not yet used |

## Approach

(a) One static `-pthread` wasm64 executable holding Wine's DLLs, the program
and `wineserver`, which runs unchanged in its own thread and is reached over
`socketpair`s of the same process (a descriptor "passed" is the same
descriptor table). Chosen: it is the only one Dolly's process contract allows.

Rejected: (b) a real `wineserver` process (needs descriptor passing over
`sockets@0`: a kernel change, left to the owner); modules as `dso@0` side
modules (no threads with `dso@0`, so no server thread and no Win32 threads).

Wine **4.0.4** (`wine-4.0.4.tar.xz`, SHA-256
`53a051ff61009f5c0d0f3770fac56c5d1cccd1015078f8b214d63bc6cd8f6169`, from
dl.winehq.org; its GPG signature was not checked): the last stable series in
which ntdll is one library on libc, no DLL is built as PE (0 of the DLLs use
`-mno-cygwin`), and libwine's loader still accepts modules registered by
constructors, which is exactly the static model. From 5.0 on the DLLs move to
msvcrt and PE, and from 6.0 ntdll is split by a per-CPU syscall dispatcher.

## Log

### 2026-10-08, tools

- Worktree from `work/locks` (the root's `dist/` was stale: "system-tools
  inputs are stale"; refilled with `work/fill-worktree.sh wine work/locks`).
- A development session (`build/wine-dev/repl.mjs`, a copy of the Rust one):
  headless Chrome through `work/slot.sh browser`, image `system-tools` + `curl`.
- Host preparation generates the seven parser files (pinned bison 3.8.2, flex
  2.6.4 built on the host from the pinned tarball, SHA-256 `e87aae03…`), as
  `scripts/generate-awk.sh` does for awk.
- **Measured in the browser:** `widl`, `wrc`, `wmc` and `winebuild` build with
  Dolly's `cc` in 16 s and print their versions. Patches so far: a `wasm64`
  CPU in widl and winebuild (their host CPU is a compile-time `#error`
  otherwise), `_WIN64`, endianness and a register-less `CONTEXT` in three
  headers.
