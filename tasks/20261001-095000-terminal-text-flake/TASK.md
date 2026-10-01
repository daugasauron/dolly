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
