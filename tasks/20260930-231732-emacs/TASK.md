# Add an Emacs image

- STATUS: CLOSED
- PRIORITY: 310
- TAGS: demo,editor,image

Owner request (2026-10-01): an Emacs image, built inside Dolly from pinned
upstream GNU Emacs sources, like the Neovim demo (`demos/neovim/`: build image,
runtime module, image that enters the editor, browser test).

## Expect to need (check each against upstream before patching)

- Terminal Emacs only (`--without-x`, `-nw`): termios and a terminfo/ncurses
  (or Emacs' termcap fallback) inside the image.
- The build runs `temacs` to produce the portable dump (`pdump`) and
  byte-compiles the Lisp tree: many spawned Dolly processes and a large memory
  peak; measure both.
- Subprocesses (`M-x shell`, `compile`, `M-!`): Dolly has no `fork`/`exec`;
  Emacs uses `posix_spawn` where configure finds it, which Dolly supports.
- Timers: Emacs uses `setitimer`/`timer_create` for its atimers; Dolly's
  `alarm()` path is unresolved (`20260930-100000-audit-06`). Timers must work
  or fail explicitly, not silently.
- Sockets fail explicitly (no `M-x package-install` from ELPA until an HTTP
  path exists; see `20260930-225918-pip-http` for the broker approach).

## Done when

- `demos/emacs/` owns the recipes, sources, preparation hook, README and test;
  the `emacs` image opens into Emacs; a browser test in Chrome and Firefox
  edits and saves a file, runs `M-!` and a shell command, and exits back to
  Slop; the image builds from a fresh `npm run image -- emacs`.

## Owner priority (2026-10-01, 23:10)

Raised: "I want to make it higher priority to have an emacs image (or
package?)". Decision: Emacs is a Dollyfile 6 `PACKAGE` named `emacs`, so
recipes `INSTALL` it and `amy install emacs` works in any session, plus an
`emacs` application that opens into it, like Neovim. Agent branch `work/emacs`
from the Dollyfile 6 checkpoint `2e0d3cd`.

## Findings (work/emacs, 2026-10-02)

Built: GNU Emacs 31.1 (release tarball, GPG-verified, `DOLLY_EMACS_*` pins) as
the package `emacs` (`demos/emacs/Dollyfile-emacs`) and the application
`gnu-emacs` (an image cannot share the package's name). Host preparation
(`prepare-emacs.sh`) patches and runs `configure` in the pinned emsdk
container; Dolly compiles all C, dumps with pdumper and installs.

- Configure: unported system, so the patch adds `opsys=dolly` for
  `wasm64-*-emscripten*` (`system-type` is `dolly`). Results where emsdk's
  JavaScript libc differs from Dolly, or cross guesses are wrong, are stated:
  getrandom yes, malloc_trim/sysinfo/pthreads/FIONREAD no, fchmodat works.
- Terminal: no terminfo library; Emacs's own `termcap.c` (the MS-DOS path) with
  a 256-colour `/etc/termcap` entry. Dolly had no `/dev/tty` and its fds 0-2
  are one-way, so the kernel now opens `/dev/tty` read-write as the shared
  terminal (kernel-only, images reused). Dolly ignores `c_cc`, so Emacs clears
  ISIG and reads `C-g`; process groups do not exist, so Emacs always resets
  the terminal on exit.
- Processes: `posix_spawn` works once Emacs drops `POSIX_SPAWN_SETSID` and the
  `WUNTRACED|WCONTINUED` wait options (Dolly returns ENOTSUP for both; Emacs
  then read exit status 0). `M-!`, `call-process`, `make-process`, `M-x
  compile` work; `M-x shell` fails explicitly (Slop rejects `-i` and reads a
  piped stdin to EOF). No PTYs (HAVE_PTYS off).
- Timers: atimers use `setitimer(ITIMER_REAL)`; `run-with-timer` fires. `C-g`
  cannot stop a pure Lisp loop: handlers run only at system calls.
- GC: an `-O2` temacs crashes in `print_object` during loadup (conservative
  stack scan misses Wasm locals); `-O0` builds, dumps and passes a
  `garbage-collect` check.
- Dump: pdumper works through the heap path (Dolly's mmap rejects MAP_FIXED;
  cross configure leaves HAVE_MMAP off). Batch startup 0.05 s with the dump,
  1.8 s without (temacs loading the preloaded .elc). Chosen: pdumper.
- Byte compilation: per-file works (simple.el 2.3 s); a full bootstrap from .el
  overflows the Worker stack in loadup (cus-start.el), so the release .elc
  ship as built by upstream.
- Build: emacs package 45-69 s per build in headless Chrome with -j4
  (compile, two dumps, install, check), peak RSS of the largest build process
  1.56 GB (`/usr/bin/time -v npm run image`). Snapshot 141 MB, about 42 MB
  gzip; added to the domain catalog, not GitHub Pages until its export size
  is measured.
- Dolly bugs found, not fixed here: `exit(-1)` traps (kernel rejects status
  > 255; libc should pass `status & 0377`); `cd /` fails after the cwd is
  deleted; Make cannot re-exec after remaking an included makefile (no exec;
  `src/lisp.mk` is prepared on the host); Dolly's tar does not restore mtimes
  (the recipe sets one time on every file); the environment carried
  Emscripten's `USER=web_user` (fixed: kernel drops it).

Verification: `npm run test:demos -- emacs` passes in Chrome and Firefox and
the package installs into a default-based session; `node test/core-browser.mjs
chromium firefox` and `npm run test:source` pass with the kernel changes.

## Closed (2026-10-02)

Emacs ships as package `emacs` and application `gnu-emacs` (an image cannot share a package's name). Known limits are recorded above: `C-g` in pure Lisp loops, `M-x shell`, no PTYs.

Verified on the integration branch `work/dollyfile-v6` (`0d54a87`), release
`fcb204c0…`: 51 images rebuilt from scratch (image inputs `9f7a44a7…`),
artifacts 20/20, source 334/334, every browser suite in Chrome and Firefox,
image-inventory acceptance for every application and toolchain, and the demo
tests for python, javascript, emacs (Chrome and Firefox), pi, neovim, rust,
cmake, sdl2, studio, codex, bhop, classicube and rts in Chrome.
