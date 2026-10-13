# Investigate: SPAWN_INTERACTIVE, and where the rule for Ctrl+C at a shell lives

- STATUS: OPEN
- PRIORITY: 280
- TAGS: core,process,abi,slop,owner

Owner (2026-10-13), on
[the reflection](../20261013-142800-direction/reflection.md): "The audit is
too blunt. Some of the points are good but some are garbage. Both SLOP and
RUN are needed, see the history, this is hard earned wisdom. Create tasks to
investigate each of your points more in detail without deciding if they
should go or not".

This task investigates one of its points (section 1). It decides nothing.

Done when it holds, with the evidence and without a verdict:

- how the thing came to be: the commits and tasks that introduced it and
  changed it, quoted, and the reason each gives (`git log -S`, `git log
  --follow`, `tatr find`, the closed tasks);
- what it is for today and who uses it, counted from the code and the
  recipes, not from the reflection;
- each claim of the reflection below, checked: true, false or partly, with
  what was looked at;
- what would break, be lost or become harder if it changed, and what would
  get simpler, each shown on a real case;
- what could not be found out.

The owner decides what, if anything, follows.

## State (2026-10-14, 01:20): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read
`integrate/round-1013` and changed nothing. The integrator checked six of its
commits, the revert's message, the lines of the supervisor and the kernel
that read the flag, and the count of `ENTRY` rows (51 of 51 through
`/bin/foreground -i /bin/slop`). It gives no verdict. What it found:

- The rule "the shell is spared while its command runs" is as old as the
  first commit and has had four keys: a PID the kernel set when it launched
  Pi or Slop by name (2026-08-31); a page option the runtime worker chose by
  program path, `path === "/bin/slop" || path === "/usr/bin/pi"`
  (`b95459ce`, 09-05); the spawn flag set by `/bin/foreground -i` from the
  image's own script (`3f875924`, 09-06: "the browser does not recognize
  Slop, Pi or recovery paths"); and for pseudo-terminals no key at all, the
  holder the other holders descend from (`a095e7d0`, 10-12). So the flag is
  what took two program names out of the page.
- The owner's one decision on Ctrl+C is `ISIG`, of 2026-10-01
  ([the task](../20261001-000500-slop-loop-interrupt/TASK.md)): "Termios
  ISIG, the Unix model". Since then the terminal's mode decides whether
  Ctrl+C is a signal or input, and the flag decides only who in the
  foreground tree takes the signal. The flag is mentioned there as kept,
  not as decided.
- Something was tried and reverted the day before: making an interactive
  owner without children take `SIGINT` (`01bd1f6f`, reverted by `f91e1aef`):
  "The kernel rule it waited for would also turn Ctrl+C into SIGINT for
  Pi". `SIG_IGN` in the shell, process groups or a foreground per process
  were never tried; Dolly has none of them.
- "Implemented twice" is partly true. At the display's terminal the rule is
  in one place, the supervisor (`src/process-supervisor.mjs:277`). The
  kernel lines the reflection names choose the owner and publish `ISIG`;
  they spare nobody. A second, different rule is in the kernel for
  pseudo-terminals, by descent and without the flag
  (`src/process-kernel.c:2422-2435`). The two differ for a foreground owner
  started without `-i`.
- The flag has a second reader the reflection does not mention: an
  interactive process with 128 MiB or more of memory gets 500 ms before its
  retirement is acknowledged (`src/process-supervisor.mjs:671`).
- POSIX has two models, and `SIG_IGN` alone is neither. A job-control shell
  is spared because it is not in the terminal's foreground process group:
  the flag is Dolly's stand-in for that membership. A shell without job
  control receives the signal with its child and decides afterwards from
  the child's wait status. Slop has the second half of that already.
- What the flag states that no signal disposition states: a Ctrl+C that the
  child handled and survived (Python's prompt, `less`, a game) is not a
  Ctrl+C for the shell. Without it, Slop's handler would record every such
  press, and in a list (`python; echo after`) the next command would be
  cancelled (`src/slop.c:3053-3057`); and Pi, Codex and six agent programs
  started with `-i` would take `SIGINT` with their tool whenever the
  terminal has `ISIG` set.
- 9 script rows start a program with `-i` (agents and TUIs), 10 without
  (editors, games, viewers). No recipe or task says why one and not the
  other. About twenty tests press Ctrl+C to end a child and go on typing at
  the same shell.
- Not found out, and it needs a build of the kernel and supervisor, not of
  the catalog: the six cases of section 6 (among them `python; echo AFTER`
  with a Ctrl+C the REPL survived, and whether Slop acknowledges within
  500 ms in every parked state). Also not recorded anywhere: Pi's and
  Codex's terminal mode while a tool runs.

## What the reflection claims and proposes (2026-10-13, unchecked)

- "An interactive owner with running descendants is spared"
  (`include/dolly/process.h:181`), implemented twice
  (`src/process-supervisor.mjs:275-279`, `src/process-kernel.c:180-195`):
  a shell's decision about how Ctrl+C reaches it, written as a spawn flag.
  POSIX says the same with `SIG_IGN`, which `src/process/signal.c:107`
  already honours. `SPAWN_FOREGROUND` is mechanism (who owns the terminal)
  and stays.
- Not judged by reading: whether Slop can ignore `SIGINT` across its wait
  cleanly without the flag. Measure that first.
- `process.h` and `slop.c` are in the seed: its commit goes on the seed
  branch, tested on the base chain.
