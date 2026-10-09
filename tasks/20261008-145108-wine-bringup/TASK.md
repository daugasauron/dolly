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
- One more "function signature mismatch": timers, a `TIMERPROC` called as
  a `WNDPROC` through `CallWindowProc`. Fixed in both `DispatchMessage`s.
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
  differs from the callee's traps. Two found and patched; the trap names
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

## Phase 2 (the owner, after trying the image)

"add more things to wine (x86 emulator etc). I want it to look like windows
with start bar etc and paint!" Three deliverables, in order: a desktop with
a taskbar and Start menu and more than one program at once; Paint; an x86
emulator with a first real result.

### 2026-10-09, deliverable 1: the desktop

- Route: a shell of our own (`programs/desktop`, 300 lines against user32
  and gdi32), not Wine's `explorer.exe`. Explorer's desktop mode needs
  shell32's folders and ole32, and starts every program with
  `CreateProcess`, which one Dolly process cannot provide.
- More than one program: each program linked into Wine is started as a
  thread of the desktop's process (`port/kernel32-program.c`; the README
  lists what that cannot do). kernel32 answers `GetModuleHandle(NULL)`,
  `GetModuleFileName(NULL)`, `GetCommandLine` and `ExitProcess` per program
  thread; each program's objects are linked between two marks so that its
  static data can be restored before a restart; user32 unregisters the
  classes its last run left.
- The window manager's part is in the driver: a click raises the window
  (`SWP_ASYNCWINDOWPOS`, so its own thread does it) and gives it the
  foreground; the work area ends above `Shell_TrayWnd`. user32 got
  `ARW_HIDE` for minimized windows. Wine 4.0 ignores `WS_EX_NOACTIVATE` on a
  click, so the taskbar answers `WM_MOUSEACTIVATE` itself.
- `SuspendThread` and `TerminateThread` on another thread now fail with
  `STATUS_NOT_SUPPORTED` in the server (they reported success before).
- **Measured in the browser** (`node demos/wine/test/wine-browser.mjs`,
  Chrome, 10 s): the image boots into the desktop; Start and `N` start
  Notepad, which takes typed text; Start and `W` start WineMine beside it;
  WineMine is dragged by its caption to 800,300; Notepad's taskbar button
  minimizes and restores it (pixels); WineMine is closed with Alt+F4 and
  started again (classes and data reset); Shut Down returns to the shell.
  The desktop prints its window list whenever it changes and the test reads
  it after Shut Down. Images build in 152 s.

Real processes instead of threads (not done, a core change): Wine needs to
send descriptors between processes over a local socket.
`host/sockets/client.c` refuses `sendmsg` with control data and `recvmsg`
returns none (read); the kernel side (`host/sockets/kernel.c`) was not
studied. The shape it would take: `sendmsg` with one `SCM_RIGHTS` message
makes the kernel keep a reference to each named open-file description in
the stream at that byte position, and `recvmsg` with a control buffer
installs them as new descriptors of the receiver (dropped with the socket
if never received). That is new behaviour of two existing operations of
`sockets@0`, so its contract text and ABI digest change and every image
whose programs link `-ldolly-sockets` is rebuilt; no browser import
changes. With it, `wineserver` could be its own process and
`CreateProcess` a `posix_spawn` of `wine`, which is what explorer, and
every program that starts another, expects.

### 2026-10-09, deliverable 2: Paint

