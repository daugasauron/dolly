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

### 2026-10-09, ntdll, kernel32 and wineserver: a console program runs

- More facts measured (`probe2.c`): the `*at` calls take a directory descriptor,
  symlinks and Unix-socket paths work, `pthread_attr_setstack` is honoured,
  `chmod` changes no mode (directories stay `0755`), `recvmsg` refuses
  `MSG_CMSG_CLOEXEC`, hard links fail (`EMLINK`).
- `cc` passes `-Wl,--whole-archive,A.a,--no-whole-archive` only as one option
  (as separate options the archive is not whole), and `ld -r` is unsupported.
- Build (`demos/wine/Makefile`, `module.mk`): each Wine module is compiled from
  its own `Makefile.in`; `winebuild` (wasm64 backend `winebuild-dolly.c`) writes
  the module's PE headers, export directory, resources and import list as one
  initialized C object and takes the exported functions' types from the wasm
  objects; 193 headers come from widl in about 10 s; ntdll (66 files),
  kernel32 (71) and wineserver (43) compile in about 16 s at four jobs. Only
  `SList` needed a header fix (`interlocked_cmpxchg128`); three names clash
  between ntdll and the server and are renamed at compile time.
- wineserver runs unchanged as a thread (`port/main.c`) with a working
  directory of its own (`port/server-cwd.c`: its relative paths go through
  `openat` and friends), so it never moves the program's. A descriptor sent
  either way is a `dup` whose number travels in the message.
- **Measured in the browser** (`/tmp/wine/wine hello`, `programs/hello`):

      Hello from C:\windows\system32\hello.exe, Windows 6.1, page size 65536, 4 processors
      file: written through wineserver (26 bytes)
      thread: wait 0, exit code 7
      VirtualAlloc: ok, CreateProcess: refused

  The prefix is created in `/home/dolly/.wine`; `wineboot` cannot be started
  (no second process), so the registry starts empty.
