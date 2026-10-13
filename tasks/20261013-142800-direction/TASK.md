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
for now." And, the same evening: "The long term goal is that the core things
(that triggers rebuilds of everything), like the slop shell, runtime, modules
etc, become stable and reusable. Recently we're rebuilding from the core all
the time because the core has issues. This is expected but the long term goal
is to get away from that."

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
   unreachable and it was removed as a hazard, not by decision.
   [No stored file mode](../20261006-120641-umask/TASK.md): the owner
   decided "one user, no permission bits" on 2026-09-30 with its reason;
   an unchanged `configure` needs two commands that exit 0, and a branch
   that stores and enforces modes is built and waits. No list of
   processes: [ps](../20261013-132514-ps/TASK.md), done.
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

## The core's size, counted (2026-10-14, 06:20)

A baseline for "as clean and small as possible", with no verdict. Lines of
tracked text per part at two releases and on `main` `a90eb4e6`, counted with
`git grep -Ic '' REF` by path; the generated tables under
`src/ghostty/generated` and `src/zig` are left out.

| Part | v0.1.0 (10-08) | v0.1.2 (10-11) | `main` (10-14) |
| --- | ---: | ---: | ---: |
| kernel and snapshot C (`src/*.c`, `*.h`, `*.cpp` without the rows below) | 4,492 | 4,515 | 4,684 |
| the process side below libc (`src/process/`) | 4,538 | 4,538 | 4,549 |
| contract headers (`include/`) | 861 | 861 | 861 |
| machine contracts (`abi/`) | 403 | 410 | 417 |
| page JavaScript (`src/*.mjs`) | 4,121 | 4,121 | 4,169 |
| host modules (`host/`) | 11,244 | 12,313 | 13,283 |
| the shell (`src/slop.c`) | 5,380 | 5,380 | 5,381 |
| the recipe engine (`src/dollyfile.c`) | 2,183 | 2,183 | 2,282 |
| commands (`src/commands/`) | 2,875 | 2,875 | 4,845 |
| the root's recipes (`Dollyfile*`) | 3,587 | 3,590 | 1,907 |
| compiler driver and libcurl adapter | 2,974 | 2,974 | 2,975 |
| display plugin (`src/ghostty/` without `generated/`) | 1,018 | 1,046 | 1,046 |
| build scripts (`scripts/`) | 5,630 | 5,651 | 5,687 |
| `toolchain/`, `config/` | 1,928 | 2,012 | 2,262 |
| **summed** | **51,234** | **52,469** | **54,348** |
| tests (`test/`) | 14,898 | 15,656 | 17,006 |
| demos (`demos/`) | 66,263 | 73,677 | 82,566 |

- The browser's trusted JavaScript, `src/*.mjs` and the modules' `.mjs`: 9,723,
  10,204 and 10,564 lines. The modules: 16 at v0.1.2, 18 now (`nena`, `pty`).
- Commands and recipes moved against each other: 23 command sources that
  were bodies in the root recipe became files of `src/commands/`. Together
  the two rows went from 6,465 to 6,752.
- Since v0.1.2, in `src`, `include`, `abi`, `host`, `scripts`, `toolchain`
  and `config`: 114 files changed, 3,829 lines added, 267 removed
  (`git diff --shortstat`).
- Lines compare a part with itself over time. They do not weigh one part
  against another.

"The core never depends on `demos/`" (`AGENTS.md`), checked by search on the
same commit: no file under `src/`, `include/`, `abi/` or `host/` and no
recipe of the root names `demos/`. `scripts/` reaches the demos in seven
lines, each by scanning `demos/*/` for recipes, READMEs and
`prepare-sources.sh`; none names a demo. One core test does:
`test/amy-browser.mjs` installs every package of the catalog into `default`,
the demos' among them, so the core suite passes only where the demos'
packages are built.

"Avoid feature flags" (`AGENTS.md`), checked by search on the same commit:
the page reads URL parameters in one place, a session route's `name` and
`recover` (`host/snapshot/snapshot.mjs:15`), and keeps nothing in
`localStorage`; `sessionStorage` carries a custom recipe's text from one page
to the next (`src/custom-dollyfile.mjs`, `src/custom-image.mjs`). The scripts
read six names from the environment: which images (`DOLLY_BUILD_IMAGES`,
`DOLLY_SNAPSHOT_IMAGE`), how many at once (`DOLLY_IMAGE_JOBS`,
`DOLLY_BUILD_JOBS`), and where (`DOLLY_PORT`, `DOLLY_BROWSER_PROFILE`). None
turns a behaviour on or off. The other `DOLLY_*` names in `scripts/` are the
294 pins of `config/source-pins.sh`.

"An unimplemented operation cannot return success" (`AGENTS.md`), a narrow
search on the same commit: in `src/process/`, `src/process-kernel.c`,
`src/libc-host.c` and `src/dolly.c`, five functions have a body that is only
`return 0`: the four user and group ids (`src/process/libc-adapter.c:759-762`;
one user, by the decision of 2026-09-30) and `sched_yield`
(`src/process/threads.c:84`, with its reason). One operation says it does
nothing on purpose: `posix_fadvise` checks the descriptor and the advice and
changes nothing (`src/process/libc-adapter.c:608`). The search does not find
an operation that checks its arguments and then returns 0 without an effect.
The known ones are in [file modes](../20261006-120641-umask/TASK.md):
`chmod`, `fchmod` and `chown` check that the file exists and store nothing
(`src/process/libc-adapter.c:934-976`), and `umask` keeps a value per process
that nothing applies (`:767`).

"Maintain the review map" (`AGENTS.md`): `docs/browser-boundary.md` has a row
for each of the 18 directories under `host/`. What each row says was not
read against the code tonight; the boundary's audit of 2026-10-13 did that.

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
