# Wine

Wine 4.0.4 brought up inside Dolly as a feasibility study: Wine's own
programs and DLLs, compiled from Wine's source for wasm64 by Dolly's `cc`
and linked with `wineserver` into one executable. It boots into a desktop
with a taskbar and a Start menu; Notepad, WineMine, ReactOS's Paint and the
NetSurf web browser open side by side on the Dolly display and take the
mouse and the keyboard. The tasks, with every measurement, are
`tasks/20261008-145108-wine-bringup/TASK.md` and
`tasks/20261010-114236-netsurf/TASK.md`.

**Windows binaries run only under an interpreter.** A `.exe` from anywhere
else is x86 machine code and Dolly has no x86. Wine's programs here are
what this image compiled (`desktop`, `notepad`, `winefile`, `winemine`,
`mspaint`, `netsurf`, `hello`); `x86emu` interprets small x86-64 programs against these DLLs
(below). 32-bit programs do not run.

## Images

- `wine-build`: the build. Wine's `widl`, `wrc`, `wmc` and `winebuild`,
  then 15 DLLs (`ntdll`, `kernel32`, `advapi32`, `gdi32`, `user32`,
  `version`, `usp10`, `imm32`, `comctl32`, `comdlg32`, `shell32`, `shlwapi`,
  `uxtheme`, `winspool.drv`, `msvcrt`), the display driver `winedolly.drv`,
  the programs and `wineserver`, linked as `/usr/bin/wine` on
  `system-tools` with the FreeType that `zero-ad-deps` built. Wine's source
  as built stays under `/usr/src/wine`, the port under `/usr/src/dolly/wine`.
  The build ends by running TinyCC's x86-64 compiler under `x86emu` to make
  the Start menu's x86-64 sample.
- `wine`: `/wine/` starts the desktop (`wine desktop`); Shut Down in its
  Start menu leaves a shell, where `wine hello`, `wine notepad`,
  `wine x86emu` and `wine desktop` run.

Build with `DOLLY_BUILD_IMAGES=wine-build,wine npm run image` (both images
in about 190 s); test with `npm run test:demos -- wine`.

## Paint

Wine has no Paint. `programs/mspaint` builds ReactOS's, from the 0.3.17
release (the last line in which it is plain C; LGPL), unchanged: 45 files
fetched at a pinned commit and checked against `mspaint.sha256`. It is a
program for the Windows headers, not part of Wine, so it is compiled without
`__WINESRC__`. Of ReactOS's SDK it wants `<tchar.h>` and two resource
includes; ours are in `programs/mspaint/` (`tchar.h` maps its seven wide
string functions to libwine's and makes its literals 16-bit, since `cc` has
no `-fshort-wchar`). Its help file and version resource are not built.

