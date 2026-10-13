# Investigate: SLOP and RUN, and build scripts written through FILE

- STATUS: OPEN
- PRIORITY: 250
- TAGS: core,dollyfile,owner

Owner (2026-10-13), on
[the reflection](../20261013-142800-direction/reflection.md): "The audit is
too blunt. Some of the points are good but some are garbage. Both SLOP and
RUN are needed, see the history, this is hard earned wisdom. Create tasks to
investigate each of your points more in detail without deciding if they
should go or not".

This task investigates one of its points (section 3). It decides nothing.

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

The owner on this point: "Both SLOP and RUN are needed, see the history, this
is hard earned wisdom." Start from the history, not from the reflection: why
there are two, what each can do that the other cannot, and what was tried
before.

## State (2026-10-14, 00:50): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read
`integrate/round-1013` `0155af64` and changed nothing. Its commits and counts
were checked against the tree by the integrator (seven commits, the five
`RUN` rows, 776 `SLOP` rows). It gives no verdict. What it found:

- The history has four steps, each on the owner's word. Slop built on the
  host with the kernel (DOLLY 1, 2026-08-31). Slop and seven other programs
  compiled by `bootstrap.c` before the first row (`b95459ce`, 2026-09-05).
  Slop compiled by the recipe through a special directive, `COMPILEC`
  (`62bec931`, 2026-10-01, [the bootstrap boundary](../20261001-123500-bootstrap-boundary/TASK.md):
  "identity of Slop moves from the seed hash into the system-build recipe
  graph"; a warm `npm run build:runtime` went from 63 s to 13 s because a
  Slop edit no longer relinks the kernel). The same day, by the general
  directive: "`RUN` replaces `COMPILEC`; `SLOP` is its shell form … one way
  to run programs, with `SLOP` defined as `RUN /bin/slop -e -c command`"
  (`9fc8b997`, `5ec4783c`).
- So what the reflection proposed for `RUN` (the bootstrap compiles Slop) is
  the state of 2026-09-05, which the owner asked to leave. The reflection
  did not read either record.
- `RUN` today: 5 rows in `Dollyfile-system-build` (four compiler proxies,
  Slop), the only way to run a program in an image without a shell
  (`test/shell-env-browser.mjs:13`), and the definition `SLOP` is written
  against.
- `SLOP` today: 776 rows; 158 of them continued over 694 lines (6.7% of all
  recipe lines; the reflection's 9% counts Makefile text inside `FILE`
  bodies too). 13 rows run a Slop script that a `FILE` row wrote (not 25:
  the rest are Makefiles and C sources, which stay files whatever `SLOP`
  becomes). Scripts by `FILE` and `SLOP` are as old as DOLLY 3
  (`1f2954b6`, 2026-09-07).
- A body for `SLOP` has no delivery path in the engine today (a step's
  standard input is `/dev/null`; an argument is limited to 4,096 bytes), and
  4 of the 13 script rows could not be bodies as they stand (run twice, run
  with an argument, or kept in the image).
- Not found out: why `RUN`/`CHECK` became `SLOP` in DOLLY 2 (`c4dbe3ad` has
  no message body and no task), and whether the owner's "hard earned wisdom"
  refers to more than these two records.

Met on the way, not acted on: the comments at `Dollyfile-system-build:82-83`
and `:106-107` and `src/process/bootstrap.c:36` still say `COMPILEC`; the
page's parser collects `runs` (`src/dollyfile-view.mjs:282`) that nothing
reads.

## What the reflection claims and proposes (2026-10-13, unchecked)

- `SLOP` is one line: 25 rows run a script that a `FILE` row wrote, and 9%
  of all recipe text is line continuations. `FILE` has the lexer a body
  needs (`src/dollyfile.c:1687-1700`).
- `RUN`: 5 rows, all in `Dollyfile-system-build:88-112`, to compile Slop
  before Slop exists; `bootstrap.c` already compiles `/bin/dollyfile` first
  and could compile Slop too.
- Engine in the seed and the recipes that use it.
