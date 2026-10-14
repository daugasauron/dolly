# File modes: chmod and umask, where an autoconf configure under Slop now stops; on a branch, not on main

- STATUS: CLOSED
- PRIORITY: 240
- TAGS: core,kernel,slop

## Closed (2026-10-14)

Owner (2026-10-14), on the short questions of the next round: "Regarding
next round, yes/signoff to everything except: I don't want ot add any
permission stuff, better to use workarounds than adding permission bits."

No permission bits. The recipes keep their workarounds (a `configure`'s
answers written by hand where it would `chmod +x` or `umask`), Slop keeps
refusing `umask` by name, and `core/file-modes-2` is not merged. The
decision of 2026-09-30, "one user, no permission bits", stands as it was.

## State (2026-10-14, 03:35): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read `main` and
the branches `core/file-modes` and `core/file-modes-2`, and changed nothing.
The integrator checked the decision's commit and its message, the document's
paragraph, Slop's refusal of `umask`, the libc adapter's `chmod`, the
socket marker and the branch's size. Of the thirteen recipes it says write a
`configure`'s answers by hand, seven say so in one line that a search finds;
the others were not counted again. It gives no verdict. What it found:

- The owner's decision of 2026-09-30 and its reason are on record. Real,
  enforced modes existed for three hours that day (`26277ef5`, answering an
  audit: "`chmod` … report success without doing anything") and were
  removed (`d41df0cb`): "That reversed a documented design". The reason
  written the same hour: "One user, no permission bits. Every process is
  the same principal and the containment boundary is the browser, so modes
  would protect nothing. Execute bits never select programs"
  (`docs/architecture.md`). A non-goal since 2026-08-31: "permission and
  user models inside a single disposable sandbox".
- That decision removed storing and enforcing together. The sources it
  cites say both things: "Modes are compatibility metadata, not an
  execution permission model" (a bit that is kept and not enforced) and
  "modes would protect nothing" (against enforcing). No word of the owner
  was found on a stored, unenforced bit, on `umask`, or on the branch.
- Today: a created file reports 0644, a directory 0755, every file of an
  image 0755. `chmod` and `chown` check that the path exists and return 0;
  `access` ignores what it is asked; the kernel starts any readable file
  that is a Wasm module or begins with `#!`. Nothing reads an x bit.
- What an unchanged `configure` needs of modes, read in the scripts: two
  commands that exit 0 (`umask 077` and `chmod +x config.status`) and
  `test -x` true afterwards. It never reads a bit back to see it enforced.
  Slop refuses `umask` by name and no image has a `chmod` command, because
  a command that succeeds and changes nothing was judged (2026-10-06, by
  the integrator) to be what `AGENTS.md` rules out.
- `core/file-modes-2` (2026-10-08) is built and measured: nine bits in the
  filesystem's own inode, creation mode and mask in the kernel, operations
  58 and 60, images and sessions in a new format; GNU Make's unchanged
  `configure` runs to exit 0 in 49 s; `git` sets `core.filemode true`. It
  enforces read and write bits, because WasmFS enforces what its inode
  holds. It is not on `main` by no decision of the owner's: it was cut from
  0.1.0 under "keep it lean" and not taken up since.
- The reflection's "store the bits and enforce nothing" has no code:
  storing in the inode means WasmFS enforces; not enforcing needs a kernel
  that lends bits around every call, or modes kept beside the inode.
- One thing in the kernel relies on today's rule: a bound socket's path is
  a file marked with the sticky bit, "which no process can set: chmod
  changes nothing" (`src/process-kernel.h:85-88`, 2026-10-08).
- By reading, not measured on `main`: `git` records a new script as 644 and
  checks an executable out as 644; both `tar`s drop the mode; `install -m`
  is accepted and dropped; `cp -p` is refused. tmux needed a compile flag
  because `mkdir(0700)` reads back 0755.
- Any form that passes a mode to the kernel edits `process.h`, so every
  executable and image; modes that survive a save change the record's
  format too. Only a `umask` builtin and a `chmod` command that change
  nothing touch no contract, and that is the form refused in 2026-10-06.
- Not found out: whether "one user, no permission bits" covers a stored
  bit that nothing enforces; which programs find executables by
  `access(X_OK)`; what a catalog round on the branch costs today (it is 325
  commits behind).

## State (2026-10-13)

The reflection on the direction
([reflection](../20261013-142800-direction/reflection.md), section 1) names
the smallest form: store the twelve bits and enforce nothing. A mode in the
reserved word of the path request for `OPEN|CREATE` and `CREATE_DIRECTORY`,
and `SET_TIMES` becomes an operation that sets attributes, the mode among
them. Today `git` commits every file as 644 and `tar` and `install -m` lose
the execute bit.

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

