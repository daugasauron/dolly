# exec: replace a process's program in the process contract

- STATUS: OPEN
- PRIORITY: 40
- TAGS: core,process,abi,slop,design

Owner (2026-10-06, 21:45): "I think real execve sounds better?", then: "keep
the real execve path but its very low priority for now." Asked while
Slop was being run against real `configure` scripts: libtool's generated
wrappers use `exec PROGRAM` 18 times, and Dolly has no exec
(`docs/process-model.md`: "There is no `fork` or `exec`"). The alternative, a
shell-level imitation (run the program, forward signals, exit with its
status), was considered and not taken: the program would have another pid and
every wrapper would keep a Slop Worker and its memory alive under the program,
in a browser where memory is the scarce thing.

## What it is

One new operation of the process contract (number 61 is reserved for it; 58
and 60 are file modes, 59 locks): path, arguments, environment. On success it
does not return: the kernel keeps the process record and the supervisor swaps
the Worker and its private memory for a fresh one running the new program.
libc's `execve` family calls it. There is still no `fork`.

## What must be designed before any code

- What the record keeps: pid, parent and children (so the new program can wait
  for them), descriptors without close-on-exec, cwd, the file-mode mask,
  `fcntl` locks, pending signals and the mask, ignored dispositions, alarms,
  the foreground and interactive roles, a timed spawn's deadline.
- What it drops: handlers (back to default), threads (`threads@0` Workers of
  the old program), mappings, DSOs, `atexit`.
- The point of no return: a missing, non-executable or unadmitted program
  (the image's `REQUIRES HOST` set) must fail with the old program still
  running, so the load and the admission check come before the old Worker
  goes.
- The Worker swap: retirement has no completion event and today waits up to
  500 ms for reclamation; two memories exist for a moment. Whether the swap
  needs anything new from the supervisor contract
  (`abi/dolly-supervisor-0.wat`) or reuses the start and retire edges. No new
  browser authority is expected; confirm it.
- Slop's `exec PROGRAM` and `exec` with only redirections.

## Tests that decide it

The pid is unchanged and the parent's `waitpid` gets the new program's
status; descriptors survive or close by their flag; a pending signal is
delivered to the new program and a handler is not; a missing program returns
`ENOENT` and the caller continues; Ctrl+C reaches the new program; exec in a
pipeline, from a thread, and under a timed spawn; libtool's wrapper cases
against Bash.

## Cost

The contract's hash changes, so every image rebuilds and the Rust seed is
relinked: it belongs in the same round as the other contract changes
(`core/file-locks`, `core/input-module`, `core/dso-module`, file modes), not
in a round of its own. The code is in the retirement path, where two signal
races were found on 2026-10-05 and 2026-10-06.

## Related

`20261006-121403-configure-survey` (the uses), `20261005-222449-spawn-users`,
`20261005-133401-kernel-boundary`.
