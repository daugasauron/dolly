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

## State (2026-10-14, 02:20): each point is investigated; none is decided

[The reflection](reflection.md) came from a Fable agent that read `main`
`d89bca74` and changed nothing. The owner read it: "The audit is too blunt.
Some of the points are good but some are garbage. Both SLOP and RUN are
needed, see the history, this is hard earned wisdom. Create tasks to
investigate each of your points more in detail without deciding if they
should go or not".

So each point became a task that investigates and decides nothing. In the
night of 2026-10-14 each was read by a Fable agent, read-only: the history
first (the commits and tasks that made the thing, and the owner's words in
them), then who uses it today, each claim checked, and what a change would
touch on real cases. The integrator checked each report's counts, commits
and quotes against the tree before storing it. Every task holds its report
(`investigation.md`) and a summary under "State". Nothing of the reflection
is acted on; the tasks stay open for the owner.

What came out, in one line each (the tasks hold the evidence):

1. [The words to retain, export and require](../20261013-144241-dollyfile-words/TASK.md):
   the owner ruled on them in Phase 3, "the assertions are the explicit
   contract"; the four ways to retain differ in when they look; "one row
   later" is the exception.
2. [`COPY`](../20261013-144241-copy-directive/TASK.md): designed for
   multi-stage builds before `INSTALL` and packages existed and kept beside
   them on purpose; half of its 108 rows copy licences; three uses have no
   equivalent without it.
3. [`SPAWN_INTERACTIVE`](../20261013-144241-spawn-interactive/TASK.md): the
   flag took two program names out of the page and stands in for "not in
   the foreground process group"; the owner's one decision on Ctrl+C is
   `ISIG`. [The supervisor's own tree and limit](../20261013-144241-supervisor-mirror/TASK.md):
   its limit came from a security audit, as a bound that holds when the
   kernel lies; a memory budget in its place was decided on 2026-10-01 and
   not built.
4. [The three roles](../20261013-144241-roles/TASK.md): the role replaced
   two guesses of the start page and is the only key of six things outside
   the engine; "opens is `ENTRY` plus `display@0`, not the role" was written
   into the design.
5. [Modules' headers and clients in the seed](../20261013-144241-module-sdks/TASK.md):
   a client built by a recipe existed for a week and was removed as a
   duplicate; five modules' headers are in the seed without the core
   including them; `sockets@0` and `pty@0` are modules by the owner's word.
6. [What every page ships for tests](../20261013-144241-test-surface/TASK.md):
   the published result is from the first commit and was the page's own
   way to drive its shell; what `__dolly` is has been put to the owner four
   times and never answered.
7. [No line discipline](../20261013-144241-line-discipline/TASK.md): the
   first commit had one in the kernel; private processes made it
   unreachable and it was removed as a hazard, not by decision. No stored
   file mode: [umask](../20261006-120641-umask/TASK.md), not investigated
   this night. No list of processes: [ps](../20261013-132514-ps/TASK.md),
   done.
8. [The recipe language parsed twice](../20261013-144241-recipe-parsers/TASK.md):
   the page parses because a build's base holds the engine, so the base
   must be there before a row can be read; the list the page trusts is
   hashed recipe text, never a field Wasm wrote.
9. [`SLOP` and `RUN`](../20261013-144241-slop-and-run/TASK.md): `RUN` came
   on 2026-10-01 as the general form of `COMPILEC`, so that the recipe and
   not the bootstrap builds Slop; what the reflection proposed is the state
   of 2026-09-05.
10. [`runtime.h` beside libc](../20261013-144241-runtime-h/TASK.md): it was
    the libc before there was one, and libc now sits on it; three kinds of
    spawn have no POSIX spelling. [Twin operations](../20261013-144241-contract-twins/TASK.md):
    the pairs are WASI's and Linux's entry points and were never one
    operation; how modules get their numbers is three habits and one line.

A pattern in the ten: the reflection read the code as it stands. In eight of
them the history holds a design task or a decision of the owner that it did
not read ([Dollyfile 6](../20261001-214000-dollyfile-v6/TASK.md),
[the bootstrap boundary](../20261001-123500-bootstrap-boundary/TASK.md),
[Ctrl+C and `ISIG`](../20261001-000500-slop-loop-interrupt/TASK.md),
[audit 19](../20260930-100000-audit-19/TASK.md),
[audit 24](../20260930-100000-audit-24/TASK.md),
[sockets](../20261007-074904-sockets-module/TASK.md)).

Met on the way and filed, none acted on:
[stale words in comments and an unread field](../20261013-160335-stale-words/TASK.md),
[eight build-only toolchains that open](../20261013-161624-build-only-entry/TASK.md),
[no test of a trap with running children](../20261013-163336-crash-with-children/TASK.md),
[nothing compares the engine's module list with the page's](../20261013-170737-receipt-hosts/TASK.md).

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
