# Is the core in line with the direction: Dollyfile, host modules, the browser runtime, read against the Unix philosophy

- STATUS: OPEN
- PRIORITY: 335
- TAGS: audit,core,owner

Owner (2026-10-13): "When I told you to audit the project I mean that I want
you to reflect if the current code is in line with the architectural
direction. I want to get the core right, Dollyfile syntax, host
modules/bridge, browser runtime etc. It should be as clean and small as
possible in order to be extensible. Think unix philosophy (this is a core
thing)." And: "you mentioned that complete rebuilds is a problem. This is
intentional, this way is robust and reliable but changing stuff does mean
rebuilding a lot of stuff. That is also why I want to get the core parts
right. It's still in development, and I want backward compatible versions
for now."

Done when: for each part of the core (the process contract, the Dollyfile
language, host modules and `nena`, the browser runtime, the base images) this
task says where the code follows the direction and where it does not, each
with its evidence, and what the smallest change is that brings it in line;
ranked by how much smaller and more composable the core gets, not by what a
change costs to rebuild.

## State (2026-10-14, 00:00)

[The reflection](reflection.md) is in, by a Fable agent that read `main`
`d89bca74` and changed nothing. The owner read it: "The audit is too blunt.
Some of the points are good but some are garbage. Both SLOP and RUN are
needed, see the history, this is hard earned wisdom. Create tasks to
investigate each of your points more in detail without deciding if they
should go or not".

So the reflection is a list of claims, not of changes. It gave verdicts from
the code as it stands and did not read how the code came to be so. Each of
its points is a task that investigates and decides nothing: the history
first (the commits and tasks that made the thing, and why), then who uses it
today, then each claim checked, then what a change would break or make
simpler. Nothing of the reflection is acted on before its investigation is
done and the owner has decided.

The points, in the reflection's order:

1. [The Dollyfile's ways to retain, to export and to require](../20261013-144241-dollyfile-words/TASK.md).
2. [`COPY`, and packages that are another image's files](../20261013-144241-copy-directive/TASK.md)
   (with [builds become generic](../20261013-142800-generic-builds/TASK.md)).
3. [`SPAWN_INTERACTIVE`](../20261013-144241-spawn-interactive/TASK.md) and
   [the supervisor's own process tree and limit](../20261013-144241-supervisor-mirror/TASK.md).
4. [The three roles](../20261013-144241-roles/TASK.md).
5. [Modules' headers and clients in the seed, and what a host module is](../20261013-144241-module-sdks/TASK.md).
6. [What every page ships for tests](../20261013-144241-test-surface/TASK.md).
7. [No line discipline](../20261013-144241-line-discipline/TASK.md),
   [no stored file mode](../20261006-120641-umask/TASK.md),
   [no list of processes](../20261013-132514-ps/TASK.md).
8. [The recipe language parsed twice](../20261013-144241-recipe-parsers/TASK.md).
9. [`SLOP` and `RUN`](../20261013-144241-slop-and-run/TASK.md): by the owner's
   word both are needed; the investigation starts from why.
10. [`runtime.h` beside libc](../20261013-144241-runtime-h/TASK.md) and
    [operations that look like twins](../20261013-144241-contract-twins/TASK.md).

## As filed (2026-10-13, main `50c698f8`)

- [The audit of 2026-10-13](../20261012-230015-audit-fable/TASK.md) has five
  reports with the evidence, but its ranking answers another question: it
  puts "iteration speed" first and leads with ways to rebuild less (the
  release version out of references, digests no longer written into
  recipes). By the owner's word those are not defects: complete rebuilds,
  cascading pins and a version in every reference, each release a complete
  copy that keeps working, are the design.
- The direction to read the code against is `AGENTS.md` (the thesis, the
  interface layers, "the core interface must remain small, typed,
  inspectable, and versioned") and the Unix philosophy the owner names:
  small parts that do one thing, compose through plain interfaces (files,
  text, exit statuses), mechanism apart from policy, nothing in the core
  that a program above it could provide.
- What the five reports already found that bears on it, to re-read under
  that question and not copy: `runtime.h`'s nineteen functions of which three
  are needed; fourteen operations that are twins of another; modules whose
  operation numbers sit inside the core's block; `REQUIRES TOOL` and the
  names of `EXPORTS FILE|FOLDER` that nothing reads; `SLOP` too weak, so
  scripts hide in `FILE` bodies; `APPLICATION` and `TOOLCHAIN` differing by
  one check; five checks implemented twice, in C and in JavaScript; a second
  parser of recipes in the page deciding a trust question; the test surface
  `__dolly` shipped in every page; 10,500 lines of trusted JavaScript; the
  supervisor mirroring the kernel's process tree.
