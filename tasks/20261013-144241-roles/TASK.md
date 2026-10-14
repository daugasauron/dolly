# Investigate: the Dollyfile's three roles, APPLICATION, TOOLCHAIN and PACKAGE

- STATUS: CLOSED
- PRIORITY: 240
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

## Closed (2026-10-14)

Owner (2026-10-14), on the tasks that waited for him: "I'm not gonna go
through 35 tasks, I'm sure some are not relevant anymore and some are
confirmed actual good fixes. If your investigation confirms they are fixes
that improve things and aligh with the main goal of the project go ahead. If
you're uncertain, give me a short description".

Nothing changes in the language. The role replaced two guesses of the start
page and is the only key of six things outside the engine; "opens is `ENTRY`
plus `display@0`, not the role" is a sentence of the design. What it met on
the way is closed in
[the eight build images that open](../20261013-161624-build-only-entry/TASK.md).

## State (2026-10-14, 01:15): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read
`integrate/round-1013` and changed nothing. The integrator checked its counts
(20 applications, 33 toolchains, 77 packages; 31 toolchains with an `ENTRY`,
`system-build` and `zig-build` without), two quotes of the design task and
three line references. It gives no verdict. What it found:

- The roles came on 2026-10-01 with Dollyfile 6, from the owner's remark
  that `javascript`, `python` and `ripgrep` were "listed as applications;
  they read as build images" and his list: "image roles cover application,
  build toolchain and package". Before, the start page guessed "build
  images" from a name (`/-(build|sdk|runtime|tools)$/`) and whether an image
  opens from `display@0`. The role replaced the guess: "the one fact the
  tools had to guess" ([the design](../20261001-214000-dollyfile-v6/TASK.md)).
- Two things the reflection reports as findings are sentences of that
  design: "Openability is `ENTRY` plus `display@0`, not the role, so
  `system`, `rust-tools` and `typescript-build` stay inspectable while
  `system-build` only builds", and "`FROM` may name an application".
- "One check" is true of the engine (`src/dollyfile.c:1810`) and not of the
  tree. The role is the only key of: the start page's three groups, the
  index `amy` reads, the gate of the `packages@0` service, the list release
  acceptance skips, the "Hosted on" group of the GitHub pages, and the
  lint's `display@0` rule. A package differs in the engine by four checks,
  not one, and the receipt records the role so that `FROM` a package and
  `INSTALL` of a toolchain are refused from the sealed image.
- Where the role is the only statement of a fact: that an image can be
  installed into a session; that a `FROM` keeps nothing of the base; that a
  missing `ENTRY` is an error (application) and not a build-only image
  (toolchain); that a missing `display@0` is an error.
- Where it is not: "not meant to be opened". Eight toolchains whose README
  says "build-only" have an `ENTRY` and so a page (`zero-ad-deps`,
  `zero-ad-engine`, `zero-ad-spidermonkey`, `llvm-build`, `llvm-tablegen`,
  `mojo-build`, `mojo-llvm`, `tools-build`). `rust-tools` is a toolchain
  that nothing builds on and people open. `llvm-runtimes` is a package the
  tests exempt as "a build stage".
- Every change of role in the history went toward `PACKAGE` (`sdl2-build`;
  `pi`, `codex`, `speech-to-text`, `mojo` on 2026-10-13, each with a renamed
  application that opens into it). A language of two roles is first written
  in the audit of 2026-10-12; no earlier record weighs it.
- The reflection's example "`zero-ad FROM default`" was already false on the
  day it was written (`eb737786`).
- Not found out: why the eight build-only toolchains keep an `ENTRY`;
  whether the lint's display rule ever caught a recipe; what the owner
  thinks of `rust-tools`' role and of `llvm-runtimes`'.

## What the reflection claims and proposes (2026-10-13, unchecked)

- The engine tells `APPLICATION` from `TOOLCHAIN` by one check, "missing
  ENTRY" (`src/dollyfile.c:1810`); 32 of 34 toolchains have an `ENTRY` and
  open; both can be a `FROM` base. The split that matters is at 1401: a
  package keeps nothing of what it is built on.
- The lint's "an APPLICATION needs display@0"
  (`scripts/lint-dollyfiles.mjs:68`) names a module where "has an ENTRY"
  says it.
- A change to the language: the owner's to confirm.