- Function pointers: WebAssembly calls a function by its exact type, so a cast
  between function types that x86 tolerates traps ("function signature
  mismatch"). First case: ntdll passed `void start_thread()` to
  `pthread_create`. More are expected in the GUI DLLs.

### 2026-10-09, the GUI: WineMine and Notepad on the Dolly display

- Added advapi32, gdi32 (FreeType 2.14.3 from `zero-ad-deps`, looked up by
  name through `port/freetype-symbols.c`), user32, version, usp10, imm32,
  then comctl32, comdlg32, shell32, shlwapi, uxtheme, winspool.drv. All of
  them compiled without a source change; the work was in linking them into
  one namespace:
  - 85 names are defined by more than one module (`shared-names.txt`,
    collected from the linker's duplicate-symbol errors by
    `make shared-names`); each such module is compiled with `-Dname=module_name`.
  - `-Wl,--global-base=65536`: Win32 reads any pointer below 64 KiB as an
    integer (ordinal, atom, resource id), and wasm-ld puts data at 1024.
    Found as `GetProcAddress(gdi32, "GetStockObject")` failing while
    `"AbortDoc"` worked. `-Wl,--initial-memory=67108864`: 25 MB of data.
  - 95 functions of modules left out (ole32, rpcrt4, setupapi, hid, …) are
    generated stubs that raise Wine's unimplemented-function exception; an
    export implemented under another C name (`EnterCriticalSection`,
    `GetCharWidthW`) gets a forwarder with its callers' type.
- `dlls/winedolly.drv`: surfaces per top-level window, one thread composing
  and presenting at the browser's frame rate and turning input records into
  `__wine_send_input`; it also plays window manager for the foreground.
- The desktop: a thread standing in for `explorer.exe` deadlocked on
  user32's `display_dc_section` (the starter held it); replaced by the
  ownerless desktop window the server already makes, as winex11 handles it.
- Two more "function signature mismatch" cases, both through
  `CallWindowProc`: timers (`TIMERPROC` called as `WNDPROC`). Fixed in
  `DispatchMessage`.
- `argv[0]` without a slash (`wine winemine` from the shell) left libwine
  without its data directory, so no fonts: it now reads `/proc/self/exe`,
  which Dolly answers.
- wineserver signalled a thread it wanted gone with `kill(getpid(), SIGQUIT)`
  for lack of a thread id, which is this very process: WineMine exited 1.
  `send_thread_signal` now refuses.

**Measured in the browser** (headless Chrome, the repository's fixture):
`node demos/wine/test/wine-browser.mjs` passes in 8 s on the `wine` image:
Notepad opens from the image's ENTRY with an active caption, a click and 33
typed characters draw text, Alt+F4 raises its "save changes?" dialog and N
quits to the shell; `wine hello` prints the four lines above; WineMine
draws its field, takes a click and quits with status 0. Screenshots:
`build/wine-evidence/notepad.png`, `winemine.png`. Also seen by hand in the
development session: menus by mouse, Help > About Notepad (shell32's dialog
with the authors list).

Images: `npm run image` builds `wine-build` and `wine` in 123 s
(`wine-build` 222 MB, `wine` 173 MB of snapshot; `/usr/bin/wine` 21 MB).
`node --test` (423 pass) and `lint-dollyfiles` pass. Core files touched:
`config/source-pins.sh` (Wine and flex pins) and `config/upstreams.json`
(three entries), as every demo's sources are registered there. No kernel,
libc, compiler or host module was changed.

## Where it stops

- **File > Open/Save**: `OleInitialize` is in ole32, which is not linked;
  Notepad ends with Wine's "unimplemented function" message. ole32 needs
  rpcrt4, whose stubless proxies are per-CPU assembly thunks: the next
  port, and probably the first to need real design rather than patches.
- **No second process**: no `wineboot`, so an empty registry (Wine's
  built-in defaults apply), and one program per `wine`. Lifting this needs
  either descriptor passing over `sockets@0` between Dolly processes (then
  a real `wineserver` process and `posix_spawn` for `CreateProcess`), or
  several programs as threads of one Win32 process, which Windows programs
  do not expect.
- **Function pointer casts**: every call through a function type that
  differs from the callee's traps. Three found and patched; the trap names
  no function, so each costs a trace. More will surface with more use.
- `SuspendThread`/`TerminateThread` on another thread report success
  without effect (README); not fixed.
- Firefox: not run. Bitmap fonts, translations, type libraries: not built.

## What Wine would need from Dolly's core (none was changed)

1. Descriptor passing on local sockets (`SCM_RIGHTS`), for a server
   process and therefore for more than one Win32 process.
2. Nothing else was a blocker. Worked around inside the demo: no
   `MAP_FIXED`, no partial `munmap`, no assembler in `cc`, no `ld -r`, no
   `dlopen` with threads, `--whole-archive` only inside one `-Wl,` option.
   A trap that named the function it happened in would have saved the most
   time.

## Arbitrary Windows binaries

Not reached and not started. They are x86 code; running them means an x86
emulator in Wasm under this Wine: a user-mode one in the Hangover/Box64
style, where the guest program's calls into Win32 DLLs are thunked to the
native (here wasm64) Wine DLLs. On top of an emulator core (an interpreter
at first: a JIT that emits Wasm is its own project), that needs: PE images
mapped where they ask or relocated (possible: ntdll relocates), guest
memory inside the one linear memory (32-bit programs fit; their pointers
would be truncated addresses, so a "low 4 GiB" allocator like Hangover's),
a thunk per API function for argument and structure layout (generated from
the headers), callbacks from wasm into emulated code (window procedures),
and real exception state for SEH. That is the size of Hangover itself,
with Wine 4.0's structure making the thunk boundary less clean than modern
Wine's syscall interface. A sensible first experiment, should it be
wanted: an i386 interpreter running a console `.exe` that only imports
kernel32.

## Next step

ole32 and rpcrt4 for the file dialogs (with oleaut32 and the shell
folders shell32 then reaches), then `wordpad`/`regedit`/`clock` as further
programs; a Paint would be ReactOS's, built the same way.
