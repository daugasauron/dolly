# Packages that start programs they do not install

- STATUS: OPEN
- PRIORITY: 285
- TAGS: packages,amy,images,agent-experience

Found 2026-10-07 in the night round: with `default` composed from packages
(`20261005-222449-small-default`), `amy install rust` gave a `rustc` that
could not link ("dolly-rust-link: spawn cc: No such file or directory"), and
`amy install cargo` a Cargo that could not build. The `rust` package had
always run `/bin/cc`; until tonight every image carried it. Fixed for `rust`
(`69e09fe3`: the package installs `cc`). The amy suite passed with the hole
open, because its Rust case ran where `cc` was already present.

The same gap is likely elsewhere: a package was correct as long as its base
happened to hold what it starts.

## Work

- For every package in the catalog (`PACKAGE` recipes), list the programs its
  commands start (`cc`, `make`, `ld`, `sh`, `git`, `curl`, `tar`, a pager, an
  interpreter) and whether the package or its `INSTALL` lines provide them.
  Measure by installing each alone on `default` and running its ordinary use,
  not by reading: `cmake` configuring and building a C project, `python`
  with `pip install` of a pure and of a C wheel, `emacs`, `nvim` with `:!`,
  `git` with an editor and a pager, `cargo`, `ripgrep`, `fd`, the model
  packages with `pi`.
- Decide per gap: the package installs what it needs, or its command says
  what to install (`amy install cc`) when the program is missing. A failed
  spawn should name the package that provides the program; today it names
  only the missing file.
- A test per package on `default` with nothing else installed; the amy suite
  is the place.

## Also found 2026-10-07

`default` had neither `download` nor `upload`, though it declares both host
modules: only `system-tools` builds the two commands and no package holds
them. `zero-ad`, built on `default`, failed its graphics test at the first
`download`. For the candidate, `default` copies the commands and their manual
pages from `system-tools` (`0f211db3` on `integrate/next`), which makes
`system-tools` one of default's sources. The right shape is a package (or
`core`) that owns the page's file exchange, so that `default` stays composed
from packages only and any image can `amy install` it.

## From `20261005-222449-small-default` (closed 2026-10-07)

Two tools of the old `default` are not one install away: Ninja (`samu`, built
in `system-tools` only; the `cc` package brings Make) and `session-recover`
(built in `system`). With `download`/`upload` above, these are what a
package, or `core`, still has to own for "everything stays one install away".

## Survey 2026-10-07 (each package alone on `default`)

Method: `build/package-needs-evidence/survey.mjs` (in the `fix/package-needs`
worktree, not committed) boots a fresh `default` page per package in headless
Chromium, runs `amy install NAME`, then the package's ordinary use as Slop
scripts, with the terminal text as evidence (`results.json` beside it).
`default` installs core, posix, display, curl and amy, so those five are not
"alone" cases; rust and cargo are held by the suite's "alone" cases already.
"Starts" is what the package's commands spawn, from the recipes and upstream;
"Alone" is the measurement (Chromium, 12:04-12:13; every install took
0.2-2.8 s from the local checkout server).

| Package | Starts | Provided by | Alone on default |
|---|---|---|---|
| cc | make runs `/bin/sh` (posix) | yes | works: C and C++ compile and run, make runs a rule |
| cmake | `cc` to configure, `make` to build | no: neither installed | **fails**: `CMake was unable to find a build program corresponding to "Unix Makefiles". CMAKE_MAKE_PROGRAM is not set`, `CMAKE_C_COMPILER not set, after EnableLanguage`; `cmake --build`: `no such file or directory … command was: -f Makefile` |
| git | editor (`vi` unless `GIT_EDITOR`), pager (`less`), `/bin/sh` for hooks, `git-remote-http(s)` | sh and the helpers yes; no package holds `vi` or `less` | works for init, add, commit -m, log, diff (EDITOR, PAGER, VISUAL unset). On the terminal, `git -p log`: `error: cannot spawn less: No such file or directory` / `fatal: unable to execute pager 'less'` (status 128); `git commit` without -m: `error: cannot spawn vi: No such file or directory` / `error: unable to start editor 'vi'` / `Please supply the message using either -m or -F option.` Side finding: the commit printed `fatal: fork failed: Function not implemented` once and succeeded |
| python | `/bin/sh` (subprocess), `cc` for pip of a C sdist | sh yes; cc no | works: a script runs, `pip --version`; `pip install six` (a pure wheel) installs from PyPI when the page's policy admits `https://pypi.org` and `https://files.pythonhosted.org` (two warnings: truststore disabled, no ssl module). A C sdist was not tried |
| emacs | `$SHELL`/`sh` for `M-!`, `shell-command` | yes (`SHELL=/bin/slop`) | works: `--batch` opens a file and `shell-command-to-string` runs; `M-!` interactively not driven |
| nvim | `sh` for `:!` and `system()` | yes (posix) | works: `--headless` opens a file, `:r !echo` inserts the output, writes |
| sdl2 | nothing; a library for `cc` and `find_package(SDL2)` in cmake | no: neither cc nor cmake installed | **unusable**: `slop: cc: command not found`, `slop: cmake: command not found` |
| zlib | nothing; a library for `cc` | no | files present (zlib.h, zconf.h, libz.a); **unusable**: `slop: cc: command not found` |
| ripgrep, fd | nothing | yes | work |
| gzip | nothing (installs zlib) | yes | works; `gzip -dc` decompresses only, by design |
| javascript | janis `child_process` runs `sh` | yes (posix) | works: qjs, janis `execSync("echo")`, tsc then qjs |
| dolly-docs | nothing | - | 30 files under /usr/share/doc/dolly |
| protox | nothing | - | works: compiles a proto3 file (`--version` is not a flag) |
| codex-cli | `rg`, `fd` (installed), `sh` for its shell tool | yes | works: `codex --version`, rg, fd, `codex exec --help`. Side finding: `codex exec --help \| head -n 3` ends with `dolly: process 129 failed: function signature mismatch` |
| pi-coding-agent | `janis` (javascript installed), `rg`, `fd`, `sh` | yes | works: `pi --version` 1.0.3, rg, fd, qjs |
| model packages (6) | nothing; `pi-local` (an image, not a package) reads them | - | not measured: 1.0-1.6 GB each, outside today's browser budget |
| gpu-sdk, audio-sdk | named in the brief, but they are TOOLCHAIN images, not packages: `amy install` cannot name them | - | not applicable |

