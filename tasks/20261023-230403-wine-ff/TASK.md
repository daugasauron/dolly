# Wine test: a file manager step fails 1 of 3 in Firefox

- STATUS: OPEN
- PRIORITY: 90
- TAGS: demo,wine,flaky,0.1.4

## Result (2026-10-24, `core/page-no-view`, seed `b871765b`)

- The old step passed 10 of 10 Firefox runs in a loop (146-157 s each); the failure in the
  State below did not come back. Its cause is read from the code: the desktop samples window
  titles four times a second, and the step's log assertion needed each title of the file
  manager to last that long; only `delay(800)` stood between the clicks.
- Making the clicks wait on the screen found what the delays hid: "the text of notes.txt in
  Notepad" (`dark(8, 46, 400, 20) > 150`) counted the file manager's own toolbar, 411 dark
  pixels, the number every run's log printed. The step never waited for Notepad; the first
  Alt+F4 could close the file manager, and the 1 s delays let either order end with both closed.
  Without them, 3 of 6 Firefox runs failed: twice the session never ended (a saved frame shows
  Shut Down's key typed into Notepad, which was still open), once the file manager stayed open.
- `fileManager()` now waits for what each click shows, with no delay: the Start menu over the
  desktop above its button; the title's white text getting longer into `0test\inner` and shorter
  out of it, with the entries; shell32's question taking 10,000 white pixels from the lists;
  Notepad's shorter title and its text right of the toolbar; the file manager's title again
  after the click that activates it; the desktop where it was. The desktop's title log is no
  longer asserted here: no wait can make a 250 ms sampler see a state without a delay.
- Firefox: 10 of 10 runs in a row pass (146-165 s; Notepad's text is 434 dark pixels).
  Logs: `build/process-evidence/wine-ff-*.log` in `work/process`.

## State (2026-10-24, before)

`node demos/wine/test/wine-browser.mjs firefox` passed 2 of 3 runs on `core/page-no-view`
`d0bc29f8` (Wine rebuilt from the `0e9052d8` archive, 153 s). In the failing run the file
manager's first double-click (`fileManager()`, `open(2)` after the click on `0test` in the tree)
entered `0test\inner` at once. Chromium passed every run. The log of the failing run was not kept.

To do: reproduce with a loop of the Firefox run, keep the failing run's screenshots
(`winefile.png`), and make the step wait for what the click shows, not for a delay.

Done when: ten Firefox runs in a row pass.
