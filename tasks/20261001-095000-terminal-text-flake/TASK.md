# Firefox terminal test can read an empty visible text

- STATUS: OPEN
- PRIORITY: 170
- TAGS: tests,flaky,display,firefox

`test/terminal-browser.mjs` failed once in Firefox (terminal-mailbox branch,
2026-10-01) because `__dolly.visibleTerminalText()` returned an empty
selection; three reruns passed. The helper (`src/browser.mjs`) reads the
screen by pushing a pointer drag and waiting for the display library's copy
sequence, so a drag that lands before a redraw, or a copy of an empty
selection, reads as "".

Done when: the cause is reproduced (for example 50 Firefox runs of the test)
and the helper or the display copy path is fixed, or the race is shown to be
elsewhere.

## Evidence (2026-10-01, `rebuild-batch` release run)

The full Firefox suite failed `terminal-browser.mjs` with
`page.waitForFunction: Timeout 30000ms exceeded`; 6 of 7 isolated reruns passed
(Chrome passed). Same failure rate as the terminal-mailbox branch's report.

## Narrowed (2026-10-01, 12:40)

- The failure is `test/terminal-browser.mjs:67`: after the mouse drag across
  the `COPY-BRIDGE-TEXT` row, `__dolly.copySelection()` never equals the text
  within 30 s. The first run of a Firefox loop reproduced it.
- A probe doing only fullscreen, then twelve rounds of echo, visible-text
  index, clear selection and drag, selected the row correctly 12/12 in Firefox.
  So the race needs the test's earlier steps: font zoom in and back out
  (`Ctrl+Shift+=`, `Ctrl+-`, waiting only for `__dolly.fontSize`) and the
  clipboard paste. Next: log `transport.geometry()` and the selection on
  failure; suspect cell metrics that lag `fontSize` after zoom.

## Note (2026-10-06, `20261005-131644-page-presenter`)

`visibleTerminalText()` returned on any publication and so could read an empty
selection: 3 of 16 Firefox runs of the new display test before, 13 of 13 after
it waits for its own selection (`fix/page-presenter`). The mouse-drag failure
recorded here is separate and still open.

## Note (2026-10-06, `core/decisions`)

Under machine load (a CMake bootstrap building beside the test, load average
6 to 13) `demos/emacs/test/emacs-browser.mjs firefox` fails about every
second run, on the old seed (`46a5776f`, 5 of 8 passed) and the new one (4 of
8) alike, with "timed out waiting for terminal selection publication" or text
that never appears after typing. The core `display` suite showed the first
message once in four Firefox runs. Chrome did not fail.
