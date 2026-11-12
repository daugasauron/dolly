# Dollyfile: one parser for every host, a line for files no row keeps, init without FROM, clearer docs

- STATUS: OPEN
- PRIORITY: 260
- TAGS: dollyfile,syntax,donna,docs,audit

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
  On `fix/catalog-rows`: `generate-routes.mjs` writes `dist/rows/SHA256.rows` for every catalog
  recipe and `abi/README.md` names them; the Pages release does not carry them yet (its file
  count, `20261105-005808-pages-files`).
- 2 is done (`report_unkept` at sealing, `src/dollyfile.c`); it prints in the pip case once the
  round runs.
- 4 is in `docs/dollyfile.md`: INSTALL's and FROM's meaning by role in the table, and the
  opening rule is the site's.
- 3 needs a mechanism first: a recipe without `FROM` starts from the compiler seed
  (`dist/dolly.data`, 117 MB, not in npm) only to compile `/bin/dollyfile`. Next: a root build
  whose rows `INSTALL` the `dollyfile` package starts from that package's snapshot and engine
  (`src/build-worker.mjs` `prepare`/`restore`), which also spares `/IMAGE/rebuild/` the seed
  when every input is prebuilt; then `dolly-build init` writes `INSTALL` rows of `core`,
  `dollyfile`, `posix`, `display`, `curl`, `pi-dolly` and npm publishes those packages.

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
