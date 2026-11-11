# Dollyfile: one parser for every host, a line for files no row keeps, init without FROM, clearer docs

- STATUS: OPEN
- PRIORITY: 260
- TAGS: dollyfile,syntax,donna,docs,audit

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, D1-D4).

## State (2026-11-12)

Filed.

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
