# Wine test: a file manager step fails 1 of 3 in Firefox

- STATUS: OPEN
- PRIORITY: 90
- TAGS: demo,wine,flaky,0.1.4

## State (2026-10-24)

`node demos/wine/test/wine-browser.mjs firefox` passed 2 of 3 runs on `core/page-no-view`
`d0bc29f8` (Wine rebuilt from the `0e9052d8` archive, 153 s). In the failing run the file
manager's first double-click (`fileManager()`, `open(2)` after the click on `0test` in the tree)
entered `0test\inner` at once. Chromium passed every run. The log of the failing run was not kept.

To do: reproduce with a loop of the Firefox run, keep the failing run's screenshots
(`winefile.png`), and make the step wait for what the click shows, not for a delay.

Done when: ten Firefox runs in a row pass.
