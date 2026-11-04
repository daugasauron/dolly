# Dolly's own page UI takes the embedding's colours

- STATUS: OPEN
- PRIORITY: 110
- TAGS: page,ui,display,npm

Found by `core/terminal-palette` (2026-11-04, `tasks/20261104-074512-terminal-palette`): the
terminal and html@0's popups now take the embedding's `--dolly-background`, `--dolly-color` and
`--dolly-accent`, but the rest of what Dolly draws inside boot()'s element (the boot log, the status
line, Save, the download, upload and build dialogs, the indicators) still hard-codes its colours,
greys among them (`#77736c`, `#333`, `#191919`). Decided by the integrator: one source for one look
(the owner's rule, 2026-11-03: one renderer owns what belongs together). The greys become mixes of
the background and the colour (`color-mix()`), so the defaults draw today's pixels.

Done when: an embedding that sets the three properties sees every element of Dolly's own UI in its
colours, checked by `test/theme-browser.mjs` reading a pixel of the status line and of one dialog in
Chromium and Firefox; Dolly's pages draw the pixels they do today (measured before); no colour
literal is left in `src/browser.mjs` and the host modules' page code but the defaults.
