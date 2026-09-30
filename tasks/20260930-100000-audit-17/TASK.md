# Downloads need no user activation and have no quota

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: security,boundary

`src/host/download.mjs:17-27` downloads any number of files (<=64 MiB each, names like
`setup.exe`) without a user gesture; each Blob URL is kept 60 s with no count limit.
`docs/download.md:67-71` tells embedders to enforce quotas but the only option is disabling
download@0. The upload modal can be reopened by Wasm as often as it likes.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

A program can request a download; the browser saves it only after the user confirms it; pending
requests are bounded.

## Done when

- Browser check: `download FILE` shows a confirmation; no file is saved without a click; excess
  requests fail explicitly.

## Resolution (2026-10-01)

Fixed: each download waits for a user click on Save, at most 4 wait, Blob URLs
are bounded ([`host/download/download.mjs`](../../host/download/download.mjs)).
Verified in Chromium and Firefox by `test/core-browser.mjs` ("download started
without a click" and the bounded queue), passing on `core/host-modules`.
