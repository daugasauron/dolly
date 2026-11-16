# Files a process creates are 0644 where an image's are 0755: SCons finds no compiler that amy installed and falls back to gcc

- STATUS: OPEN
- PRIORITY: 170
- TAGS: audit,recipes,amy,kernel,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`): every package `amy` offers installed alone into a fresh `default` session.

## State (2026-11-17)

Fixed on `ws/seed` (kernel only: the image build ID stays `87c27243…`, so it rebuilds no image) and
checked in Chrome and Playwright's Firefox (below). Left: the scons recipe's own check still names
`CC="cc"`, the workaround this removes; it goes with the seed batch of `ws/seed`.

## Found

`amy install scons` works, and SCons cannot build anything with a default environment:

```
$ amy install scons && cd /tmp/sc && printf "Program('m', 'm.c')\n" > SConstruct && scons -Q
gcc -o m.o -c m.c
slop: gcc: command not found
scons: *** [m.o] Error 127
```

SCons looks programs up with `SCons.Util.WhereIs`, which on POSIX takes a file only if
`stat.S_IXUSR & st_mode` (scons 4.10.1, `SCons/Util/__init__.py:768-797`), and falls back to `gcc`
when it finds no C compiler. In the same session `WhereIs("ls")` is `/bin/ls`, and
`WhereIs("cc")` and `WhereIs("scons")` are `None`:

```
-rwxr-xr-x   1 0 0      71186 Jan  2  1980 /bin/ls          (restored from the image at boot)
-rw-r--r--   1 0 0      31847 Nov 16 14:18 /bin/cc          (written by amy install cc)
-rw-r--r--   1 0 0        163 Nov 16 14:18 /usr/bin/scons
-rw-r--r--   1 0 0      71186 Nov 16 14:14 /tmp/ls-copy     (cp /bin/ls /tmp/ls-copy)
```

The kernel creates files with two modes: its restore of an image's records opens with `0777`
(`kernel/fs-record.h:304-305`, "Modes are compatibility metadata, not an execution permission
model"), while every file a process creates is opened with `0666` whatever mode the program asked
for (`kernel/process-kernel.c:2204`, `openat(directory, path, flags, 0666)`; `kernel/dolly.c:183`
writes the Worker's boot files with `0666` too). So the same program is 0755 in an image and 0644
once amy, `cp` or a build wrote it, and it stays 0644 when the session is saved and loaded again
(measured: `/usr/bin/jq` after `amy install jq`, before and after a reload, `mode-reload.txt`).
The scons recipe's own check names the compiler (`Environment(CC="cc")`,
`demos/tools/Dollyfile-scons`), so the build never met it.

Evidence: `work/audit-1116-evidence/recipes/run-b.jsonl` (case `scons`), `retry.jsonl`
(`scons-debug`: `sys.platform` dolly, `os.access(X_OK)` true, mode `0o100644`), `whereis.jsonl`,
`modes.jsonl`.

## Do

`kernel/process-kernel.c:2204` and `:1230` (`create_through_link`): `0777`, the mode the restore
uses, so a file has one mode however it was made. It changes the kernel: a runtime build.

## Done when

In a fresh `default` session, after `amy install scons`, `ls -l /bin/cc` shows `-rwxr-xr-x` and
`scons -Q` builds a `Program('m', 'm.c')` with no `CC` given.
