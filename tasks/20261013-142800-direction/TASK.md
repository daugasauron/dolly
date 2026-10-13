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

## State (2026-10-13, 23:45)

[The reflection](reflection.md) is in, by a Fable agent that read `main`
`d89bca74` and changed nothing. Its answer: at the machine layer the core is
the direction (one import, one shape of packet, one vocabulary of errors, a
table of modules that gives `nena` a kernel side of thirty lines). One layer
up it is not, in three places: the process contract carries a shell's policy
and a hook for tests while it withholds a line discipline and a stored file
mode; the Dollyfile says "retain" four ways and "run" two, and `COPY` lets a
build image serve as a library with no interface; the supervisor and the
page work out again what the kernel and the engine already decided.

Its ten changes, in its order (how much smaller and more composable the core
gets), each a task of its own:

1. [The Dollyfile says each thing one way](../20261013-144241-dollyfile-words/TASK.md).
2. [`COPY` goes](../20261013-144241-copy-goes/TASK.md), and the base images
   become packages that hold their builds
   ([builds become generic](../20261013-142800-generic-builds/TASK.md)).
3. [`SPAWN_INTERACTIVE` goes](../20261013-144241-spawn-interactive/TASK.md),
   and [the supervisor stops mirroring the kernel](../20261013-144241-supervisor-mirror/TASK.md).
4. [Two roles](../20261013-144241-two-roles/TASK.md).
5. [A module's header and client are its own package](../20261013-144241-module-sdks/TASK.md),
   and the page names no module
   ([no CPU and GPU](../20261013-135951-no-cpu-gpu-category/TASK.md)).
6. [The test surface leaves the product](../20261013-144241-test-surface/TASK.md).
7. [A line discipline](../20261013-144241-line-discipline/TASK.md),
   [a stored file mode](../20261006-120641-umask/TASK.md), and
   [a list of processes](../20261013-132514-ps/TASK.md).
8. [The engine asks for every pin](../20261013-144241-engine-asks-pins/TASK.md).
9. [`SLOP` takes a body, `RUN` goes](../20261013-144241-slop-body/TASK.md).
10. [`runtime.h` is spawn and wait](../20261013-144241-runtime-h/TASK.md), and
    [the contract loses its twins](../20261013-144241-contract-twins/TASK.md).

What changes the language or a contract (1, 2, 4, and the removals in 3, 5,
6, 9, 10) is the owner's to confirm before a row is touched; what is inside
the kernel or the page and changes no contract is taken first, one step at a
time, each with its tests: the supervisor's mirror, the line discipline, the
page side of the test surface.

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
