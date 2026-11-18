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

## State (2026-11-16, the audit)

`fix/page-colours` (`bf6c49cb7`) is in v0.1.6 and v0.1.7. `test/theme-browser.mjs` passed in
Chromium and Firefox on 0.1.7's full round (`work/round1113/build/round-1117-evidence/browser.log`).
Two literals came in afterwards, on 2026-11-12 with `fix/batch`, and are left:
- microphone@0's prompt, `host/microphone/microphone.mjs:35-36` (`9aaed3b15`): `background:#262626`,
  `border:1px solid #e98773`, `color:#e8e3d7`, for `--dolly-ui-background`, `--dolly-ui-alert` and
  `--dolly-ui-color`;
- html@0's notice, `host/html/html.mjs:146` (`dd1087119`): `color: #ff9b84`. It is inside the popup's
  frame, which gets the three properties only, so it takes `--dolly-accent` or a mix of it.
Then close.

## Done on `fix/page-colours` (2026-11-12)

On `fix/page-colours` (from main): `.dolly-terminal` defines the UI's colours once
(`src/browser.mjs`, now `page/browser.mjs`): `--dolly-ui-background`, `-color` and `-accent` are the three properties
with Dolly's defaults; `--dolly-ui-quiet` is the terminal's bright black
(`--dolly-display-palette-8`, `#77736c` unset: the grey of today, one source with the terminal);
`--dolly-ui-raised` (was `#333`) mixes 7% of the colour into the background, which draws
`#343332` unset, one step from today's in two channels; `--dolly-ui-sunken` (was `#191919`)
mixes the background with black, `#191919` exactly; `--dolly-ui-alert` is `#e98773`, defined
once. Every literal in the page code of build, download, gpu, http's refusals, input, microphone,
snapshot and upload is one of them; what stays: the dialogs' `#0008` backdrops (a dimming, not a
colour of the page), display@0's palette defaults, and the html popup's invalid-field border
`#e07a5f` inside its frame, which gets the three properties only. `test/theme-browser.mjs` reads
the status line's and the downloads panel's background in both themes: passed in Chromium and
Firefox. `docs/embedding.md` says it.

Done when: an embedding that sets the three properties sees every element of Dolly's own UI in its
colours, checked by `test/theme-browser.mjs` reading a pixel of the status line and of one dialog in
Chromium and Firefox; Dolly's pages draw the pixels they do today (measured before); no colour
literal is left in `src/browser.mjs` and the host modules' page code but the defaults.
