# default and system install the html package

- STATUS: OPEN
- PRIORITY: 140
- TAGS: images,html,packages

`html@0` is a package (`Dollyfile-html`; `tasks/20261101-124237-html-popups`, closed). `default`
declares every module the packages amy installs may need (`Dollyfile:6-16`: audio, dso, http,
nena, packages, snapshot, sockets, threads, touch, upload, "for the packages amy installs") but
not `html@0`, so `amy install pi-dolly` in `default` needs `nena enable html` first (71d2603fc),
and a shell user has no `html` command. `system` likewise.

Decided 2026-11-04 (`tasks/20261102-133353-owner-decisions`): yes. The rule `default` already
follows gives `html@0`; the `html` command is one small program; the popup grants nothing
(`docs/browser-boundary.md`'s html@0 row). A base change: a round.

Done when: `Dollyfile` and `Dollyfile-system` declare `REQUIRES HOST html@0` and install the
`html` package; in `default`, `html` of a one-field form shows the popup and prints the field, in
Chromium and Firefox; `amy install pi-dolly` works without `nena enable html` and the note that
says so is gone; `test/default-browser.mjs` and `test/html-browser.mjs` pass in both browsers on
the round's images.

## State (2026-11-04, core/base-html)

Done and verified on `core/base-html`; left: the round's images and its `amy install pi-dolly`.

- `Dollyfile` and `Dollyfile-system` declare `REQUIRES HOST html@0` and `INSTALL` the `html`
  package. `demos/python/Dollyfile-python-data`, which restates default's set as "default with
  Python", declares it too. The branch first merged `integrate/2026-11-03` (01880a300, the day
  round's repin), so its pins differ from the round's only by this change: 85 recipes, 4 edited
  and 81 repinned, everything `FROM system` (30 recipes) and what installs or copies them. That
  includes python, which rust-llvm installs, so the whole Rust chain, pi and pi-dolly.
- Tests, from what the images now hold: `test/host-modules.test.mjs` (the interactive set has
  `html@0`), `test/dollyfile-graph.test.mjs` (default and system install `html`),
  `test/default-browser.mjs` (in `default`, `html` of a one-field form shows the popup and prints
  `answer=forty+two`), `test/html-browser.mjs` (opens `system` with its two documents and nothing
  else composed), `test/host-modules-browser.mjs` (its page still lacks only `http@0` of system's
  set, since html@0 sorts first and would be named), `test/amy-browser.mjs` (pi-dolly installs
  without `nena enable html`: the `enables` table and its note are gone, and `html` is no longer an
  `elsewhere` row because default installs it).
- Docs: `docs/embedding.md`'s install line names `@daugasauron/dolly-host-html` (without it a
  page fails to boot `default`, as npm-browser's `lacking.html` shows for touch);
  `docs/dollyfile.md` (repinned in `Dollyfile-dolly-docs`); the README's core images;
  `scripts/package-npm.mjs`'s description of `dolly-image-default`.

Measured 2026-11-04, seed e7867504 (as the round's), with default 9ac7d713…, system e2096544… and
html cf2ac76f… built here and the other 22 images of their closure taken from the round's
unchanged builds (`build/signals-evidence/`):

- Chromium and Firefox: `test/default-browser.mjs` (all three cases), `test/html-browser.mjs`,
  `test/host-modules-browser.mjs`, `test/nena-browser.mjs`, `test/core-browser.mjs` pass.
- In a live `default`, with nothing enabled by nena: `nena` lists `html@0 declared`; a sealed package
  whose recipe requires `html@0` (amy-browser's fixture form) installs with `dollyfile install`, the
  same package needing `gpu@0` is refused with `nena enable gpu`, and `amy install html` says it
  is installed. Both browsers (a scratch script, not committed).
- The source suite passes (470).

Not run here, for the round: `amy install pi-dolly` in `default` (`test/amy-browser.mjs`'s
"amy tools"): pi-dolly's closure rebuilds rust-llvm and rust-build (hugebuild) because python is
`FROM system`. `test/amy-browser.mjs` and `test/npm-browser.mjs` need the whole catalog (`amy list`
against every package; pi-minimal and python-data packed), and the round rebuilds the 85 recipes.

An incident, repaired: at 14:20 the step that took the round's unchanged images into this tree
wrote html's metadata module into the round's html snapshot (`work/integrate/dist`, and
`work/ghostty/dist`, which links the same file). At 14:22 the same inode got back the bytes the
round's metadata names (cf2ac76f…, 88218 bytes), which this tree's rebuild of `html` reproduced.

## Lessons

- `rename(2)` between two names of one inode does nothing and leaves the source in place. Linking
  the round's snapshot to a temporary name, renaming it over this tree's (already the same file),
  then copying the metadata to that temporary name wrote through a link into two other trees.
  Compare inodes before replacing, and never write to a name that `link()` made.
- Merging the round's repin commit first made this branch's pins equal to the round's built
  images: 22 of the 25 images were reused (metadata copied, snapshots linked) and the change
  built in 29 s. Before it, every image read "seed or image ABI changed" (the tree's metadata
  came from another branch's seed).
- One `INSTALL` row in `system` repins 85 recipes, and because rust-llvm installs python, which is
  `FROM system`, the Rust chain lies behind pi-dolly. `git diff --name-only` after
  `update-recipe-pins.mjs` shows that cost before any build.
- `test/default-browser.mjs` needs the whole catalog's `amy-index.txt` (the start-up text names
  python and git), and a `DOLLY_BUILD_IMAGES` build narrows it. Staging every source
  (`scripts/prepare-image-sources.sh`, about 7 min here) and `generate-routes.mjs` restore the index
  and registry without building anything.
