# Dolly as npm packages: a minimal core, and a default package with the terminal

- STATUS: OPEN
- PRIORITY: 200
- TAGS: core,packaging,owner

Owner (2026-10-23): "I want to use fable to plan how to make this project into npm
packages. There should be one minimal core package, and then a "default" package to add
on the minimal default image and ghostty etc to get the terminal."

Done when the plan is in `plan.md` here, read by the owner, and the steps he accepts are
tasks of their own.

## State (2026-10-23, 12:00): planned, the owner's to read

[plan.md](plan.md), by a read-only Fable agent (the owner then dropped versioning and
bundlers from its brief). Spot-checked: `dolly` on npm is taken (0.0.3, 2022), the kernel
is 216,588 B and the seed 107,907,302 B, and the cited lines of `src/static-asset.mjs`,
`host/display/kernel.c`, `src/dolly.c` and `src/image-artifact.mjs` say what the plan says.

In short: `@slopshare/dolly` (kernel, process runtime, all host-module providers, page code,
no image, about 266 KB compressed) and `@slopshare/dolly-default` (the `default` image's
packs, metadata and recipes, 4.9 MB compressed, Ghostty's plugin and font 59% of it), cut
from a sealed release at checkout paths; `boot(element, { image, hostModules, http })`; the
consumer serves both directories with COOP/COEP. Seven steps, none rebuilds an image.

Owner (2026-10-23): "use daugasauron org", so the names are `@daugasauron/dolly` and
`@daugasauron/dolly-default` in place of the plan's `@slopshare/`. Whether `daugasauron`
exists on npm could not be seen from here (npmjs.com answers 403 to scripts; no package is
published under that maintainer or scope; this machine has no npm login). The plan's day
counts are its own guesses, not measured.

## The work (2026-10-23, 13:30)

Owner: "Ok start this work. It doesn't have to be 2 modules, feel free to split more. I'm not
sure I want all host modules to exist in the "default" adding. The main purpose is that the
runtime is as small as possible, and that the core modular host interface concept is clear."

Decided, on branch `core/npm-packages` (tree `work/x11fix`):

- Packages: `@daugasauron/dolly`, the runtime (kernel, process runtime, the host registry and
  `runtime@0`, which provides the kernel); one package per other host module,
  `@daugasauron/dolly-NAME`; `@daugasauron/dolly-default`, the `default` image, depending on
  the module packages it declares. Building images (`build@0`, rebuild mode, custom images,
  `dolly.data`) stays with the site for now.
- The embedding names the host modules a page has (their `module.json` URLs); the registry
  loads only those, on the page and in the Worker. `host/manifests.mjs` stays the list of
  modules this repository builds, and the site's page passes all of them.
- A host module imports only its own files. Today 20 module files import
  `../../src/process-constants.mjs` (all for `DOLLY_ERRNO`) and others reach `src/` for
  indicators, leases, site paths, the kernel plugin loader and the image registry: errno goes
  into each module's generated `abi.mjs` (as a module's C includes `<dolly/process.h>`), the
  rest comes through the context the registry gives a provider, documented in
  `host/README.md`. npm installs each package in its own directory and Workers have no import
  maps, so a relative import into the core would break, and an import rewrite at packaging
  would publish code that differs from the repository's.
- Then `boot(element, options)`, images found under their own base URL, the build path out
  of the runtime's static imports, the packaging script and a browser test of the packed
  tarballs. No step changes an image input.
