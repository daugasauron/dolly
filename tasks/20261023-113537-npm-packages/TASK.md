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
consumer serves both directories with COOP/COEP. Seven steps, none rebuilds an image. The
npm scope `slopshare` is the owner's to create.
