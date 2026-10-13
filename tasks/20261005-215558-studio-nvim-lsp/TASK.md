# Audit the Neovim language-server setup in Dollyfile Studio

- STATUS: CLOSED
- PRIORITY: 50
- TAGS: studio,neovim,audit

## Closed (2026-10-13): there is no language server; the lint is current, the highlighting was not

What Studio ships (`demos/studio/nvim/`, packed into `studio.tar` by `prepare-sources.sh`):

- **No language server.** `skills/dollyfiles/neovim.md` says so. A filetype plugin
  (`plugin/dollyfile.lua`) recognizes `Dollyfile` and `Dollyfile-*`, sets four-space
  indentation and runs `dollyfile-lint --stdin` on open, save and after edits, showing its one
  error as an inline diagnostic; `:DollyLint` checks the buffer at once.
- **The lint cannot go stale**: `dollyfile-lint` is `lint.mjs` under Janis calling
  `inspectDollyfile` of `src/dollyfile-view.mjs`, the parser the page and the builder use,
  packed from the same checkout (`demos/studio/test/studio.test.mjs` holds that the archive has
  every module it imports).
- **The done-when's browser test existed and passes**: `demos/studio/test/studio-browser.mjs`
  runs `test/fixtures/studio-nvim.lua` in the image's Neovim (a deliberate `DOLLY 2` gives one
  diagnostic naming `DOLLY 7`, without saving) and then edits a recipe at the keyboard; `studio:
  chromium passed in 35.6s` on `main` on 2026-10-13
  (`work/rust/build/integrate-evidence/final-demos.log`).

What was stale, and is fixed:

- **The syntax file knew the directives of before Dollyfile 6.** `syntax/dollyfile.vim` highlighted
  `IMAGE`, `MODULE` and `USE`, which no longer exist, and not `APPLICATION`, `TOOLCHAIN`,
  `PACKAGE`, `INSTALL` and `RUN`, nor `FILE` and `FOLDER` after `EXPORTS` or `REQUIRES`. Drawn
  by a native Neovim 0.12 (`tohtml`) over the catalog's 103 recipes, 264 of 3,513 directive
  lines came out plain, the role line of every recipe among them; with the corrected file none
  does, and none of the 5,085 `FILE` body lines is highlighted. The fixture asserted only
  `DOLLY` and `FILE`, which is why it passed.
- **The plugin still claimed `*.dm`**, the module files that left with Dollyfile 6.
- The fixture now asks the highlighting of every directive line of `/workspace/Dollyfile` and
  of the image's own recipes in `/etc/dolly/recipes`.

Verified: the fixture passes natively (Neovim 0.12, the real `lint.mjs` under Node) and in
Dolly's Neovim 0.12.5 in Chromium and Firefox, with the `nvim` package installed into `default`
and a stand-in for `dollyfile-lint` that reads only the first line; with `main`'s syntax file
it fails in both places on `APPLICATION hello`. Not run: the `dollyfile-studio` image itself,
which this slim tree cannot build (its base is `pi-local`). The recipe's pin of `studio.tar` is
the archive restaged from the tree (`5f6dc9f6…`; the same command gives `main`'s `882112fc…`
from `main`'s files), so the next catalog round builds the image and runs its test.

## The request

Owner (2026-10-06): "I think there is some lsp thing for neovim in dollyfile
studio? Not sure if it's up to date, create a task for that on low priority."

`demos/studio/skills/dollyfiles/neovim.md` and the Studio recipe set up Neovim
for Dollyfiles. Check what language-server or syntax support Studio actually
ships (`dollyfile-lint`, any LSP client configuration, filetype and
highlighting), whether it matches Dollyfile 6 as the engine implements it now
(`PACKAGE`, `INSTALL`, `RUN`, `REQUIRES HOST`, `EXPORTS`), and whether it works
in the current image.

## Done when

- What Studio ships is recorded here with what is stale, and it is fixed or
  removed; a browser test opens a recipe in Studio's Neovim and sees a
  diagnostic for a deliberate error.
