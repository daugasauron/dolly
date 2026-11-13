# Dollyfile: one parser for every host, a line for files no row keeps, init without FROM, clearer docs

- STATUS: OPEN
- PRIORITY: 260
- TAGS: dollyfile,syntax,donna,docs,audit,0.1.6

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, D1-D4).

## State (2026-11-12)

On `fix/batch`:

- 1, decided: the page's parser stays the one parser and `recipe.rows` is the engine's stated
  input (`docs/dollyfile.md`, its first paragraph; `DOLLY 7` and the recipe's SHA-256 head it).
  A parser in C as Wasm would move 335 lines and add a module every page that reads a recipe
  loads; no host builds images without a page today (Donna runs built ones).
  Since (evening): Donna builds a recipe it is given rows for, and asks where the rows of a
  catalog recipe come from. Decided: the image directory publishes each catalog recipe's
  `recipe.rows` beside it, which the catalog build writes with the one parser, so a host
  rebuilds catalog images without parsing; no second parser in Rust. Only if a host must build
  from text a person writes does the parser move to C in the engine, the page then using it too.
  Next: the rows files, their digest in the catalog record, and `abi/README.md`.
- 2 is done (`report_unkept` at sealing, `src/dollyfile.c`); it prints in the pip case once the
  round runs.
- 4 is in `docs/dollyfile.md`: INSTALL's and FROM's meaning by role in the table, and the
  opening rule is the site's.
- 3 is in (2026-11-13, `fix/audit-0.1.6`): a root build whose rows `INSTALL` the `dollyfile`
  package starts, as a `FROM` build does, from that package's `/bin/dollyfile` alone
  (`src/build-worker.mjs`, `dolly_process_bootstrap_resume_prepare`), so it never loads the seed:
  `test/default-browser.mjs` "composed with the engine" passes in Chromium and Firefox (no request
  for `dist/dolly.data`). `dolly-build init` writes `INSTALL` rows of Pi's packages (`pi-minimal`'s:
  core, dollyfile, posix, display, curl, pi-dolly), which `dolly-build` depends on, then the named
  packages, the template's rows and `ENTRY`; `dolly-build` builds a recipe `FROM` an image or one
  that installs `dollyfile`. `config/npm-images.txt` lists `pi-dolly`'s closure (17 packages more).
  Left: `test/npm-browser.mjs` in the round, which packs the full catalog; `pi-minimal` built this way
  matches the seed-built one file for file.

## Do

1. The only parser is page JavaScript (`src/dollyfile-view.mjs`); the engine reads `recipe.rows`,
   whose format is one comment. A host without JavaScript (Donna) would write a second parser,
   which the owner removed once (`da086a4c6`). Investigate one parser in C compiled to a small Wasm
   module that the page and any host load, against stating `recipe.rows` as a contract with shared
   cases; pick the smaller.
2. At sealing, one line per directory of files a step created outside `/tmp` that no row retains,
   with the row to add ("412 files under /usr/lib/python3.14/site-packages are not kept: FOLDER
   /usr/lib/python3.14/site-packages"). Measured on 2026-11-11: `SLOP pip install` keeps nothing
   silently.
3. `dolly-build init` scaffolds `APPLICATION` with `FROM pi-minimal`, the form the catalog's lint
   refuses since R1: write `INSTALL` rows instead (package what `pi-minimal` adds if needed).
4. `docs/dollyfile.md`: the three meanings of `INSTALL` by role, `FROM` per role, and that "only an
   image with ENTRY and `display@0` can be opened" is the site's rule (`console@0` and Donna open
   others).

## Done when

1 is decided and done, 2 prints in the pip case, 3's project passes the lint and
`test/npm-browser.mjs`, 4 is in the text.
