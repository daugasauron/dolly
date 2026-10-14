# Investigate: host modules' headers and clients in the seed, and what a host module is

- STATUS: CLOSED
- PRIORITY: 270
- TAGS: core,host-modules,packages,owner

Owner (2026-10-13), on
[the reflection](../20261013-142800-direction/reflection.md): "The audit is
too blunt. Some of the points are good but some are garbage. Both SLOP and
RUN are needed, see the history, this is hard earned wisdom. Create tasks to
investigate each of your points more in detail without deciding if they
should go or not".

This task investigates one of its points (section 2). It decides nothing.

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

## State (2026-10-14, 01:50): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read
`integrate/round-1013` and changed nothing. The integrator checked the count
of manifests (18) and of the root recipe's header rows (25; none for
microphone, buttons, nena, pty), the includes of the engine and the libc
adapter, five commits and two of the owner's quoted words. It gives no
verdict. What it found:

- A module's client as a library built by a recipe existed and was taken
  out. `modules/gpu.dm` (2026-09-24 to 2026-10-01) fetched `gpu.h`,
  `gpu-abi.h` and `client.c` and built `/usr/lib/libdolly-gpu.a` with `cc`
  and `ar`. `07cf1657` removed it: "The GPU client shipped twice (seed
  sysroot and modules/gpu.dm) and audio only in-image. Every module's
  header and client now come from the seed", six minutes after `790d66ec`
  made `cc` link every client archive by default. The reason given is the
  duplicate, not a design.
- The seed held module headers before modules had a name (`018c5f27`,
  2026-09-27); the manifests of 2026-10-01 only changed how the list is
  made.
- Some headers must be in the seed for a mechanical reason: the bootstrap
  compiles the Dollyfile engine from the seed before the first recipe, and
  `src/dollyfile.c` includes `http.h`; the libc adapter includes `pty.h`
  and `threads.h`; the display plugin includes `display.h` and `input.h`.
  Five modules with a header are included by no core or base source: gpu,
  audio, microphone, buttons, sockets.
- Today the seed holds 33 headers and 15 client archives, and the seed is an
  image input: a change to `gpu.h` makes all 130 images stale. Written out
  as a package, a change to it would rebuild 12 (the package, `gpu-fluid`,
  `mojo-runtime`, `mojo`, `mojo-gpu`, `slopyard`, `local-llm-build`,
  `llama`, `pi-local`, `dollyfile-studio`, `zero-ad-engine`, `zero-ad`), by
  reading the recipes; not run.
- What a new module cost, from the commits of the newest: files outside its
  own directory 13 (pty), 22 (microphone), 15 (buttons), 46 (nena), 78
  (sockets, 73 of them repins); images rebuilt: all, each time, because the
  seed changed. The design's "adding a module touches only its directory
  plus the two review points" holds for none of them.
- The page no longer names a module (`990b2e28`, the CPU/GPU removal). What
  still does outside `host/`: `display@0` as "opens" in the lint, the route
  generator and the menu; the build's three modules; `nena@0` in the engine
  and the loader; `threads@0` in the supervisor; `packages@0` in `amy`.
- "Five kinds under one name": the reflection's own list has seven groups
  and each is true by the manifests. What is one across all eighteen: the
  manifest, `name@version`, the `REQUIRES HOST` line, the registry's
  lifecycle, `ENOSYS` when disabled, and `nena`'s one list.
- `sockets@0` and `pty@0` cross no boundary. The word was the owner's
  choice, against a recorded recommendation of that day ("no declaration;
  local sockets as core process operations"): "Of course it needs to be
  declared", and "declared only by programs that require only at link
  time" ([sockets](../20261007-074904-sockets-module/TASK.md), 2026-10-08);
  `pty@0` followed it. The recipe line is the one statement that a program
  linked with `-ldolly-sockets` runs only in an image that lists the module.
- The owner's own definition, twice: "each module exposed through one
  public host JS module paired with one public C header" (2026-09-26) and
  "A host bridge is one modular component: a host JS module plus the
  runtime C header that maps to it" (2026-10-01). Three modules have no
  header, two no JavaScript to speak of; no later word of his on the pair.
- Met on the way: the root recipe pins by `SOURCE` 25 headers the seed
  already holds, and the four newest modules have no such rows; no commit
  says why either is so.
- Not found out: whether `cc` would link an archive a package installs
  (it scans one directory); the owner's reason for the SDK images of
  2026-09-24; build times of either arrangement.

## What the reflection claims and proposes (2026-10-13, unchecked)

- The compiler image knows every module: `Dollyfile-system-build:9-35,
  65-67` pins 24 headers of 10 modules and `scripts/build.sh:234` packs
  every `libdolly-NAME.a` into the seed. A module is then not "just a
  module": its header is the toolchain's.
- The page and the lint name modules: `src/browser.mjs:223` and
  `src/page-indicators.mjs:33-41` (being removed by
  [no CPU and GPU](../20261013-135951-no-cpu-gpu-category/TASK.md)), and the
  lint's display rule.
- Also here, the same idea: eighteen manifests are five kinds of thing
  under one name (seven devices with an import, four with a mailbox, two
  kernel features with no page side, a supervisor budget, a loader in the
  process's Worker, two page services, a runtime), and `sockets@0` and
  `pty@0` say `HOST` where no host is involved. The mechanism is right; the
  word is the owner's to weigh.
- Changes the seed's contents: the seed branch.

## Closed 2026-10-15

The headers and clients of gpu, audio, microphone, buttons and sockets are the packages `libdolly-*` (`84769767`, signed off 2026-10-14); the images and tests that use them install them. Verified in the round of 2026-10-14/15 on `integrate/round-1014b` (evidence `work/rust/build/round-1014b-evidence/`: source 431/0, artifacts 25/0, the core browser suite and every demo test in their browsers, five GPU tests), fast-forwarded into local `main` (`00caf5ec`).
