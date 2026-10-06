# ls -l output misleads agents; help names a chmod that does not exist

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: userspace,agent

Dolly's `ls` (`Dollyfile-system-build`, `/tmp/core-tools/ls.c`) prints a long
listing as a type letter, size, ISO date and name, with no mode string, link
count, owner or `total` line:

```
d       4096 2026-10-06 00:20 .
d       4096 2026-10-06 00:20 ..
```

Agents are trained on POSIX/GNU `ls -l`. In task
`20261005-215204-pi-local-loop` Qwen3.5-2B read the first column as a file
named `d` and ran `ls -la /workspace/d/`, and Qwen3.5-0.8B and 2B re-ran
`ls -la /workspace/` because an empty directory listing did not look empty
(the owner's "keeps doing ls -la /workspace on repeat"). Dolly has no
permission bits, but POSIX's format can still be printed (a mode string from
the file type, `1`, one user and group name, size, date, name, and `total`).

`help` says "one user and no permission bits: chmod, chown and install -m
change nothing", yet no image ships `chmod` or `chown`: `chmod --help` and
`chmod +x hello.c` give `slop: chmod: command not found`, which the 4B and
2B models both reported as a missing tool. Either the text should say they
are absent, or the commands should exist and say what they do here.

## Done when

- `ls -l` output parses as POSIX's long format; a test covers an empty and a
  populated directory.
- `help` and the image agree about `chmod`/`chown`.

## Result (2026-10-06, `fix/userspace-2`)

`ls -l` (`Dollyfile-system-build`, `ls.c`) prints POSIX's long format. In
the rebuilt `default` image (Chrome), after `cc hello.c`:

```
$ ls -la
total 35
drwxr-xr-x   1 0 0       4096 Oct  6 09:25 .
drwxr-xr-x   1 0 0       4096 Oct  6 09:25 ..
-rw-r--r--   1 0 0      20925 Oct  6 09:25 a.out
-rw-r--r--   1 0 0         26 Oct  6 09:25 hello.c
l---------   1 0 0          7 Oct  6 09:25 link -> hello.c
drwxr-xr-x   1 0 0       4096 Oct  6 09:25 sub
$ ls -l sub
total 0
```

Decisions:

- Mode: the bits `stat` reports, as `stat -c %A` prints them. Measured: 644
  for files a program creates, 755 for directories and for every file of the
  image, 0 for symbolic links, 666 for `/dev/null`. Nothing checks or changes
  them, so a fresh `a.out` shows `-rw-r--r--` and runs (`./a.out`, status 0;
  a `#!/bin/slop` script too). `help` and the Pi skill say so.
- Owner and group: the numbers `stat` reports (0 and 0). POSIX prints the
  number when there is no name, and libc has no name database.
- Date: POSIX's, `%b %e %H:%M` within six months and `%b %e  %Y` otherwise,
  so the name is the ninth field as in GNU `ls`. The previous ISO date made
  it the eighth.
- `total`: the listed entries' sizes in KiB, each rounded up; `ls --help`
  and `docs/slop.md` say so. The kernel's `st_blocks` is `ceil(size / 512)`
  (measured: 26 bytes give 1, 20925 give 41), a number derived from the size
  and not from storage, so it adds nothing; `du` counts logical bytes too.
- File operands are no longer separated by blank lines (`ls -l *.c`); a
  blank line precedes only a directory's heading.
- `chmod` and `chown`: `help` now says they are absent ("the modes ls -l
  prints are fixed and nothing checks them; there is no chmod, chown, id,
  whoami, ps or df, and install -m changes nothing"), as do `docs/slop.md`
  and the Pi skill. Not added as commands: one that succeeds and changes
  nothing is what `AGENTS.md` rules out ("an unimplemented operation cannot
  return success"), and nothing here needs it, since modes select nothing.
  `install -m` stays because refusing it fails every `make install`.
  Measured: `chmod +x a.out` and `chown 0 a.out` give `command not found`
  (127).

Callers: no recipe, script or test parsed `ls -l` output except
`test/shell-browser.mjs` (grep over `Dollyfile*`, `demos/`, `scripts/`,
`test/`). GNU Emacs's dired reads `ls -al` at run time; no test covers it.

Tests: `test/commands.test.mjs` (a populated and an empty directory, a
link, file operands; native build of the same source) and
`test/shell-browser.mjs` (the `total` line, a file line with the mode
`stat` reports, an empty directory, a link; Chrome and Firefox). The file
line's check fails for a wrong size (checked by mutation).

Left as they are: with `-F`, a link prints `link@ -> target` (GNU omits the
`@` in the long format); the link and size columns have fixed widths.
