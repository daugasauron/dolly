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
"Alone" is the measurement, or "unmeasured" where the browser slot never came.

| Package | Starts | Provided by | Alone on default |
|---|---|---|---|
| cc | make runs `/bin/sh` (posix) | yes | unmeasured |
| cmake | `cc` to configure, `make` to build | no: neither installed | unmeasured; expected to fail at configure |
| git | editor (`vi` unless `GIT_EDITOR`), pager (`less`), `/bin/sh` for hooks, `git-remote-http(s)` | sh and the helpers yes; no package holds `vi` or `less` | unmeasured |
| python | `/bin/sh` (subprocess), `cc` for pip of a C sdist | sh yes; cc no | unmeasured |
| emacs | `$SHELL`/`sh` for `M-!`, `shell-command` | yes (posix) | unmeasured |
| nvim | `sh` for `:!` and `system()` | yes (posix) | unmeasured |
| sdl2 | nothing; a library for `cc` and `find_package(SDL2)` in cmake | no: neither cc nor cmake installed | unmeasured; expected unusable |
| zlib | nothing; a library for `cc` | no | unmeasured; expected unusable |
| ripgrep, fd, gzip | nothing (gzip installs zlib) | yes | unmeasured |
| javascript | janis `child_process` runs `sh` | yes (posix) | unmeasured |
| dolly-docs | nothing | - | unmeasured |
| protox | nothing | - | unmeasured |
| codex-cli | `rg`, `fd` (installed), `sh` for its shell tool | yes | unmeasured |
| pi-coding-agent | `janis` (javascript installed), `rg`, `fd`, `sh` | yes | unmeasured |
| model packages (6) | nothing; `pi-local` (an image, not a package) reads them | - | unmeasured (1.0-1.6 GB each) |
| gpu-sdk, audio-sdk | named in the brief, but they are TOOLCHAIN images, not packages: `amy install` cannot name them | - | not applicable |

## Done when

Every package's ordinary use works after `amy install NAME` on `default`, or
fails with a message naming what to install, and a test holds each.
