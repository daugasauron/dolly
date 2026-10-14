# Investigate: operations of the process contract that look like twins, and how modules get their operation numbers

- STATUS: CLOSED
- PRIORITY: 235
- TAGS: core,process,abi,owner

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

## Closed (2026-10-14)

Owner (2026-10-14), on the tasks that waited for him: "I'm not gonna go
through 35 tasks, I'm sure some are not relevant anymore and some are
confirmed actual good fixes. If your investigation confirms they are fixes
that improve things and aligh with the main goal of the project go ahead. If
you're uncertain, give me a short description".

Nothing changes. The pairs are WASI's and Linux's entry points and were never
one operation: one answers for descriptors that have no path, the other
resolves a path. Merging them gives an empty path a new meaning and every
executable a new identity, and no caller gains. For the modules' numbers the
test asserts what matters, that no two ranges overlap; renumbering
`download` and `upload` changes nothing a program sees.

## State (2026-10-14, 02:15): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read
`integrate/round-1013` and changed nothing (one report in two parts; the
other is [`runtime.h`](../20261013-144241-runtime-h/investigation.md)). The
integrator checked the count of core operations (50), the two modules'
numbers, the clock's two constants, the rule's two lines and the kernel's
refusal of an empty path. It gives no verdict. What it found:

- Every pair was in the contract's first version (`b95459ce`, 2026-09-05).
  None was ever one operation that was split, none has been merged. The
  shapes are WASI's and Linux's, one operation for each entry point that
  Emscripten's musl calls (`__wasi_args_sizes_get` and `__wasi_args_get`;
  `fstat` and `fstatat`; `futimens` and `utimensat`; `fstatfs` and
  `statfs`), which made the adapter one line of translation each. No commit
  names WASI.
- The pairs are not the same thing twice. `FD_STAT` answers for pipes,
  sockets, pseudo-terminals and the terminal, which have no path;
  `PATH_STAT` resolves against a directory and follows a link or not. The
  kernel refuses an empty path today, so "an empty path means the
  descriptor" is new meaning. The two that are closest to one are the
  filesystem statistics: both return the same figures whatever they are
  asked about.
- `CLOCK_RESOLUTION` asks the kernel's own libc, which answers with two
  constants chosen for the browser's two clocks (a millisecond and a
  microsecond, `src/libc-host.c:27-31`). A kernel on another host is the one
  case that would answer differently.
- `TERMINAL` and `FD_LOCK` are not alone in their conventions: five module
  contracts put the operation inside the packet under one number (gpu,
  audio, microphone, buttons, nena), and `ALARM` changes meaning with the
  size of its request.
- `download` (51) and `upload` (57) were core operations and kept their
  numbers when they became modules (`cec22729`, 2026-10-01); the message
  gives no reason, and the same commit restamped every client anyway. The
  one written rule is `process.h:110-111`. Practice shows three habits:
  blocks of 16 (core, threads 144, sockets 160, pty 176), of 8 (http 80,
  input 88), and single numbers in a row (128 to 133). The test asserts
  only that ranges do not overlap. Numbers 44 and 58 are holes left by the
  file modes that lived one day (`26277ef5` to `d41df0cb`, 2026-09-30, the
  owner's one-user decision).
- What a change touches: any edit of `process.h` is a new identity for
  every executable, by the owner's decision that the identity hashes its
  exact bytes ("replicability over rebuild time",
  [audit 9](../20260930-100000-audit-09/TASK.md)): the seed and every
  image. Renumbering `download` and `upload` changes those two modules'
  digests and their two programs; `process.h` and other executables keep
  their stamps.
- No word of the owner on twins or on numbering was found.
- Not found out: whether a stat by descriptor could go through the path
  operation in WasmFS; which programs reach the rarely used operations (a
  scan of the executables would say); whether the two numbers were kept on
  purpose.

## What the reflection claims and proposes (2026-10-13, unchecked)

- 50 operations (`include/dolly/process.h`). Twins: `FD_STAT`/`PATH_STAT`,
  `FD_STAT_FILESYSTEM`/`PATH_STAT_FILESYSTEM`, `FD_SET_TIMES`/`PATH_SET_TIMES`
  though the path request already carries `directory_descriptor`
  (586-592); `ARGUMENT_SIZES` with `ARGUMENTS`; `CLOCK_RESOLUTION` returns a
  constant (`src/process-kernel.c:2201-2215`). Three conventions of packet
  in one contract: `TERMINAL` alone multiplexes six sub-operations
  (298-305), `FD_LOCK` alone changes its response by a flag (157-159).
- `download` uses operation 51 and `upload` 57, inside the core's 48-59;
  `process.h:110` says "never reuse a number below" and nothing says where
  a module starts. `test/host-modules.test.mjs:114` already checks
  collisions.
- Seed.
