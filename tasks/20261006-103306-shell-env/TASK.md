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

## Fix

The kernel stops setting `SHELL`; `core` exports it (`EXPORTS ENV SHELL
/bin/slop`), as `system-build` already does: a kernel change and one recipe
line.

## Done when

- The lean image above has no `SHELL`; `minimal`, `system` and `default` still
  print `/bin/slop` for `echo $SHELL`.
