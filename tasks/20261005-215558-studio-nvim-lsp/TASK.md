# Audit the Neovim language-server setup in Dollyfile Studio

- STATUS: OPEN
- PRIORITY: 50
- TAGS: studio,neovim,audit

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
