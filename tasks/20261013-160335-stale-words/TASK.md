# Left by the investigations: comments that still say COMPILEC, a field of the page's parser nothing reads

- STATUS: OPEN
- PRIORITY: 110
- TAGS: core,cleanup,seed

Met by the investigations of 2026-10-14 while reading, checked by the
integrator, not acted on. None of it is a decision about the language.

Done when: each is corrected or removed in the round that rebuilds what
holds it, and the suites pass.

## As filed (2026-10-14, `integrate/round-1013` `3c50a513`)

- `COMPILEC` has been `RUN` since 2026-10-01 (`5ec4783c`). Three comments
  still name it: `Dollyfile-system-build:83` ("so COMPILEC builds them") and
  `:106`, and `src/process/bootstrap.c:36`. The first two are in the root
  recipe and the third in the seed: a correction rebuilds every image, so it
  rides a catalog round
  ([SLOP and RUN](../20261013-144241-slop-and-run/investigation.md)).
- `src/dollyfile-view.mjs` collects every `RUN` row into `runs` (lines 179,
  282, 307). `git grep -w runs` finds no reader in the page, the scripts or
  the tests. Whether Dollyfile Studio's image carries the file and has to be
  rebuilt with it is to be checked first.
- The reflection's figure "181 of 364 `FILE` rows without a body" is wrong
  (471 rows, 183 with a body, 288 without); corrected in
  [the investigation](../20261013-144241-dollyfile-words/investigation.md),
  nothing in the tree repeats it.
- `src/custom-dollyfile.mjs:42` refuses a recipe whose `kind` is not
  `"image"` ("Upload an IMAGE recipe, not a MODULE"). Since modules went on
  2026-10-01 (`5ec4783c`) the parser's `kind` is the constant `"image"`
  (`src/dollyfile-view.mjs:306`): the check cannot fail and the field says
  nothing ([the roles](../20261013-144241-roles/investigation.md)).
