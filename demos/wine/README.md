# Wine

Wine 4.0.4 brought up inside Dolly as a feasibility study: Wine's own
programs and DLLs, compiled from Wine's source for wasm64 by Dolly's `cc`
and linked with `wineserver` into one executable. Notepad and WineMine open
their windows on the Dolly display and take the mouse and the keyboard.
The task, with every measurement, is
`tasks/20261008-145108-wine-bringup/TASK.md`.

**It does not run Windows binaries.** A `.exe` or `.dll` from anywhere else
is x86 machine code, Wine is not a CPU emulator, and Dolly has no x86. What
runs is what this image compiled: `notepad`, `winemine` and `hello`.

## Images

- `wine-build`: the build. Wine's `widl`, `wrc`, `wmc` and `winebuild`,
  then 14 DLLs (`ntdll`, `kernel32`, `advapi32`, `gdi32`, `user32`,
  `version`, `usp10`, `imm32`, `comctl32`, `comdlg32`, `shell32`, `shlwapi`,
  `uxtheme`, `winspool.drv`), the display driver `winedolly.drv`, the
  programs and `wineserver`, linked as `/usr/bin/wine` (21 MB) on
  `system-tools` with the FreeType that `zero-ad-deps` built. Wine's source
  as built stays under `/usr/src/wine`, the port under `/usr/src/dolly/wine`.
- `wine`: `/wine/` starts Notepad; when it exits, a shell where
  `wine winemine` and `wine hello` run.

Build with `npm run image -- wine` (the build image takes about three
minutes of compiling); test with `npm run test:demos -- wine`.

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

`wine-dolly.patch` (24 files) holds the changes to Wine itself: the
`wasm64` CPU in widl, winebuild, the headers and the server protocol;
ntdll's server connection, loader slots and virtual memory; and the two
calls through a mismatched function type found so far.

Host preparation (`prepare-wine.sh`) applies the patch and generates the
seven Bison and flex parser files, as the core does for awk; nothing is
compiled outside Dolly.

## What does not work, and how it fails

- **Another process**: `CreateProcess` fails, so no `wineboot` (the registry
  starts empty; Wine reports that it could not start it), no
  `explorer.exe`, no second program in the same desktop.
- **Windows binaries**: a PE file with code is refused
  (`STATUS_INVALID_IMAGE_FORMAT`).
- **Memory**: no allocation at a chosen address
  (`STATUS_CONFLICTING_ADDRESSES`), no write watches and no writable shared
  file mapping (`STATUS_NOT_SUPPORTED`); a file view is a private copy;
  decommitted pages are cleared but stay; page protection, guard pages and
  stack overflow detection do not exist in WebAssembly.
- **Threads**: `SuspendThread`, `TerminateThread` on another thread and
  thread contexts cannot be delivered (no directed signal, no registers).
  The server records such a thread as suspended or dead while it runs on:
  this is the one place where an unsupported operation does not fail
  explicitly yet.
- **Exceptions** are those a program raises; a fault ends the process.
- **Function pointer casts** that x86 tolerates trap in WebAssembly
  ("function signature mismatch"). Timers were one; more will be found by
  use, each needs a patch.
- **Not built**: bitmap fonts (`.fon`), translations, registration scripts
  and type libraries; clipboard, printing, sound, networking, OpenGL.
- Not tried: the file dialogs, which reach into ole32.

## Licences

Wine is LGPL-2.1-or-later (`/usr/share/licenses/wine`); the port files that
replace or extend Wine files carry the same licence, the rest are MIT.
FreeType (under its GPL option) and libpng are linked in. The source as
built ships in `wine-build`.
