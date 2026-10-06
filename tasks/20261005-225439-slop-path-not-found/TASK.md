# Slop says 'command not found' for a path that does not exist

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: slop,seed,agent

`spawn_command` (`src/slop.c:2830`) prints `slop: NAME: command not found`
(exit 127) whenever `resolve_command` fails, also when `NAME` contains a `/`
and is a path. POSIX shells name the reason for a path: bash prints
`./hello: No such file or directory` (127), and for a directory or a file
that is not executable `Is a directory` / `Permission denied` (126).

Found in `pi-local` (task `20261005-215204-pi-local-loop`): after
`cc hello.c` (which writes `a.out`), Qwen3.5-2B ran `./hello` and read
`slop: ./hello: command not found` as "the slop shell is not installed",
then spent its turns on `which slop`, `/bin/slop hello.c` and listing
`/bin`; in 3 of 8 runs that ended in a repetition loop. With "No such file or
directory" the next step (`ls`, finding `a.out`) is the usual one.

## Done when

- A command word containing `/` that names nothing reports
  `slop: PATH: No such file or directory` (127); one that names a directory or
  non-regular file reports why (126). A bare name keeps `command not found`.
- A Slop test covers the three cases. Slop is seed content: batch with the
  next seed round.

## Result (2026-10-06, `fix/userspace-2`)

`spawn_command` (`src/slop.c`) keeps `command not found` (127) for a bare
name. For a word with a `/` it reports the path: `stat`'s error (127), or
`Is a directory` / `not a regular file` (126). `run-program.h` (`env`,
`timeout`, `xargs`, `command`, `time`) already reported `strerror` like this.

Measured in the rebuilt `default` image (Chrome):

```
$ ./hello      slop: ./hello: No such file or directory   127
$ ./           slop: ./: Is a directory                   126
$ /dev/null    slop: /dev/null: not a regular file        126
$ nosuch       slop: nosuch: command not found            127
$ hello.c/x    slop: hello.c/x: Not a directory           127
```

The last is 127 as in dash; Bash answers 126. Decision: any path `stat`
cannot reach is "not found", one rule instead of an errno table.

Tests: the Slop case "a path that names nothing is not a missing command"
(statuses against Bash, natively under ASan and in Chrome and Firefox) and
the messages in `test/shell-browser.mjs`; the latter fails when the message
is `command not found` (checked by mutation).