File > Open and Save work in Paint and Notepad through comdlg32's older
dialog (the Windows 3.1 one): the Explorer-style dialog needs ole32 and the
shell's folder views, so on Dolly `GetOpenFileName` and `GetSaveFileName`
always take the older one, without the caller's Explorer template and hook
(Notepad's encoding choice is not offered) and with a single selection.

## NetSurf

`programs/netsurf` builds NetSurf 3.11 with its Windows front end, the ten
libraries of the same release that it needs (libcss, libdom, libhubbub, …)
and IJG's libjpeg as one program of this Wine: HTML and CSS, PNG, JPEG, GIF
and BMP images. No JavaScript engine is built, nor SVG or WebP.

**It fetches through Dolly's libcurl**, the `curl` package's library over
the HTTP broker (`REQUIRES HOST http@0`, which the image already declared;
NetSurf is its first use by the desktop). No contract was changed for it.
NetSurf's own `content/fetchers/curl.c` is compiled as it is, behind
`curl-dolly.h`, which names the refusals of that libcurl NetSurf can live
with (connection timing and tuning, HTTP/1.1 preference, TLS session reuse,
proxy, cookie and multipart body when turned off, two pool sizes), repeats
`curl_multi_perform` while more is ready, asks libcurl to follow redirects,
and lets only CORS-safelisted request headers through. What follows from
fetching with the browser's `fetch`:

- an address is fetched only if the page's HTTP policy admits it and the
  browser's rules do: this site's own origin, or a site that sends CORS
  headers. NetSurf's requests are made "simple" for that: its `Pragma:`
  (libcurl's way to drop a header, which reaches `fetch` as a header), its
  cache validators, `Referer` and `DNT` made the browser send a preflight,
  which static hosts do not answer, so only `Accept`, `Accept-Language`,
  `Content-Language` and a form's `Content-Type` are kept. A changed page is
  therefore fetched whole again, never revalidated. Any other, and `http:` from an `https:` page, ends in NetSurf's
  error page with libcurl's message ("Browser could not fetch the URL:
  blocked (no CORS headers, or a redirect) or unreachable …"). Most of the
  web is in that class;
- redirects are libcurl's to follow, not NetSurf's: the broker refuses one
  the request did not ask to follow. Under the page's default policy it is
  followed; libcurl names the last address only when the transfer is done,
  so NetSurf keeps the body back until then and, if the address differs, is
  redirected to it as by a 303 (one more request; the address bar and
  relative links are then right). A page therefore appears when it has
  arrived whole. Under an explicit policy rule no redirect is followed and
  the address ends in the error page;
- cookies stay with the browser: NetSurf neither sees nor sends any;
- a multipart form post fails (`CURLE_NOT_BUILT_IN`); proxies, certificate
  choices and client certificates do not exist.

**`site:/FILE`** is a file of the site this release is served from,
wherever that is: the broker takes the path `/vVERSION/FILE` for it and
never tells a program the origin, so NetSurf has a scheme for it, fetched by
the same curl fetcher. The version is the one the image was built for
(`version.h`, staged as `amy`'s is). `site:/` is the release's landing page;
its relative links stay in the scheme (`site:/licences/`). The home page is
`https://www.w3.org/`, the owner's choice among the few well-known sites
that let another origin read them.
NetSurf spells such an address `site:///…`, as it does `file:///…`. Where
the site itself redirects a `site:` address (a directory without its slash),
the broker still reports the path asked for, and relative links resolve
against that. The landing page's
links to image pages lead to JavaScript applications, of which NetSurf, with
no JavaScript engine, shows the empty dark background; Back returns.

Measured in Chrome with a local server: a page with its style sheet, a PNG
and a JPEG is drawn 210 ms after Enter. The image grew by 2.9 MB (178.9 MB);
the build compiles 790 more files and takes 27 s longer. The page's renderer
process holds 570 MiB with the desktop and 595 MiB with NetSurf open.

`prepare-netsurf.sh` generates on the host what NetSurf's makefiles generate
(perl for two tables and the messages, a pinned gperf for one table, libcss's
own `gen_parser` for 119 parsers); `netsurf-dolly.patch` changes nine files:

- five dialog procedures return `INT_PTR`: as `BOOL` their WebAssembly type
  is not the one Wine calls;
- four wide strings are 16-bit (`cc` has no `-fshort-wchar`);
- `main`'s arguments replace `CommandLineToArgvW`, which this Wine's shell32
  forwards to a DLL that is not linked;
- its settings live in `C:\NetSurf` and no download directory is preset:
  shell32's folder lookup needs ole32;
- `<io.h>` and its own `realpath` are left out;
- in its curl fetcher: a multipart post fails instead of posting something
  else; `site:` is registered and accepted without a host; the body is kept
  until libcurl has named the last address (above).

Not done: downloads to a file and the settings dialogs were not tried; the
toolbar's activity animation does not show; Select All and Edit > Copy run
but the text reaches no clipboard.

## x86-64 programs

`programs/x86emu` is an x86-64 interpreter linked into `wine` like any
program. It loads a PE32+ image into the process's own memory (at its base
when that lies in the 64 MiB left free below Wine's data, else relocated),
interprets its code, and binds what it imports to the functions of the
wasm64 DLLs above: `winebuild` records each export's WebAssembly type, and a
call out of the guest takes its arguments from the Win64 registers and stack
and is made with that type. An x86 DLL beside the program is loaded the same
way. Wine cannot call a guest address, so where the guest hands Wine a
function, Wine gets one of x86emu's that runs it: window procedures of
registered classes, `qsort`'s comparison, the C runtime's initializer and
exit tables.

What ships to run under it is TinyCC 0.9.27's win64 binary release,
unmodified (`/usr/share/wine/x86/tcc`, pinned by checksum; `tcc.exe` and
`libtcc.dll` are x86-64 code its maintainers built with mingw-w64 GCC), and
`hello_win.exe`, which that compiler built from its own example while the
image was made. The Start menu lists the `.exe` files of
`/usr/share/wine/x86`. In the shell:

    wine x86emu 'Z:\usr\share\wine\x86\tcc\tcc.exe' -o 'C:\fib.exe' 'Z:\usr\share\wine\x86\tcc\examples\fib.c'
    wine x86emu 'C:\fib.exe' 24

Measured in Chrome: about 85 million instructions a second (`wine x86emu
--bench`); compiling `hello_win.c` with its `windows.h` is 50.6 million
instructions.

It is an interpreter for small programs, not a Windows machine:

- integer instructions and the SSE moves; no x87 or SSE arithmetic, so no
  floating point. An instruction it lacks ends the program with its bytes
  named;
- one thread; no exceptions (a guest's filters, function tables and
  math-error handler are not registered), no TLS callbacks;
- any callback other than those above is a guest address handed to
  WebAssembly: it traps, which ends the desktop too. `SetWindowLongPtr`
  subclassing, dialogs, timers with a procedure and `CreateThread` are in
  that class;
- an import this Wine lacks is reported when it is called;
- one x86-64 program at a time, like every program here;
- 32-bit x86 is refused. Its pointers are half the size of this Wine's, so
  every structure and message crossing between guest and DLL would need
  converting; the task file has the assessment.

## The file manager

Wine's own `winefile` (the Start menu's "File Manager") browses what the
prefix sees: drive `Z:` is the Dolly filesystem, `C:` the prefix's
`drive_c`, and the `/` button its Unix view. Directories open on a
double-click, `..` leads back; Move, Copy and Delete are shell32's file
operations with their question dialogs. Four things had to change for a Wine
without ole32, mpr and other processes (`wine-dolly.patch`):

- it does not start COM or take the shell's desktop folder: the "Shell"
  namespace button is gone, and the context menu, which is the shell
  folder's, answers "not supported", as do Run, the network drive dialogs
  and Help;
- a double-clicked file is opened by the program of this image that reads
  it, started as a thread with the path: a `.bmp` by Paint, an `.exe` by
  `x86emu`, anything else as text by Notepad. If that program is already
  running, the file manager says it is busy;
- `GetLogicalDrives` reads the drives from the prefix's `dosdevices` links:
  Wine has them from mountmgr, a driver in a process of its own. (The file
  dialogs' drive lists come from the same call.)
- shell32 allocates with ole32's task allocator, which is the process heap
  (`port/ole32-taskmem.c`), and tells listeners of changes only when there
  are some, as turning a path into an item list is ole32's.

It also showed that libwine's wide `printf` read every integer argument as
a pointer, which WebAssembly's variable arguments do not allow: each number
Wine formatted that way (dates, sizes) was wrong until that was patched.

## The desktop

`programs/desktop` is ours, not Wine's `explorer.exe` (which wants shell32,
ole32 and a process per program): a taskbar window with a Start button, a
button per top-level window and a clock, drawn with user32 and gdi32. Moving,
resizing, minimizing and closing windows is Wine's own non-client code; the
driver brings a clicked window to the front and gives it the foreground, as
a window manager would, and a minimized window is hidden until its button is
clicked (`ARW_HIDE`, added to user32).

**Programs are threads.** With one process, the Start menu starts a program
linked into this Wine as a thread of the desktop's process
(`port/kernel32-program.c`): for that thread `GetModuleHandle(NULL)`, the
resources, `GetCommandLine` and the arguments of `main` are the program's,
and `ExitProcess` ends the thread. Before each start the program's static
data is put back as it was linked, and the window classes of its last run
are unregistered. What this is not:

- a crash (a trap) in one program ends all of them and the desktop;
- a program runs once at a time (its static data exists once);
- threads a program creates see the desktop as their process, and they, its
  handles and its heap blocks are not released when it exits;
- `exit()` or `TerminateProcess` on itself ends everything;
- programs cannot start each other: `CreateProcess` still fails.

## How it is put together

Dolly gives a program threads and local sockets, but no `fork`, no second
process it could hand a descriptor to, no `dlopen` in a threaded program,
no `mmap` at a chosen address and no assembler. So:

- **One process.** Every module is linked statically into `wine`, each with
  the image `winebuild` wrote for it. Wine 4.0's loader already accepts
  modules that register themselves from a constructor; `port/libwine.c`
  replaces only its `dlopen` half.
- **`wineserver` is a thread** (`port/main.c`). Its `main` is unchanged and
  is reached over its Unix socket as always. It keeps a working directory of
  its own (`port/server-cwd.c`), and a descriptor "sent" either way is a
  `dup` whose number travels in the message.
- **`winebuild` writes C** (`winebuild-dolly.c`, a `wasm64` target): the PE
  headers, export directory, resources and import list of a module as one
  initialized object. A wasm function pointer carries its exact type and a
  spec file names no return types, so the types of the exports are read
  from the wasm objects. An export's RVA names a slot that holds the
  pointer, since a wasm function has no address in memory.
- **One namespace.** 85 names are defined by more than one module
  (`shared-names.txt`: `DllGetVersion`, `StrChrW`, the controls comctl32
  copies from user32, …); each such module is compiled with its own prefix
  for them. A call to an export under a name no object defines goes to the
  first module, in link order, that exports it.
- **Modules left out** (ole32, rpcrt4, setupapi, …, mostly delay-loaded):
  the 95 functions the linked modules call in them are stubs that raise
  Wine's own "unimplemented function" exception, generated at link time.
- **Display and input** (`dlls/winedolly.drv`): each top-level window draws
  into a surface through Wine's DIB engine; one thread composes them in Z
  order over the desktop colour, presents the frame and queues Dolly's input
  records as hardware messages. The key a browser reports as typed is what
  `ToUnicodeEx` answers, so the user's layout applies.
- **The desktop** is the ownerless window the server makes when there is no
  `explorer.exe` (`port/user32-desktop.c` names the driver for it).

`wine-dolly.patch` (36 files, about 450 added lines) holds the changes to
Wine itself: the `wasm64` CPU in widl, winebuild, the headers and the server
protocol; ntdll's server connection, loader slots and virtual memory; where
libwine finds its directories; and the two calls through a mismatched
function type found so far (thread start, timer procedures).

Host preparation (`prepare-wine.sh`) applies the patch and generates the
seven Bison and flex parser files, as the core does for awk; nothing is
compiled outside Dolly.

## What does not work, and how it fails

- **Another process**: `CreateProcess` fails, so no `wineboot` (the registry
  starts empty; Wine reports that it could not start it), no
  `explorer.exe`, no second program in the same desktop.
- **Windows binaries**: Wine's loader refuses a PE file with code
  (`STATUS_INVALID_IMAGE_FORMAT`); only `x86emu` loads one, within the
  limits above.
- **Memory**: no allocation at a chosen address
  (`STATUS_CONFLICTING_ADDRESSES`), no write watches and no writable shared
  file mapping (`STATUS_NOT_SUPPORTED`); a file view is a private copy;
  decommitted pages are cleared but stay; page protection, guard pages and
  stack overflow detection do not exist in WebAssembly.
- **Threads**: thread contexts, `SuspendThread` and `TerminateThread` on
  another thread are refused (`STATUS_NOT_SUPPORTED`): a WebAssembly thread
  has no registers to read and no signal reaches one thread.
- **Exceptions** are those a program raises; a fault ends the process.
- **Function pointer casts** that x86 tolerates trap in WebAssembly
  ("function signature mismatch"). Timers were one; more will be found by
  use, each needs a patch.
- **Not built**: bitmap fonts (`.fon`), translations, registration scripts
  and type libraries; clipboard, printing, sound, networking, OpenGL.
- **ole32** is not linked, so anything that reaches into it (drag and drop,
  the Explorer-style file dialog, which is replaced as described above) ends
  with Wine's "unimplemented function" exception; in a program started from
  the desktop that ends the desktop too.

## Licences

Wine is LGPL-2.1-or-later (`/usr/share/licenses/wine`); the port files that
replace or extend Wine files carry the same licence, the rest are MIT.
FreeType (under its GPL option) and libpng are linked in. The source as
built ships in `wine-build`. NetSurf is GPL-2.0-only (with the OpenSSL exception of its
`COPYING`; its libraries are MIT) and is linked into `/usr/bin/wine`, which
as a whole is therefore distributed under the GPL, version 2; IJG's libjpeg
is linked with it (`/usr/share/licenses/netsurf`, `libjpeg`). TinyCC is LGPL
(`/usr/share/licenses/tinycc`);
its binaries are its maintainers', and its source release is served in the
same archive (`dist/static/wine/tinycc.tar.gz`, `/usr/src/tinycc` in
`wine-build`).
