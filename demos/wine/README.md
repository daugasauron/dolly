# Wine

Wine 4.0.4 brought up inside Dolly as a feasibility study: Wine's own
programs and DLLs, compiled from Wine's source for wasm64 by Dolly's `cc`
and linked with `wineserver` into one executable. It boots into a desktop
with a taskbar and a Start menu; Notepad, WineMine, ReactOS's Paint, the
NetSurf web browser and GIMP 2.2 open side by side on the Dolly display and
take the mouse and the keyboard, and a Command Prompt runs Wine's `cmd`. The
tasks, with every measurement, are
`tasks/20261008-145108-wine-bringup/TASK.md` and
`tasks/20261010-114236-netsurf/TASK.md`.

**Windows binaries run only under an interpreter.** A `.exe` from anywhere
else is x86 machine code and Dolly has no x86. Wine's programs here are
what this image compiled (`desktop`, `notepad`, `winefile`, `winemine`,
`mspaint`, `netsurf`, `gimp`, `wineconsole`, `cmd`, `hello`); `x86emu` interprets small x86-64 programs against these DLLs
(below). 32-bit programs do not run.

## Images

- `wine-build`: the build. Wine's `widl`, `wrc`, `wmc` and `winebuild`,
  then 16 DLLs (`ntdll`, `kernel32`, `advapi32`, `gdi32`, `user32`,
  `version`, `usp10`, `imm32`, `comctl32`, `comdlg32`, `shell32`, `shlwapi`,
  `shcore`, `uxtheme`, `winspool.drv`, `msvcrt`), the display driver
  `winedolly.drv`,
  the programs and `wineserver`, linked as `/usr/bin/wine` on
  `system-tools` with the FreeType that `zero-ad-deps` built. Wine's source
  as built stays under `/usr/src/wine`, the port under `/usr/src/dolly/wine`.
  The build ends by running TinyCC's x86-64 compiler under `x86emu` to make
  the Start menu's x86-64 sample.
- `wine`: `/wine/` starts the desktop (`wine desktop`); Shut Down in its
  Start menu leaves a shell, where `wine hello`, `wine notepad`,
  `wine x86emu` and `wine desktop` run.

Build with `DOLLY_BUILD_IMAGES=wine-build,wine npm run image` (both images
in about 350 s); test with `npm run test:demos -- wine`.

## Paint

Wine has no Paint. `programs/mspaint` builds ReactOS's, from the 0.3.17
release (the last line in which it is plain C; LGPL): 45 files fetched at a
pinned commit and checked against `mspaint.sha256`. It is a
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
  shell32's folder lookup needs ole32. NetSurf opens its own files
  (`Choices`, cookies, history) with the C library, which is Dolly's and
  takes Unix names: it is given that directory's Unix name and its own
  Unix file operations, and `file:` addresses are Unix paths. Before that
  nothing in `C:\NetSurf` was ever read or written;
- copying text converts it with a flag Windows refuses for UTF-8
  (`MB_PRECOMPOSED`): nothing reached the clipboard;
- the address is written clear of the page info button, which it overlapped
  by three pixels;
- `<io.h>` and its own `realpath` are left out;
- in its curl fetcher: a multipart post fails instead of posting something
  else; `site:` is registered and accepted without a host; the body is kept
  until libcurl has named the last address (above).

Not done: downloads to a file and the settings dialogs were not tried; the
toolbar's activity animation does not show; File > Open's dialog answers
with a Windows path, which the Unix file operations do not take.

## GIMP

`programs/gimp` builds GIMP 2.2.17, the last release of the series that needs
no cairo, GEGL or babl, as one program of this Wine: its toolbox, docks and
image windows, the paint and selection tools, layers, text, and XCF files.
It is here because an old GIMP is what runs compiled to asm.js in Gary
Bernhardt's talk "The Birth and Death of JavaScript". Under it, from their
pinned releases, are GLib 2.12.13, ATK 1.9.1, Pango 1.14.10, GTK+ 2.6.10 (the
last that draws without cairo), libart 2.3.17, fontconfig 2.3.2 and Expat
2.7.1: about 1,170 files, compiled as released but for five
(`gimp-dolly.patch`).

Measured in Chrome: the toolbox is drawn 0.8 s after the Start menu's key;
the test paints a stroke, saves it as XCF, quits, starts GIMP again and
opens the file. The image grew by 12.0 MB (191.1 MB); the build takes
about 150 s longer.

- **No plug-ins.** A GIMP plug-in is a process and this Wine has one.
  Everything that is a plug-in in 2.2 is therefore missing: every file
  format but XCF (opening or saving a PNG answers "Unknown file type"), the
  filters, Script-Fu, the help browser. Its plug-in, module and script
  directories are empty and their scan finds nothing.
