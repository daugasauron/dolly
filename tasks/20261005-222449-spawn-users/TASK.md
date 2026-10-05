# Investigate: which executables start other processes

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,process,host-modules,investigation

Owner direction (2026-10-06): investigate subprocesses as a declared host
module. Dolly has no fork; the module would be starting, waiting for and
signalling other processes (SPAWN, WAIT, INFO, SIGNAL: 4 of 55 operations,
about 500 kernel and 150 supervisor lines, measured in
`20261002-073000-runtime-process-modules`).

## Question

How many programs actually start another process, and can an executable say
so the way `-pthread` says `threads@0`?

## Measure

- Make the spawn client its own archive member of the process libc
  (`posix_spawn`, `system`, `popen`, `dolly_spawn*`, `wait*`, `kill` of other
  pids) that stamps a host record when linked, on a scratch branch. Rebuild
  the `default` chain and two demo chains, then count per image the
  executables that carry the record and those that do not. Expect Slop, Make,
  Git, `foreground`, `dollyfile`, `amy`, `xargs`, CPython, Pi's Janis and the
  editors to carry it; the open question is everything else.
- Check which callers pull the member in only through libc internals
  (`wordexp`, `popen` behind an unused path) and whether those can fail
  explicitly instead.
- The same technique answers the review's unmeasured candidate: count the
  executables that link the DSO and FFI client (expected: CPython, Neovim)
  and the trusted JavaScript every other process would stop loading
  (`src/process-ffi.mjs`, the DSO half of `src/process-worker.mjs`).

## Done when

- A table per image (executables with and without spawn; with and without
  DSO/FFI) is recorded here with the branch that produced it, and a
  recommendation for each module: contract contents, what stays in the
  runtime (process table, EXIT, self-signals, the ENTRY process), and the
  cost in recipes that must declare it. The owner decides; implementation
  is its own task.

Related: `20261005-222449-single-program-images` (what omitting it needs),
`20261005-222057-explicit-runtime`.
