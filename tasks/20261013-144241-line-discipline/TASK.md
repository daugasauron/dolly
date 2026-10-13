# Investigate: the terminal stores ICANON and ECHO and has no line discipline

- STATUS: OPEN
- PRIORITY: 295
- TAGS: core,kernel,terminal

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