- ReactOS's `mspaint` at the `ReactOS-0.3.17` tag (commit `1bca06c4…`): the
  last release line where it is C (later ones are ATL C++ with GDI+).
  Licence: LGPL (its headers; ReactOS's `COPYING.LIB` is 2.1) (read). 44
  files plus the licence are fetched from that commit and checked against
  `demos/wine/mspaint.sha256`; no file is changed.
- From ReactOS's SDK it needs only `<tchar.h>`, `<reactos/version.rc>` and
  `<reactos/manifest_exe.rc>`; ours stand in. `cc` refuses `-fshort-wchar`,
  so `TEXT()` and `_T()` become `u""` literals in our `tchar.h`.
- File dialogs: the Explorer-style dialog needs ole32 (not linked). On
  Dolly comdlg32 now always shows its older dialog (`GetFileName31`),
  which needs only user32. This also makes Notepad's File > Open and Save
  work. Not attempted: ole32 itself (it wants rpcrt4, whose proxies are
  per-CPU assembly).
- **Measured in the browser** (same test, Chrome, 15 s in all): Start and
  `P` open Paint at 100,100; a pencil line dragged across the image draws
  260 dark pixels; Ctrl+S, a typed `C:\dolly.bmp` and Enter save it; the
  title becomes `dolly.bmp - Paint`; Alt+F4 closes it; afterwards
  `wc -c ~/.wine/drive_c/dolly.bmp` in the shell says 480054 (400x300 at 32
  bits plus the 54-byte header). Images build in 143 s; `lint-dollyfiles`
  and `node --test` pass.

### 2026-10-09, deliverable 3, first step: an x86-64 console program under an interpreter

`demos/wine/programs/x86emu` is an x86-64 interpreter linked into `wine` like any program. It loads a
PE32+ image at its own base when that lies in the hole below the wasm data (`--global-base` is 64 MiB
for this), else relocates it; binds each import to the export of the wasm64 Wine DLL of that name; and
makes a call out of the guest with the wasm type winebuild now records per export (data directory 15 of
each module's description, and `calls.c`, one typed indirect call per distinct signature). A variadic
call has its arguments re-laid from the format string, since a guest uses 8-byte slots and wasm64 does not.

- Measured in Chrome: Ange Albertini's hand-assembled `normal64.exe` (corkami/pocs `af2e1a07`,
  sha256 `d526f32e…`, 1,024 bytes, fetched by the test, never committed) prints
  ` * a standard PE32+ (imports, standard alignments)` through Wine's msvcrt `printf` and exits 0 through
  kernel32 `ExitProcess`. `wine x86emu --bench`: 85.9 million instructions a second (a 4-instruction loop).
- msvcrt joined the image for this; its `DllMain` read `0x7ffe0000`, where Windows has the shared user
  page: on Dolly kernel32 now reads the page ntdll allocated.
- Images build in 141.9 s; the browser test takes 18.7 s.

### 2026-10-09, deliverable 3, second step: an x86-64 compiler and a GUI program with a window procedure

The fixture became TinyCC 0.9.27's win64 binary release (savannah, zip sha256 `34a72194…`, source
release sha256 `de23af78…`; LGPL; staged as `dist/static/wine/tinycc.tar.gz`, never committed):
`tcc.exe` (23 KB) and `libtcc.dll` (156 KB) are x86-64 code its maintainers built with mingw-w64 GCC.
It ships unmodified in the image under `/usr/share/wine/x86/tcc`. The corkami sample is no longer used.

What x86emu gained for it:

- x86 DLLs: an import whose DLL lies beside the program is loaded, relocated and bound guest to
  guest, and its entry point called (`libtcc.dll` is linked at 0x62180000, above the hole).
- Data imports (`_acmdln`, `_fmode`, `__initenv`): winebuild marks exported variables `data`, and the
  import slot gets the variable's address.
- Calls back into the guest, each through a wasm function of ours that runs the interpreter nested:
  16 window procedures (`RegisterClass[Ex][AW]`), `qsort`'s comparison, `_initterm`'s table,
  `_onexit` functions run at `exit`. `_setjmp` fills a Windows `_JUMP_BUFFER` from guest registers.
- What Wine must not answer for itself: `__getmainargs`, `GetCommandLine`, `GetModuleHandle(NULL)`
  and `GetModuleFileName` are the guest's; exception filters, function tables and the math-error
  handler are not registered (nothing would call them).
