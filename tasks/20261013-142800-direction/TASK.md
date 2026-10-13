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
