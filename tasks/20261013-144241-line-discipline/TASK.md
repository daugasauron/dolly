# Investigate: the terminal stores ICANON and ECHO and has no line discipline

- STATUS: OPEN
- PRIORITY: 295
- TAGS: core,kernel,terminal,owner

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

## State (2026-10-14, 01:35): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read
`integrate/round-1013` and changed nothing. The integrator checked six of its
commits, the first commit's reader in `src/dolly.c`, the default mode, and
three of its quotes. It gives no verdict. What it found:

- A line discipline was in the kernel from the first commit (`0d224977`,
  2026-08-29): the reader behind libc's standard input echoed, erased on
  Backspace, turned Enter's `0d` into `0a` and ended a read at Ctrl+D. The
  shell took the raw keys for its own editor by design: "The shell consumes
  the same raw queue for its own line editor; foreground commands consume it
  through ordinary libc stdin". The two flags came on 2026-09-03 as that
  discipline's switch (`07a3cf1e`).
- It was not decided away. Private processes (`b95459ce`, 2026-09-05) read
  the terminal through the process contract, a raw byte at a time, and the
  discipline became code nothing reached. On 2026-09-30 an audit found its
  reader could block the kernel's thread
  ([audit 01](../20260930-100000-audit-01/TASK.md)), and `26277ef5` removed
  "the unreachable WasmFS canonical line discipline". The next day the bits
  were made honest instead of implemented (`b2e6b3f9`) and the rest filed
  as "a terminal-contract decision"
  ([core polish](../20261001-214000-core-polish/TASK.md)). Nothing has taken
  that decision since. The owner's one decision about these bits is `ISIG`
  ("Termios ISIG, the Unix model", 2026-10-01).
- "Nothing acts on them" is true of `ICANON` and `ECHO` and false of the
  other three flags: `ISIG` is acted on in three places, `OPOST`/`ONLCR` in
  two.
- Who carries line handling of their own because of it, from the recipes:
  `sqlite3` (linenoise, brought in), `dc` (its upstream editor switched on),
  `vi` (a six-line header that turns `\r` into `\n`, not an editor), the
  Claude Code launcher's two helpers. Who misbehaves, as measured on
  2026-10-13: `unzip`, `zstd`, `cat`, Slop's `read`, Python's `input()`
  (nothing typed is shown; Enter does not end the line; Ctrl+D ends
  nothing). Slop's editor, and every full-screen program's, is their own on
  any Unix and is not there because of this.
- A terminal is read by two operations: `read` on its descriptor, and the
  timed raw read that Slop's editor and Janis use. Slop never clears
  `ICANON` or `ECHO`. So whether a discipline applied to the second
  operation too decides whether Slop and Janis must change; the first
  commit's design applied it to the first only.
- "One place per kind of terminal" is partly true: a pseudo-terminal is a
  kind, the display's terminal is special-cased in two files. The mode is
  one global for the display and one per pseudo-terminal, and nobody
  restores it after a forced termination (the kernel of 2026-09-03 restored
  it around every command).
- A mapping of `\r` to `\n` tied to `ICANON` would not serve Neatvi,
  which reads without `ICANON` and wants it; as a flag of its own (`ICRNL`)
  it is a sixth bit in `runtime.h`, an image input.
- No test types into `cat`, `unzip`, `read` or `input()` at the terminal, so
  none asserts today's behaviour there and none would prove a discipline.
- Not found out: any word of the owner on the discipline itself; whether
  Python's and QuickJS's prompts set raw mode here (inferred only); what a
  pasted newline becomes; the cost of a line buffer on the kernel's tick.

## What the reflection claims and proposes (2026-10-13, unchecked)

- `ICANON` and `ECHO` "round-trip without a line discipline"
  (`docs/process-model.md:103`): the flags are stored and returned and
  nothing acts on them. Slop edits its own line (`src/slop.c:5010-5050`);
  `sqlite3`, `dc` and `vi` each needed an editor of their own, and `unzip`
  and `zstd` wait at a question until Ctrl+J, because Enter sends `0d` and
  they wait for `0a`
  ([more packages](../20261012-230015-more-packages/TASK.md), the last
  section, has the measurement and a design).
- Unix put this in the kernel so that programs do not carry it.
  `dolly_kernel_socket_kind.terminal` (`src/process-kernel.h:61`) is the one
  place per kind of terminal. No new operation: with `ICANON` a terminal
  read returns an edited line, echoed when `ECHO` is set.
- To find out first: which programs today rely on getting single bytes
  without ever clearing `ICANON` (they worked because nothing was enforced),
  and what the default mode of a new terminal must be so that they do not
  break.
- Kernel C if the discipline lives in the kernel's terminal kinds; say so if
  the libc adapter (an image input) must change too.
