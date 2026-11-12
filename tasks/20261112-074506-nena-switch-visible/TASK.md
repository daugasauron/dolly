# A nena switch is shown on the page; the microphone needs a click in each session

- STATUS: CLOSED
- PRIORITY: 260
- TAGS: nena,security,microphone,gpu,ux,audit

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, S3; 2026-11-07 F4, F7). Decided (2026-11-12, by the rule "decide,
don't ask"): the owner's "freely configure" (2026-10-13) stands, and the user sees it happen.

## State (2026-11-12)

Done on `fix/batch` (`9aaed3b15`): the page's status line says each switch ("This session
enabled microphone@0."), a microphone a session enabled itself captures only after Allow on the
page, once a session (`host/microphone/microphone.mjs`, `switched`), and
`docs/browser-boundary.md` says that a nena image, a custom image, a build and a session have
every module, a switch bounded only by each module's row, the browser's prompts and the HTTP
policy. A microphone the recipe declares asks only the browser: the user opened that image.

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

## Closed (2026-11-12)

The batch round (`round/batch-1112` at `0400fa2cc`): `test/nena-browser.mjs` sees the status line
and the alert, clicks Allow and then captures, in Chromium (37.3 s) and Firefox (41.1 s)
(`work/modular/build/round-1112b-evidence/browser.log`).
