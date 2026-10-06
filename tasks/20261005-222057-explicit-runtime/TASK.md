# Declare runtime@0 in every image; make a runtime a module anyone can name

- STATUS: OPEN
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
