# File modes and umask, so that an autoconf configure runs under Slop: on a branch, not on main

- STATUS: OPEN
- PRIORITY: 240
- TAGS: core,kernel,slop

## State (2026-10-12)

Not on `main`: Slop still refuses `umask` by name ("Dolly has no permission bits", `src/slop.c`),
so no unchanged `config.status` finishes under it. v0.1.0, v0.1.1 and v0.1.2 each left it out.

The work exists on `core/file-modes-2` (`0e4b4c26`, 2026-10-08): permission bits as real
metadata (the creation mode, a mask in the process record that a child inherits, `chmod`, modes
kept in images and sessions, `test -x`), and an image whose recipe runs an unchanged autoconf
`configure` under Slop (`49aa9138`). It was built there on a 15-image chain and its cases passed
in Chromium and Firefox. That branch's copy of this file is the record of the design, the
decisions and what ran:

    git show core/file-modes-2:tasks/20261006-120641-umask/TASK.md

Left:

- Bring the branch onto today's `main`, which is 216 commits past its base (`f3cc8b29`). It
  changes the process contract (operations 58 and 60, a `mode` word in the path request) and
  the image and session formats (version 3), so it costs a full catalog round and the Rust
  seed, and sessions saved before it do not load.
- Its two open decisions: the exec check (starting a program needs an x bit), not built, and
  whether the source packer keeps x bits, which repins every source archive.

From the configure survey (`tasks/20261006-121403-configure-survey`, closed 2026-10-12): what an
autoconf `configure` needs inside Dolly beyond modes.

- **A name.** `config.guess` cannot name Dolly (`uname` is `Dolly wasm64`) and `config.sub`
  rejects an operating system it does not know, so a package with `AC_CANONICAL_HOST` (libffi,
  bison, CPython) stops unless `--build` is given. `AGENTS.md` forbids claiming Linux.
- **Cost.** Make's `configure` runs 14,932 commands, of which `test` (1,898) and `printf`
  (1,561) are programs in Dolly and builtins in every other shell: about 4,700 Workers before
  the compiler runs once. Builtin `test`, `[`, `printf` and `echo` would remove about three
  quarters. Measured natively; the time inside Dolly is not.
- `exec PROGRAM`, for libtool's wrappers: `tasks/20261006-214244-process-exec`.
- `readonly`, `hash` and `times` are not builtins; none of the scripts measured uses them.

## As first filed (2026-10-06)

Slop refuses `umask` by name (`docs/slop.md`, "Target and boundary", item 2).
Every autoconf `config.status` and `config.guess` creates its temporary
directory with `(umask 077 && mktemp -d "./confXXXXXX")`, falling back to
`(umask 077 && mkdir "$tmp")`, and stops when both fail: with Slop as
`/bin/sh` no `configure` can finish (measured natively with libffi 3.5.2,
see `20260930-100000-audit-32` and the configure survey).

Decision (integrator, 2026-10-06 night): Slop gets `umask`, but only with a
real effect: the mask in the kernel's process record, 022 at start, inherited
on spawn, applied at creation, one operation (number 58), libc and the
builtin on top. What was then read in the kernel, corrected (files were 0644
and directories 0755, not 0666 and 0777), and the design that followed are
in the branch's copy.

