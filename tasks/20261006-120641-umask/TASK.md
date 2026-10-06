# umask: every autoconf config.status needs it; what the kernel stores for a mode

- STATUS: OPEN
- PRIORITY: 240
- TAGS: core,kernel,slop

Slop refuses `umask` by name (`docs/slop.md`, "Target and boundary", item 2).
Every autoconf `config.status` and `config.guess` creates its temporary
directory with `(umask 077 && mktemp -d "./confXXXXXX")`, falling back to
`(umask 077 && mkdir "$tmp")`, and stops when both fail: with Slop as
`/bin/sh` no `configure` can finish (measured natively with libffi 3.5.2,
see `20260930-100000-audit-32` and the configure survey).

Decision (integrator, 2026-10-06 night): Slop gets `umask`, but only with a
real effect: the mask in the kernel's process record, 022 at start, inherited
on spawn, applied at creation, one operation (number 58), libc and the
builtin on top. First establish what a mask could change.

## What the kernel does with modes today (read, not run: no image tonight)

- Creation ignores the caller. The process requests carry no mode
  (`dolly_process_path_request`, `include/dolly/process.h`); libc drops the
  third argument of `open` and the second of `mkdir`. The kernel creates
  every file with `openat(directory, path, flags, 0666)`
  (`src/process-kernel.c:1612`) and every directory with
  `mkdirat(directory, path, 0777)` (`:1656`).
- `stat` reports what WasmFS holds for the inode: `st_mode & 07777`
  (`src/process-kernel.c:864`; `process.h` calls them "fixed compatibility
  bits that nothing changes"). So a file a process creates is 0666 and a
  directory 0777 whatever was asked: `open(f, O_CREAT, 0600)`, `mkdir(d, 0700)`
  and `mktemp -d` (which asks for 0700) all report the fixed value.
- Modes do not survive an image. The image format records none; restore
  makes every directory with `mkdir(path, 0755)` and every file with
  `open(path, ..., 0777)` (`src/fs-record.h:301,308`, "modes are
  compatibility metadata"). The same file is 0666 when created and 0777 after
  the session is saved and restored.
- `chmod`, `fchmod` and `fchmodat` exist in libc and succeed when the target
  exists, changing nothing (`src/process/libc-adapter.c:891-919`). There is
  no kernel operation for them and no `chmod` command.
- `umask()` exists in libc as a process-local value that nothing reads
  (`libc-adapter.c:721-727`). It is not inherited by a spawned process.
- Not checked: that WasmFS stores the creation mode unmasked (I could not
  find its source in the cache, and nothing ran). If it applies a mask of its
  own, the reported values above differ, the conclusion does not.

## Consequence for the decided design

A mask applied by the kernel at creation would change what `stat` and
`ls -l` report while the session lives: `(umask 077 && mkdir d)` would show
`drwx------`. Two things keep that from being the whole truth:

1. The requested mode is still dropped. POSIX is `requested & ~mask`; the
   kernel would compute `0666 & ~mask` and `0777 & ~mask`. `mktemp -d` and
   `mkdir -m 700` under the default mask would report 0755, not 0700, and
   `open(f, O_CREAT, 0600)` 0644. Carrying the mode means a field in the
   path request (an ABI change to two operations) or a second operation.
2. The mode is lost at the next image or snapshot (0755/0777 on restore), so
   a directory made private by `umask 077` is reported group- and
   world-accessible after a reload. Keeping it means a mode in the image
   record format.

Options:

- A. Mask only (the decided design as written): operation 58, kernel applies
  it to the fixed 0666/0777. Honest for the mask itself, silent about the
  two gaps above.
- B. Mask plus creation mode: also pass the mode of `open`/`mkdir` to the
  kernel. Then `stat` is right for everything created in a session; images
  still forget it.
- C. B plus modes in the image format and a real `chmod`: the full POSIX
  mode model, without enforcement. Largest; touches the snapshot format.
- D. Keep modes fixed and say so: `umask` sets and reports a per-process,
  inherited mask (kernel record, operation 58) and documents that Dolly
  stores no modes, as `install -m` does today.

Not built: stopped here for the integrator, as asked. Recommendation: B. It
is the smallest design in which nothing a program asks for at creation is
silently replaced, and it makes `mkdir -m`, `mktemp` and `install -m` true as
well; the image gap is then one documented sentence until C is wanted.

## Browser test to write once the design is fixed

Default mask 022; set and read; inheritance across spawn; the mode `stat`
reports after `open`, `mkdir` and a Slop redirection; `config.status`'s
`(umask 077 && mktemp -d ./confXXXXXX) || (umask 077 && mkdir ./conf$$)`.
