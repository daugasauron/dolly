# A nena switch is shown on the page; the microphone needs a click in each session

- STATUS: OPEN
- PRIORITY: 260
- TAGS: nena,security,microphone,gpu,ux,audit

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, S3; 2026-11-07 F4, F7). Decided (2026-11-12, by the rule "decide,
don't ask"): the owner's "freely configure" (2026-10-13) stands, and the user sees it happen.

## State (2026-11-12)

Filed.

## Found

`src/site.mjs:20-29` gives a nena image, a custom image, a build or a session every module;
`host/nena/nena.mjs:56-69` enables any unfixed module and the page shows nothing. `default`
declares `nena@0`: `gpu@0` is one unprompted call away, and after one microphone grant to the
origin any program in `default` can capture with no prompt.

## Do

- The page's status line says each switch ("this session enabled gpu@0"), as it does on restore.
- A module whose manifest says so (`microphone`) needs a click on that line before its first OPEN
  in a session.
- `docs/browser-boundary.md` says that on the site, for a nena image, a custom image and a session,
  the recipe's list is no bound.

## Done when

`test/nena-browser.mjs` sees the line for a switch and a microphone OPEN that waits for the click
(Chromium, Firefox).
