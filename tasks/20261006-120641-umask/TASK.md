# File modes: chmod and umask, where an autoconf configure under Slop now stops; on a branch, not on main

- STATUS: OPEN
- PRIORITY: 240
- TAGS: core,kernel,slop

## State (2026-10-13)

An unchanged autoconf `configure` now runs all of its checks under Slop and stops where it needs
file modes: `chmod` and `umask`. Those are still only on `core/file-modes-2`.

Measured on `core/polish` (`system` rebuilt on the seed with both changes below, Chromium):

- GNU Make 4.4.1, `sh ../make-4.4.1/configure --build=wasm64-unknown-none
  --disable-dependency-tracking`: 200 checks in 45 s, then "configure: creating
  ./config.status", `slop: chmod: command not found`, "write failure creating ./config.status".
- tmux 3.8, `sh ../tmux-3.8/configure --build=wasm64-unknown-none`: 129 checks in 24 s, then
  "libevent not found", which is true.
- Make's without `--build`: 52 checks, then `config.guess` at its `umask 077` ("Dolly has no
  permission bits") and "cannot guess build type".

Before today both stopped at their first lines. Two stops were not modes and are fixed (seed
changes, `core/polish`):

- `ae118619`: `test -x` is true of a directory. Every configure requires `test -x /` of its
  shell; Dolly's `test` answered -x only for a regular file, which is the "requires a shell more
  modern than all the shells that I found" that tmux's configure printed.
- `b2b99766`: `ls -i`, `-t` and `-L`, the two `ls` commits of `core/file-modes-2` (`7cba3e8b`,
  `0c895f98`), which apply to today's recipe unchanged: configure compares `ls -di .` and
  automake's sanity check asks for two files in time order.

Not brought onto `main` today, and what it takes: the rest of `core/file-modes-2` (`0e4b4c26`,
18 commits; `main` is 325 commits past its base `f3cc8b29`) is permission bits as real metadata:
the creation mode, a mask in the process record that a child inherits, `chmod`, modes kept in
images and sessions. It changes the process contract (operations 58 and 60, a `mode` word in the
path request), so every executable is rebuilt and the Rust seed is relinked on the host, and
the image and session formats (version 3). That is a day in a full tree with the large build
slot and then a catalog round, not a morning in a slim one: today's round would have had to
take it unbuilt. Its two open decisions stand: the exec check (starting a program needs an x
bit), not built, and whether the source packer keeps x bits, which repins every source archive.

That branch's copy of this file is the record of the design, the decisions and what ran there
(Make's configure to exit 0 in 49 s):

    git show core/file-modes-2:tasks/20261006-120641-umask/TASK.md

Done when `umask` and `chmod` work under Slop on `main`, the branch's mode cases pass there in
Chromium and Firefox, and the image whose recipe runs an unchanged `configure` builds in the
catalog.

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