- Instructions: `scas`, `cmps`, `lods`, absolute moves, `bt*`, `shld`/`shrd`, `cmpxchg`, `xadd`,
  `bsf`/`bsr`, `bswap`, `pushf`/`popf`, the lock prefix, the x87 control word. scanf's arguments
  are laid out as pointers.

Measured in Chrome (`node demos/wine/test/wine-browser.mjs`, 19.5 s, passes):

- The image build itself runs `tcc.exe` under x86emu to compile TinyCC's `examples/hello_win.c`
  into `/usr/share/wine/x86/hello_win.exe` (5,120 bytes): 50.6 million instructions.
- Start menu > "Hello_win (x86-64)": the desktop starts `x86emu` as a program thread; the window
  appears centred (`"HELLO_WIN" at 460,280 foreground` in the desktop's list), its window procedure
  paints yellow text on black (more than 40 such pixels read from the frame), and Escape, handled in
  that procedure, destroys it.
- In the shell, `tcc.exe` compiles `examples/fib.c` to `C:\fib.exe`, and `wine x86emu 'C:\fib.exe' 24`
  prints `fib(24) = 46368`.
- `wine x86emu --bench`: 82 to 112 million instructions a second across runs on a loaded machine.
- Firefox, run once with the same test: passes in 21.0 s, 107.6 million instructions a second.
- Images build in 148.3 s. The task buttons had been ordered by window handle, which Wine reuses:
  they now keep the order the windows appeared in.

Not done, and how it fails: README, "x86-64 programs". The one that matters most is callbacks:
any guest function handed to Wine other than the kinds above is called as a wasm table index and
traps, which ends every program of the process. A general fix is a thunk per callback-taking
argument, generated from prototypes as the calls out are; the spec files do not say which
arguments are functions, so that needs the headers.

### 32-bit x86: assessed, not started

The interpreter would need a 32-bit decoding mode (no REX, `inc`/`dec` at 40-4F, `fs` for the TEB,
stdcall and cdecl frames): a few hundred lines. Addresses are not the problem today: every pointer
in this process is below 4 GiB as long as the memory is capped there. The problem is layout. This
Wine's DLLs are wasm64: every structure with a pointer, handle or `LONG_PTR` has another layout
than the 32-bit guest's, in both directions and inside messages (`CREATESTRUCT`, `WINDOWPOS`,
`NMHDR`, `MSG`, …), and Wine 4.0 has no boundary at which to convert: it would be a thunk per
Win32 function with such an argument (kernel32, user32, gdi32 and msvcrt export about 3,900
names) plus message conversion both ways, the shape of Wine's 16-bit thunks (`user.exe16`'s
message code alone is 2,693 lines for far fewer messages). A demo set for one program is a
day; coverage is not reachable this way.

The route that scales is modern Wine's: from 8.0 its DLLs are PE files and only about a thousand
`Nt*` and `NtUser*`/`NtGdi*` calls cross to the Unix side, with `wow64*.dll` converting 32-bit
callers at exactly that boundary. Under an emulator that means: Wine's own i386 PE DLLs (from a
pinned upstream build) run as guest code, the Unix side (`ntdll.so`, `win32u.so`, a display driver)
is wasm64, and nothing is thunked by hand. Its costs are a port of a current Wine's Unix side and
an emulator fast enough to run user32 and gdi32 themselves interpreted; at 100 million
instructions a second that is slow, and a translator to WebAssembly would need a way to
instantiate generated modules, which is a new host capability and so an owner decision.

### State after phase 2

Runs in Chrome: the desktop with taskbar, Start menu and clock; Notepad, WineMine, ReactOS Paint
and an x86-64 program side by side; file dialogs; the x86-64 TinyCC compiling and its output
running. No core change was made. The one core operation Wine would use is still descriptor
passing on `sockets@0` (above), for real processes.

Next step, if x86 is to grow: generate callback thunks from the headers, add SSE2 scalar
arithmetic (floating point), then pick a real program and follow its missing instructions and
imports. If more programs of this Wine are wanted instead: ole32 and rpcrt4.
