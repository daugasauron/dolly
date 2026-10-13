# Investigate: what a library package declares of host modules (sdl2 and raylib declare what their programs need, mojo and openal do not)

- STATUS: OPEN
- PRIORITY: 253
- TAGS: core,dollyfile,packages,host-modules,owner

Met by two of the investigations of builds in the night of 2026-10-14
([the engines](../20261013-145359-builds-engines/investigation.md), section
A4(a); [the views](../20261013-145359-builds-views/investigation.md),
section 3.1). A question of the language, the owner's. This task
investigates it and decides nothing.

Done when it holds, with the evidence and without a verdict: how the rule
came to be (commits, tasks, the owner's words), what the engine and the
loader check today, what each package of a library declares and what its
archive stamps, the cases where the two readings give different results
(who can install what, what a session is refused, what `nena` changes), and
what could not be found out.

## As filed (2026-10-14, `main` `a3c173b7`)

- The document: "A package also declares the modules its programs need, a
  library or compiler those every program built with it needs (`sdl2`:
  `display@0` and `input@0`, `rust`: `threads@0`, `cc`: none); `INSTALL`
  checks that the installing recipe declares them too"
  (`docs/dollyfile.md:216-219`).
- The engine checks executables, not archives: sealing scans every retained
  executable for stamped modules. An archive stamps nothing; the program
  that links a module's client is stamped.
- Today's packages answer both ways. `sdl2` and `raylib` declare
  `display@0` and `input@0`. `openal` declares `runtime@0` alone: its
  library has no playback backend, a program writes the samples to
  `audio@0` itself (the ruling of 2026-10-12 read it the other way). `mojo`
  ships a library over `gpu@0` and says: "A program with a kernel needs
  gpu@0, which this package does not declare: it runs in an image that
  does". `llama` declares `gpu@0`, and `default` refuses it by that name.
- Where the readings part: a llama.cpp library package with `gpu@0` could
  not be installed by the speech images, which use its CPU half; without
  it, a program linked against it is refused at start unless its own image
  declares the module. Since 2026-10-13 a session with `nena@0` can enable a
  module, which changes what a refusal costs.
