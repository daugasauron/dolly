# Declare runtime@0 in every image; make a runtime a module anyone can name

- STATUS: CLOSED
- PRIORITY: 322
- TAGS: core,architecture,host-modules,dollyfile

Owner decision (2026-10-06), on the investigation
`20261002-073000-runtime-process-modules`: "I like explicit things, add
runtime@0. Ideally people can create their own runtimes with the same syntax."

## Today (main `0d1d6e42`)

- `runtime@0` is the one implicit host module: `createHost` always attaches
  it (`host/modules.mjs`), no recipe declares it, and the engine and lint do
  not expect it. All 61 images run on it.
- The module owns the kernel, the process ABI and the image-boot contract
  (`host/runtime/module.json`). Executables carry the process ABI digest, not
  a runtime record: the adapter stopped stamping `runtime@0` when the
  per-module digests landed.

## Work

- Every image declares `REQUIRES HOST runtime@0`, first in its list, like any
  other module. The engine, both parsers, lint, boot and amy treat it by the
  same rules as the rest: nothing is inherited, nothing is implied by the
  role. `host/README.md`, `docs/dollyfile.md` and `docs/browser-boundary.md`
  lose the exception.
- No code attaches or admits a module because it is named `runtime`: the
  host enables what the image declares (builds add the build host's set), and
  the registry finds the module that provides the kernel through its
  manifest, not its name.
- Write down what a runtime is in `host/README.md`, so another one can be
  declared with the same line (`REQUIRES HOST name@abi`): the contracts it
  must provide (process, image boot, supervisor), the seed that belongs to
  it, and how an executable built for one runtime is refused by another.
  Decide whether executables stamp their runtime again or the process ABI
  digest stays the only identity, and record why. This task does not build a
  second runtime; it removes what would stop one.

## Done when

- A recipe without a runtime line fails lint and the build, naming the line
  to add; an image declaring a runtime the page lacks fails before ENTRY with
  its name.
- `grep -n '"runtime' host/modules.mjs src/*.mjs` finds no special case.
- The catalog rebuilds and the source, artifact, browser and demo suites pass.

Changes the seed and every recipe: batch with the input round
(`20261002-072000-input-host-module`).

## Decisions (2026-10-06, `work/explicit-runtime`)

- A runtime is a module whose manifest says `"provides": "kernel"`
  (`host/manifests.mjs` exports the list as `runtimes`). The registry, the
  lint and the kernel module table use only that field. `createHost` attaches
  what it is asked to enable and takes as the kernel the one requested module
  that provides it; a runtime that is attached only because another module
  depends on it does not count, so nothing is inherited through
  `dependencies` either. `host.kernel` replaces `host.get("runtime")`.
- A build host is the runtime the image declares plus `http@0` and
  `threads@0` (`buildHostFor`), so a recipe without a runtime line fails
  before its build starts: `no enabled host module provides the kernel: add
  REQUIRES HOST runtime@0`. The lint says the same per catalog recipe. An
  image naming a runtime this page lacks fails by the ordinary rule, before
  ENTRY and before any large download: `Required host module other@0 is
  unavailable: unknown host module` (`runtime@1`: `host provides ABI 0`).
- Executables do not stamp their runtime; the `dolly.process` stamp stays
  their only identity. The first implementation of this task stamped
  `runtime@0` with a per-module digest from the libc adapter; it was removed
  for these reasons:
  1. The stamp already identifies everything an executable speaks to a
     runtime: the typed process interface and the bytes of `process.h`,
     checked on every executable before instantiation, including ones without
     a libc. A record would add a name and no compatibility information.
  2. The per-module digest covers a module's contracts and headers; for the
     runtime that includes `dolly-supervisor-0.wat` and `dolly-image-0.wat`,
     which executables never see. Measured on this history: of the 13
     non-merge commits since 2026-09-10 that changed the supervisor or image
     contract, 4 changed only the kernel and the page (`ff3a5c19`,
     `b3cff2ab`, `d67ec56e`, `e04d78b5`) and kept every image valid. With the
     digest in
     the adapter (the generated `runtime-abi.h` was in the seed) each would
     have invalidated all 61 images, every package and every saved session.
     Narrowing the digest to the process side needs a rule that exists only
     for the runtime.
  3. Refusal by name would stop a second runtime that implements the same
     process contract from running existing executables; the compile target
     is the interface (AGENTS.md, Thesis).
  4. Images and packages already carry the runtime by the rules of every
     module: the recipe line is in the artifact and its receipt, the page
     requires it before ENTRY, and `INSTALL`/`amy` refuse a package whose
     receipt names a runtime the installer does not declare. The engine
     (`src/dollyfile.c`) and `amy` needed no change and have no rule for the
     name.
- Not done, by the task's scope: `src/runtime-worker.mjs` and the process
  loader load this runtime's kernel, seed and process contract by fixed path.
  A second runtime needs its provider to name them (`host/README.md`).
- Found on the way: the custom route's default recipe (`src/custom-dollyfile.mjs`)
  declared no host modules at all and so could not seal since requirements
  stopped being inherited; it now restates its base's list. The generators
  of `gpu-fluid` and `slopyard` and Studio's two examples and skill also
  lacked the line.

## Verification (2026-10-06, `work/explicit-runtime` at `11a30410`)

The branch holds this change, `integrate/1005-seed` (`db2c9787`) and
`core/decisions` (`567f0c1d`, the target identity seed change); 61 recipes,
each with `REQUIRES HOST runtime@0` first. Logs: `build/runtime-evidence/`.

- `npm run build:runtime`: runtime `sha256:208422a3…`, image inputs
  `sha256:22d006cac2c84ef3f6b4fc0358c2386f8df7b207a8d3e13a1da0e8a41fac0b81`,
  the hash `core/decisions` printed: this change adds nothing to the seed
  (with the stamp it was `5f2a2ce2…` on the old base). The Rust seed of
  `core/decisions` therefore verifies unchanged
  (`demos/rust/build-rust-toolchain.sh`: "verified cached Rust compiler seed").
- `npm run -s test:source`: 361 pass, 0 fail (lints every recipe; the lint
  case writes a recipe without the line and expects `add REQUIRES HOST
  runtime@0`).
- Images through the slot, one builder: the `default` chain, `minimal`,
  `amy`, `cc`, `core` and `python` (15 images, 1,078 s), then the `pi` chain
  (10 more, 408 s). No recipe pin changed during the builds.
- Browser suites, Chrome and Firefox each: `core`, `host-modules`,
  `boundary`, `image`, `custom-session`, `minimal` and `host-compute` pass.
  `host-modules` builds a root recipe without a runtime line (refused with
  the line to add) and one naming `other@0` (refused by that name), neither
  starting a build. `custom-session` now extends the custom route's default
  recipe, so that recipe is proven to seal.
- `amy`: the cases `amy` (installs `python`, a threaded package, a session),
  `amy cc` and `amy refusal` pass in both browsers. `amy programs` was not
  run: it installs `cmake`, `sdl2`, `rust` and `codex-cli`, which are not
  built here.
- `npm run -s test:demos -- pi`: passes in Chrome (51 s).
- `npm run -s test:artifacts`: 24 pass against the 25 images built here; its
  per-image checks saw only those.

Open: the full catalog rebuild and its suites (the integrator's seed round,
`integrate/seed-1006`).

## Closed 2026-10-07

In the release candidate (`integrate/next`, `ab412d94` on `main`): all 66
recipes declare `REQUIRES HOST runtime@0` first; `grep -n '"runtime'
host/modules.mjs src/*.mjs` finds no special case; the `host-modules` suite
holds the two refusals (no runtime line; `other@0`). Catalog rounds that
rebuilt every image on it: the seed round (61 images, `9077dda1`) and the
main round (67 images, pins `b07a89ee`), with source 400/400, artifacts
23/23 (`finish2-artifacts.log`), core browser suites green in Chromium and
Firefox and the demo suites passed (`20261005-132713-round-1005`, "06:30,
2026-10-07"; logs `work/next/build/next-evidence/`).
