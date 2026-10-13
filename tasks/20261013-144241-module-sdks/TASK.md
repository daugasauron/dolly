# A host module's header and client are its own package; the seed keeps the contract and libc

- STATUS: OPEN
- PRIORITY: 270
- TAGS: core,host-modules,packages

Owner (2026-10-13): "I want to get the core right, Dollyfile syntax, host
modules/bridge, browser runtime etc. It should be as clean and small as
possible in order to be extensible. Think unix philosophy (this is a core
thing)." One issue of
[the reflection on the direction](../20261013-142800-direction/TASK.md)
([reflection](../20261013-142800-direction/reflection.md), section 2).

Done when: `gpu.h` and `libdolly-gpu.a` come from a package beside
`host/gpu/`, and so for every module with a client; a recipe that compiles
against a module installs its package, and `REQUIRES HEADER gpu` checks a
real export; the seed holds `process.h`, `runtime.h`, `toolchain.h` and
libc; nothing in the page or the lint names one module.

## As filed (2026-10-13, main `e330d782`)

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
