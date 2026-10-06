# Slop says 'command not found' for a path that does not exist

- STATUS: OPEN
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
