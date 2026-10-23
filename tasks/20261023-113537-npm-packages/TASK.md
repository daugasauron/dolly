# Dolly as npm packages: a minimal core, and a default package with the terminal

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: core,packaging,0.1.4

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

## State (2026-10-23, 14:45): built and tested; release step left

On `core/npm-packages`, each step verified by the core browser suite in Chromium and
Firefox, local `main` fast-forwarded:

1. `234331ba`: the page names its host modules (their `module.json` URLs); the registry
   (`hostRegistry`) loads only those, on the page and in the Worker.
2. `e936ac95`: device modules (display, input, gpu, audio, microphone, buttons, download,
   upload, sockets, pty) import only their own files: errno in each generated `abi.mjs`,
   leases and the kernel-plugin loader through `get("runtime")`, indicators and the site
   base in the provider context (`host/README.md`).
3. `d65a97cd`: `boot(element, options)`; `terminal.html` is the site's embedding and the
   only reader of the test globals; modules bring their own CSS.
4. `c8ee1f83`: images are found under their own base (`src/images.mjs`, boot's `images`);
   the runtime's own files stay beside it (`runtimeBase`).
5. `cdd4e238`: `scripts/package-npm.mjs OUT` and `test/npm-browser.mjs` (packs, installs
   the tarballs offline into an empty app, boots `docs/embedding.md`'s page in Chromium
   and Firefox; without isolation headers the page says so).

Measured (compressed tarballs, v0.1.3 tree): `@daugasauron/dolly` 188,336 B (the runtime,
92 files; the boot log's font stays with the site), device modules 1,464 to 16,967 B,
`@daugasauron/dolly-default` 4,805,926 B.

Not done, decided against for now: loading the image-building code only when building
(about 13 KB of the runtime; the loader itself parses recipes). Found: a `submit()` sent
before the shell's prompt is lost, so the guide waits with `waitForInteractiveTerminal`;
whether `submit` should wait by itself is a question about the page API.

The release step is in `scripts/release-checklist.sh`: it packs the packages from the
release's commit into `build/npm-vX.Y.Z`, runs `test/npm-browser.mjs`, and prints the
`npm publish … --access public` loop for the owner to run. Left: `docs/deployment.md`'s
release list (a pinned document, repinned in the 0.1.4 round with the other documents), and
the owner's npm account or organization `daugasauron`.

Owner (2026-10-23): "include in the name whether it's a host module or an image,
dolly-NAME and dolly-default has too similar names for something thats very different". The
packages are `@daugasauron/dolly` (the runtime), `@daugasauron/dolly-host-NAME` (one host
module each) and `@daugasauron/dolly-image-NAME` (`dolly-image-default`), as the repository
lays them out (`host/NAME`, images).

## Closed (2026-10-23, `core/runtime-cleanup`): the site's code is out of the runtime package

The owner's step 3 of the core audit (`tasks/20261023-200000-core-audit`, decided by the
integrator): `@daugasauron/dolly` holds only what an embedding runs.

- Page: `src/browser.mjs` is `boot(element, { images, image, modules, site, http })` for an image
  of the image directory, and `run()`, which `src/site.mjs` uses for the site's routes (a rebuild,
  a custom image, a saved session), with the route's steps as one object (`run()`'s comment).
  `terminal.html` boots through `site.mjs`. `boot()` has no `mode` or `loadSession` any more.
- Worker: `src/worker-image.mjs` is what every runtime Worker does around its image (configure,
  host modules, kernel, ENTRY); `src/runtime-worker.mjs` restores an image from its packs,
  `src/build-worker.mjs` builds one or restores a custom one, for the site and the image builder.
- `src/image-artifact.mjs` split: `src/packaged-snapshot.mjs` (an image directory's metadata and
  packs, which `packages@0` also reads) and the site's image cache. `validName` and
  `unretainedPath` moved to `src/image-names.mjs` (Studio stages it). `snapshot@0` checks a
  session's base through `verifyBase`, which the site's route gives `entryStarted`; it no longer
  imports the custom-image or rebuild code. `session-store.mjs` checks a custom record's shape;
  `session-file.mjs` (the site's import) and the custom route parse its Dollyfile.
- Measured: the runtime package's module closure 6,177 lines in 61 files before, 5,222 in 58
  after (the grower Worker of `e0899966` included); its tarball 172,794 B, 68 files; no file of
  `dollyfile-view`, `dollyfile-graph`, `image-build`, `image-builder`, `custom-image`, the cache,
  `site`, `build-worker` or `host/manifests` in it. Trusted JavaScript in total grows by about 70
  lines for the seam (the route object, the Worker skeleton).
- Passed in Chromium and Firefox: `test/npm-browser.mjs`, `core`, `custom-session` (custom rebuild,
  custom run, `/system/rebuild/`, sessions), `threads` (custom rebuild), `host-compute` (the build
  Worker without a page), `host-modules`, `nena`, `process`. `test/image-browser.mjs` fails, before
  and after the change alike (run on `ba0f7f34`'s page code): its rebuild expectations predate
  `system` installing packages (`session-recover`, `core`, `cc`, `make`, `posix`, `ninja`); the
  first one is updated here, the pack list of a fresh rebuild is not.
- `docs/deployment.md`'s release list has the npm packages (steps 3 and 5). Publishing waits for
  the owner's `daugasauron` scope, as `scripts/release-checklist.sh` prints.

