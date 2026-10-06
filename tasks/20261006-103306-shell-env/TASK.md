# An image without Slop still exports SHELL=/bin/slop

- STATUS: OPEN
- PRIORITY: 150
- TAGS: bug,kernel,environment

Found while measuring direct-ENTRY images
(`20261005-222449-single-program-images`; release build `5439ebe7`,
2026-10-06).

## Reproduce

A custom image with no `FROM`, `INSTALL` of `display` only and a C program as
ENTRY that prints `environ` shows `SHELL=/bin/slop`; `/bin/slop` does not
exist in it.

## Cause

The kernel sets `SHELL` for every image at boot, beside `PATH`, `HOME`, `LANG`
and `TERM` (`src/dolly.c:272`). The toolchain that ships Slop exports the same
value as image environment (`Dollyfile-system-build:111`); `core`, the package
that carries Slop into `minimal`, exports no environment.

## Effect

A program that runs `$SHELL` gets `ENOENT` where it could have seen that there
is no shell. libc's `system()` is not affected by the variable: it names
`/bin/slop` itself and fails with `ENOENT` (`src/process/runtime-adapter.c:888`).

## What reads it

Nothing of Dolly's: Slop, `system()` and `popen()` name `/bin/slop`
themselves, and Make gets its shell from its port (`docs/slop.md`). Upstream
programs do at run time (editors' shell commands, Git's helpers, CPython's
`os.environ`), and `demos/codex/launch.c:73` substitutes `/bin/sh` only when
the variable is absent.

## Fix (2026-10-06, `fix/shell-env`; not yet built or run in a browser)

The variable is the image's to declare. `system-build` already exports it on
the line after it compiles Slop (`Dollyfile-system-build:110-111`), and every
application and toolchain inherits that through `FROM`. So:

- the kernel sets no `SHELL` (`src/dolly.c`, `initialize_boot_environment`);
- `core`, the one package that offers Slop, exports it
  (`Dollyfile-core:10`); `minimal`, its one installer, was repinned.

The other way, a kernel check for `/bin/slop` after the image is restored,
needs no recipe line but keeps a program's name in the kernel and a second
source for a value recipes already declare.

Checked without a build: `node scripts/lint-dollyfiles.mjs` (61 recipes) and
`test/dollyfile-catalog.test.mjs`, which now fails a recipe that exports the
tool `slop` without `EXPORTS ENV SHELL /bin/slop`. To build and run:

    npm run build:runtime        # kernel only: the image inputs hash should not move
    DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=core,minimal work/build-slot.sh npm run image
    node test/shell-env-browser.mjs chromium firefox
    node test/minimal-browser.mjs chromium firefox

Until `minimal` is rebuilt on the new `core`, an old `minimal` on the new
kernel has no `SHELL`.

## Done when

- The lean image above has no `SHELL`; `minimal`, `system` and `default` still
  print `/bin/slop` for `echo $SHELL`.
