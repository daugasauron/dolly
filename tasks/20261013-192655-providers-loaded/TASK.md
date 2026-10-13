# Investigate: every provider's JavaScript is loaded on every page

- STATUS: OPEN
- PRIORITY: 105
- TAGS: core,boundary,host-modules,owner

Row B7 (C2) of [the boundary audit of 2026-10-13](../20261012-230015-audit-fable/boundary.md),
the last row of that audit that was neither fixed nor investigated. This
task investigates it and decides nothing.

Done when it holds, with the evidence and without a verdict: how the
registry came to import every provider, what a page loads today (files and
bytes, by image), each claim below checked, what loading a provider only
when its module is enabled would mean on real cases, and what could not be
found out.

## State (2026-10-14, 04:40): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read `main` and
changed nothing. The integrator checked `default`'s twelve modules, the
sizes of the GPU files, the two places that already load on use, and the
quoted step of audit 24. It gives no verdict. What it found:

- The registry has imported every provider since it was born
  (`018c5f27`, 2026-09-27, eight static imports); the manifests of
  2026-10-01 made it one `import()` over all eighteen at load. The comment
  beside it ("Images select no JS or Worker URLs") answers who chooses the
  file, not when it is fetched. Loading on demand was proposed once, as
  step 4 of [audit 24](../20260930-100000-audit-24/TASK.md), and is open
  there; no word of the owner on it.
- What a `default` page requests: 76 JavaScript files (1.2 MB, of which
  0.84 MB is the generated list of images) and 18 manifests; the runtime
  Worker requests almost the same again, since a Worker has its own module
  map and nothing bundles the page. The six modules `default` does not
  declare (gpu, audio, microphone, buttons, build, pty) cost 15 files and
  41,577 bytes on each side: 3.4% of the page's JavaScript, 0.25% of a
  first load (the image is 14.3 MB).
- The heavy parts already load on use: the GPU's Worker (45 KB) when
  `gpu@0` starts, the build's panel inside its provider, the microphone's
  worklet at open, the loader of shared objects at `dso@0`'s start.
- Importing a provider does nothing to the page: every provider's top
  level is declarations; the DOM, `navigator` and listeners are reached
  only when a module is enabled. So the authority of an imported, unenabled
  provider is none.
- "`enable()` already has the await" is true of `enable`, but the registry
  uses provider objects in three other places: the boot selection calls
  every provider's `boot` before any module is enabled, the loader reads a
  provider's digest for a declared module that a build host does not
  enable, and the Worker attaches on its own side. Each would need the
  import too.
- A late import finds its file as long as the version is published (files
  under `/vX.Y.Z/` never change); offline it fails unless the browser
  cached it; a session's recorded modules are re-enabled under a 3 s
  timer, which an import would share.
- For a reviewer: today the same eighteen files can run on every page and
  one line says so; with imports at enable the same eighteen are possible
  and a page loads fewer, at the price of following the import through two
  more places on each side.
- Not found out: the time a late import adds on a slow connection; whether
  the Worker's second fetch of the same files is served from cache.

## What the audit claims and proposes (2026-10-13, unchecked)

- "Every provider is imported on every page (`modules.mjs:7-8`), 18 `host`
  files whether or not the image can use them."
- Its fix: "Import a provider's JavaScript when its module is enabled, not
  at registry load (`host/modules.mjs:7-8`): a `default` page then loads no
  GPU, audio, microphone or buttons code, and `enable()` already has the
  await for it." Cost: "cheap".
