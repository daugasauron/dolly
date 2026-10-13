# Nothing compares the engine's sealed module list with the list the page uses

- STATUS: OPEN
- PRIORITY: 170
- TAGS: core,dollyfile,boundary,tests

Found by [the investigation of the two parsers](../20261013-144241-recipe-parsers/investigation.md)
(2026-10-14, sections 2.4, 2.5 and 6), checked by the integrator. A check at
packaging, in a Node script: no image input.

Done when: for every image that `npm run image` packages, the host list the
engine wrote into the image's receipt is compared with the list the
JavaScript graph gives for its recipe, and a difference fails the build
naming the image and the module; or it is written down why the receipt's
list needs no such check.

## As filed (2026-10-14, `main` `5a756541`)

- The engine writes the declared modules into `/etc/dolly/artifact`
  (`write_artifact_receipt`, `src/dollyfile.c:1030-1033`) and reads them
  back when a package is installed (`:1105-1114`).
- The page takes an image's modules from the JavaScript parser on every
  path: the registry (`scripts/image-definitions.mjs:153`), the packaged
  metadata (`scripts/build-system-snapshot.mjs:159`), and for a rebuilt
  image the recipes inside the snapshot, parsed in JavaScript
  (`src/image-artifact.mjs:184-191`). `git grep "etc/dolly/artifact"` finds
  one JavaScript line, a check that the file exists (`:182`).
- `scripts/snapshot-identity.mjs` compares, for every packaged image, the
  engine's `recipes.lock`, its kept recipes and its `ENTRY` with the graph.
  Not the receipt's host list. The 232 cases both parsers run through are
  synthetic; this would be the same parity over the live catalog for the
  one fact that decides authority.
- What it costs: a reader of the receipt's records in JavaScript (the
  format is `DOLLYART` version 5, written at `:1016-1052`), about twenty
  lines in a script. Whether that is worth its lines is the question.