- **GLib is the Unix GLib**, on Dolly's C library, without threads: GIMP's
  files are Unix paths (`/usr/share/gimp/2.0`, `/etc/gimp/2.0`,
  `~/.gimp-2.2`, and what its file dialogs browse). GDK and Pango's backend
  for GTK+ are the Windows ones, over GDI and USER of this Wine; `gwin32.c`
  is compiled in its flavour for a Unix C library over the Windows API
  (Cygwin's) for the three helpers they call. `config.h`, `glibconfig.h`,
  `gdkconfig.h`, `gmoduleconf.h` and `expat_config.h` are what configure
  would write for Dolly; `win32.h` is included before each file written for
  the Windows API (16-bit `wchar_t`, pointer-sized window longs, no COM).
- **No loadable modules**: `g_module_open` answers that the system has none.
  Pango's basic shapers and gdk-pixbuf's PNG and XPM loaders are built in;
  theme engines, input methods and GIMP's modules are not built.
- **The main loop waits for Windows messages** through a poll function GLib
  is given at start (`main.c`): GDK's backend expects Windows' GLib there.
  GIMP's `exit` ends its thread, not the desktop.
- **Function pointers of another type.** GLib, GTK+ and GIMP call every class
  and instance initializer, most signal handlers and every `g_list_foreach
  (list, (GFunc) g_free, NULL)` through a pointer whose type has more
  arguments than the function, which WebAssembly refuses ("function signature
  mismatch") at the first `g_object_new`. Dolly's `cc` has no pass that
  emulates such calls, so `icall` (`icall.c`, built with the other tools)
  rewrites each object file of this module: a `call_indirect` of type T
  becomes a call of a thunk `__icall_T`, generated for all objects together
  (191 types). The thunk calls the function directly when its type is T;
  otherwise the function is called with its own type, its integer parameters
  taking the caller's integer arguments in order and its floating-point
  parameters the floating-point ones, as the registers of a processor would
  (`port/icall.c`). Which type a function has is read once from
  `/usr/bin/wine` itself: its element segment names the function behind each
  pointer. Calls that Wine makes into this code are not covered and must
  have Windows' exact types.
- **Text** is drawn by Pango's FreeType backend with fonts fontconfig finds:
  the system's and Wine's (`/etc/fonts/fonts.conf`; `local.conf` prefers
  Tahoma, the one text font among them). The OpenType code of that backend
  (HarfBuzz of 2006) is taken under its GPL option: until Pango 1.14 it was
  under the FreeType licence alone, which is why Pango and GLib are newer
  than GTK+ here.
- **Generated sources** are written during the build by the libraries' own
  generators, built there as programs of their own from the module's objects:
  `glib-genmarshal` (ATK's marshallers), `gdk-pixbuf-csource` (GIMP's 330
  icons and cursors) and libart's `gen_art_config`. Host preparation only
  cuts the lists of those icons out of GIMP's makefiles and has perl write
  two alias files.
- **The personal folder** `~/.gimp-2.2` is in the image as GIMP's first-run
  wizard makes it, so the toolbox opens at once (the wizard itself works: it
  runs when the folder is missing). The tip of the day opens with it, as in
  any GIMP of the time.
- **The keyboard**: GDK asks Windows for the whole layout once, and this Wine
  knows what a key types only from when it was last pressed, so GDK makes its
  table again at each key. A window GIMP opens takes the keyboard once it is
  clicked, like every window on this desktop.

`gimp-dolly.patch`: libpng's `png_jmpbuf` instead of its structure's field
(gdk-pixbuf's PNG loader is of libpng 1.2's time); GDK's timer procedure takes
`UINT_PTR`, the type Wine calls it with, and its key table is made again at
each key; `<io.h>` is not included; three wide string literals in `gwin32.c`
are 16-bit; fontconfig reads a font's OpenType scripts and format through
FreeType's public calls, where it used internals FreeType no longer shows.

Wine itself changed in one place for it: GDI handles and window handles now
have generations in separate ranges, so a bitmap's handle never equals a
window's. Windows guarantees that and GDK keeps both kinds in one table;
without it GDK took windows for pixmaps within seconds.

Not done: plug-ins as threads (each would need its own copy of libgimp's
static state and a pipe pair to the core in place of `fork` and `exec`;
GIMP's wire protocol itself needs no process); printing; drag and drop from
other programs; the icon theme GTK+'s file dialog asks for (its folder icons
are GTK+'s stock ones); a font with an italic.

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

## The terminal

"Command Prompt" on the Start menu and the desktop is Wine's own `cmd` in
the window of Wine's own `wineconsole` (its user32 backend): 80 columns by 25
lines, with kernel32's line editing and history. `dir`, `cd`, `type`, `echo`,
`cls`, redirection and batch files are cmd's. It starts in the user's
directory, `Z:\home\dolly`, with TinyCC on its `PATH`.

**Programs start by name, as threads.** A command that names a program
linked into this Wine (`notepad hello_win.c`, `winemine`, `mspaint`, `gimp`,
`hello`) starts it with its arguments; a path to an x86-64 `.exe`, or its
name where cmd looks for one (the directory, then `PATH`), runs under
`x86emu`. cmd waits for a program of the console subsystem and has its exit
code in `%errorlevel%`; one with a window leaves the prompt free. Which of
the two an x86-64 file is, cmd reads from its header.

**Edit, compile, run.** `hello_win.c`, the source of the Start menu's x86-64
sample (TinyCC's example), is in the user's directory, since that is where a
user's files are and where the terminal starts:

    notepad hello_win.c
    tcc hello_win.c
    hello_win

Notepad edits and saves it, the x86-64 TinyCC compiles it under the
interpreter (0.6 to 0.8 s in Chrome), and the result opens its window.

What one process makes of it:

- a program's output is in the console when it writes through Windows'
  standard handles: `hello`'s first line, and all of an x86-64 program, whose
  C runtime is Wine's msvcrt (its standard files follow the handles of the
  moment, so `tcc -v > file` and `2> file` work, and it writes them out when
  a program exits). What a program of this Wine prints with the C library's
  `printf` goes to the Dolly terminal behind the desktop: the rest of `hello`;
- `start` answers that this Wine has no process to start;
- a second x86-64 program while one runs, and a second `cmd` (`cmd /c …`),
  are refused with a message: each program runs once at a time;
- the current directory is the process's: the file manager and the file
  dialogs move it for every program. cmd keeps its own and puts it back
  before each command, and the desktop starts each program in the user's
  directory;
- pipes are cmd's: through a temporary file, one command after the other;
- Ctrl+C interrupts nothing: no signal reaches a thread;
- closing the window ends `cmd` when it next reads a line: at once at the
  prompt, after the console program it is waiting for otherwise.

For it Wine changed in four places (`wine-dolly.patch`): the server attaches
a console to the process of its own renderer; `wineconsole` starts the
program as a thread, makes the console's handles the process's standard
ones while it runs, and ends with it; `cmd` starts programs as above; and
msvcrt as said. The console's font is the terminal's Iosevka, linked into
Wine's font directory: Wine's own fonts of fixed width are bitmap fonts,
which this image does not build. NetSurf's fixed-width text is drawn in it
too.

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
  it, started as a thread with the path (`port/shell32-dolly.c`, where
  `ShellExecute` would start a process): a `.bmp` by Paint, an `.exe` by
  `x86emu`, a shortcut by its target, anything else as text by Notepad. If
  that program is already running, the file manager says it is busy;
- `GetLogicalDrives` reads the drives from the prefix's `dosdevices` links:
  Wine has them from mountmgr, a driver in a process of its own. (The file
  dialogs' drive lists come from the same call.)
- shell32 allocates with ole32's task allocator, which is the process heap
  (`port/shell32-dolly.c`), and tells listeners of changes only when there
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

**The desktop is a folder.** Its icons are the files of the user's Desktop
folder, the one shell32 names for `CSIDL_DESKTOPDIRECTORY`:
`Z:\home\dolly\Desktop`, which is `/home/dolly/Desktop` on the Dolly side.
The desktop puts it there (the registry's "User Shell Folders") so that the
prompt, which starts in `Z:\home\dolly`, reaches it as `Desktop`, and the
file manager under `home\dolly`. The folder is listed four times a second
and the icons are made again, by name, when the names have changed: nothing
tells this Wine of a change in a directory. They are a comctl32 list view in
a window of the shell's that covers the work area and puts itself back under
every other window whenever something raises it; the icons with their names,
the selection by a click, the rubber band from the empty desktop, Ctrl+click
and the keyboard are that control's.

A double click or Enter opens an icon as the file manager opens a file. The
image's eight are shortcuts, one to each program of the Start menu: real
`.lnk` files, read and written by shell32's own shortcut object, which it
makes without ole32 (`wine desktop /shortcuts` writes them when the image is
built). Two ways put a compiled program there: `copy hello_win.exe Desktop`
at the prompt, or "New Shortcut..." in the menu of a right click on the
desktop, which asks for the file in the file dialog and writes a shortcut to
it. For shell32's file streams, which are shcore's in Wine 4.0, shcore is
built too.

What is not there: of a shortcut the target and the arguments are used, not
its icon, working directory or window state (a program of this Wine shows
its own first icon, an x86-64 file the generic one, since its own is not
read); a shortcut is saved with its target's path alone, where ole32 would
help add an item list; for each one saved shell32 tries to start
`winemenubuilder`, a process, which fails with a line in the terminal behind
the desktop; and an icon cannot be dragged, renamed or deleted on the
desktop: the prompt (`del Desktop\hello_win.lnk`) and the file manager do
that.

**Programs are threads.** With one process, the Start menu starts a program
linked into this Wine as a thread of the desktop's process
(`port/kernel32-program.c`): for that thread `GetModuleHandle(NULL)`, the
resources, `GetCommandLine` and the arguments of `main` are the program's,
and `ExitProcess` ends the thread. Before each start the program's static
data is put back as it was linked, and the window classes of its last run
are unregistered (an x86-64 program's when the next one is loaded where it
was). What this is not:

- a crash (a trap) in one program ends all of them and the desktop;
- a program runs once at a time (its static data exists once): the desktop,
  the prompt and the file manager refuse a second start with a message;
- threads a program creates see the desktop as their process, and they, its
  handles and its heap blocks are not released when it exits;
- `exit()` or `TerminateProcess` on itself ends everything;
- programs cannot start each other: `CreateProcess` still fails. Only the
  desktop, the file manager and `cmd` start programs, by this means.

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
- **One namespace.** 57 names are defined by more than one module
  (`shared-names.txt`: `DllGetVersion`, `StrChrW`, the controls comctl32
  copies from user32, …); each such module is compiled with its own prefix
  for them. A call to an export under a name no object defines goes to the
  first module, in link order, that exports it. Two functions of one name
  and different types are no duplicate symbol to the linker: it warns and
  lets the callers of one trap, so the link fails on any warning.
- **Modules left out** (ole32, rpcrt4, setupapi, …, mostly delay-loaded):
  the 95 functions the linked modules call in them are stubs that raise
  Wine's own "unimplemented function" exception, generated at link time.
- **Display and input** (`dlls/winedolly.drv`): each top-level window draws
  into a surface through Wine's DIB engine; one thread composes them in Z
  order over the desktop colour, presents the frame and queues Dolly's input
  records as hardware messages. The key a browser reports as typed is what
  `ToUnicodeEx` answers, so the user's layout applies. Text the page sends
  without keys (composed, or pasted) arrives as typed characters.
- **The clipboard** is Wine's own, shared by its programs: Copy in one and
  Paste in another work from their menus. Ctrl+V does not reach a program:
  the Dolly page keeps that chord for the browser's clipboard and hands its
  text on, which arrives as if typed. Nothing a program copies reaches the
  browser's clipboard: `display@0` and `input@0` have no call for it (the
  terminal's own selection has one).
- **The desktop** is the ownerless window the server makes when there is no
  `explorer.exe` (`port/user32-desktop.c` names the driver for it).

`wine-dolly.patch` (46 files, about 580 added lines) holds the changes to
Wine itself: the `wasm64` CPU in widl, winebuild, the headers and the server
protocol; ntdll's server connection, loader slots and virtual memory; where
libwine finds its directories; the two calls through a mismatched
function type found so far (thread start, timer procedures); the ranges
of GDI and window handles (see GIMP); the terminal's four (see there); and
one in the server, which merged a mouse move into the one before even when
a thread already held that one and was about to release it, so that the
last move of a drag could be lost (a window dragged in the test stopped a
step short once).

Host preparation (`prepare-wine.sh`) applies the patch and generates the
seven Bison and flex parser files, as the core does for awk; nothing is
compiled outside Dolly.

## What does not work, and how it fails

- **Another process**: `CreateProcess` fails, so no `wineboot` (the registry
  starts empty; Wine reports that it could not start it) and no
  `explorer.exe`. The desktop and `cmd` start a program of this Wine as a
  thread instead, and an x86-64 file under `x86emu`; a program cannot.
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
  and type libraries; printing, sound, OpenGL.
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
is linked with it (`/usr/share/licenses/netsurf`, `libjpeg`). GIMP is
GPL-2.0-or-later (its libgimp libraries, GLib, ATK, Pango, GTK+ and libart
LGPL-2.0-or-later, fontconfig and Expat under MIT-style licences), which
that executable's GPL, version 2, admits; Pango's OpenType code is taken
under its GPL option, not its FreeType licence (`/usr/share/licenses/gimp`).
GIMP's brushes, patterns, gradients, palettes, icons and tips are part of
its release under the same licence. TinyCC is LGPL
(`/usr/share/licenses/tinycc`);
its binaries are its maintainers', and its source release is served in the
same archive (`dist/static/wine/tinycc.tar.gz`, `/usr/src/tinycc` in
`wine-build`).
