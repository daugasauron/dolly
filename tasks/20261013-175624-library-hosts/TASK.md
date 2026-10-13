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

## State (2026-10-14, 03:15): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read `main` and
changed nothing (one report in two parts; the other is
[build needs](../20261013-144754-build-needs/investigation.md)). The
integrator checked the engine's check at `INSTALL`, the test for a Wasm
file at sealing, and the owner's quoted words on sockets. It gives no
verdict. What it found:

- The sentence about libraries ("those every program built with it needs")
  entered the document on 2026-10-05 with `sdl2` (`8bfcd884`); its commit
  message says nothing of host modules and no record says it was the
  owner's. The rule it extends is Phase 3's.
- The owner's one ruling near it is on sockets (2026-10-08): "declared only
  by programs that require only at link time. Things that don't need it to
  run shouldnt require it." `libevent` follows it and says so in a comment.
- What the line does, mechanically: it is checked against the installer's
  declared modules (or what `nena` enabled) at the `INSTALL` row and by the
  page's graph; it is written into the package's receipt; and the package's
  own kept programs are checked against it at sealing. It never reaches a
  consumer's list. An archive is not scanned: sealing opens only files that
  begin as Wasm modules. What stamps a program is the module's client that
  its link pulls in.
- Of 22 packages that are libraries in this sense, 16 give the same answer
  under both readings (12 declare nothing and call no module; `sdl2`,
  `raylib`, `curl` and `janis` declare what their code calls). Five leave
  an optional path to the program and declare nothing for it: `openal`
  (the player writes to `audio@0`), `libevent` and `libuv` (sockets), `lua`
  (loading modules), `mojo` (its library over `gpu@0`); each says so in a
  comment, not in its manifest.
- Where the readings part is when a session is told: with the module on the
  library, at `amy install` (and an image without it can never install the
  library, also for its other half: the speech images and a llama.cpp
  library); without it, at the program's start. Since `nena@0`, on
  `default` either is one command (`nena enable NAME`); on the 19
  applications without `nena@0` either is final.
- `curl`'s `http@0` refuses nothing today: every application and toolchain
  declares it.
- Not found out: whether the display's plugin carries a stamp; whether the
  sockets ruling was meant for every module a library can reach; why
  `zero-ad-deps` declares `audio@0`.

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