Count: of 17 packages measured, 3 fail or are unusable alone (cmake, sdl2,
zlib), 1 (git) needs a message for its editor and pager, 13 work.

Decisions:
- cmake installs cc (a plain dependency: configure runs the compiler, build
  runs make). Done below.
- sdl2 and zlib: by design, needs a compiler, installs none (integrator's
  ruling 2026-10-07). A library starts nothing, and a package of headers and
  archives that installed `cc` would drag 2,000 files into every image that
  only links against it from its own toolchain. Their one-line descriptions
  (`amy list`, the start page) now say they are libraries for programs the
  `cc` (and for sdl2 `cmake`) package builds and install no compiler; that is
  README text read at route generation, no image changes.
- git: no dependency (same ruling). Today, on the terminal, `git -p log`
  prints `error: cannot spawn less: No such file or directory` then `fatal:
  unable to execute pager 'less'` (status 128), and `git commit` without -m
  prints `error: cannot spawn vi: No such file or directory`, `error: unable
  to start editor 'vi'`, `Please supply the message using either -m or -F
  option.` Both name the missing file, not what to do. They should say
  `less: not installed; no package provides it (git shows the log without a
  pager when PAGER=cat)` and `vi: not installed; amy install nvim provides
  an editor (set EDITOR=nvim)`. git itself cannot know the catalog, so the
  message belongs in one place for every failed spawn: the kernel's spawn
  failure (ENOENT for a bare NAME on the PATH) has the name, and the catalog
  of TOOL exports per package is `/amy-index.txt` plus each package's recipe,
  which the kernel does not read today; the cheapest first step is Slop's
  `command not found` naming the package, which covers typed commands but
  not git spawning `less`. Until then `default` could export `PAGER=cat`
  (upstream's own "no pager" spelling), so git never looks for `less`.
  Design note for the owner, not code today.
- `download` and `upload`: they belong in `core`: they are the page's file
  exchange, every image declares the two host modules, and `core` already
  holds the other commands every image needs (slop, cat, ls, tar). A
  separate `file-exchange` package would be one more row in every recipe.

## Verification 2026-10-07 (branch `fix/package-needs`)

- `3aee12e4`: cmake installs cc; `test/amy-browser.mjs` gains the cmake
  "alone" case (asserts `cc` absent on default, installs cmake, configures,
  builds and runs a one-file C project). The cmake package image was
  rebuilt alone (`npm run image -- cmake`, 29 s, pin `ea41ca26…`); it is the
  only image these commits change.
- The amy suite, Chromium and Firefox, on the rebuilt package: every case
  passed (amy, amy programs, rust alone, cargo alone, cmake alone, cc,
  refusal); `amy install cmake alone` 2976 ms Chromium, 3811 ms Firefox.
  Logs: `build/package-needs-evidence/amy-{chromium,firefox}.log`.
- `npm run -s lint:dollyfiles`: 67 recipes; `npm run -s test:source`: 399
  pass, 0 fail.
- `65f64017`: sdl2 and zlib descriptions; README text only, no image.

Left: a message naming the package for a failed spawn (git's pager and
editor, and `cc` from pip for a C sdist); the model packages installed on
`default`; the two side findings (git's `fork failed` on commit, codex's
`function signature mismatch` when `head` closes its pipe) belong in their
own tasks.

## Done when

Every package's ordinary use works after `amy install NAME` on `default`, or
fails with a message naming what to install, and a test holds each.
