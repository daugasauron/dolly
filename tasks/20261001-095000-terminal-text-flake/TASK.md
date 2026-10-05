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

## Cause of the empty selection (2026-10-06, `fix/firefox-selection`)

Reproduced at will: 3 failures in 220 openings of the default image at its
first prompt in Firefox with ten concurrent Firefox loops (1 in 48 with six,
0 in 67 alone). Since `77f18fce` (presenter batch) `visibleTerminalText()`
waits for its own selection instead of any publication, so the same race
fails with `timed out waiting for terminal selection publication` after 5 s
instead of returning "" for its caller to retry; that made it block the
release line. A timeline of the mailbox words and a log of Worker retirements
in the failing runs showed:

- `init.slop` runs `/bin/foreground /bin/slop -e ~/.dollyrc` (pid 104) before
  the shell (pid 109). When 104 exits, the kernel keeps it as the foreground
  until its Worker retirement is acknowledged and publishes it as "pid 104,
  not interruptible", which `waitForInteractiveTerminal` reads as a program in
  raw mode. It starts the screen selection then.
- `dolly_process_worker_retired(104)` calls
  `dolly_terminal_discard_pending_input()`, which dropped the press, drag and
  release written a millisecond earlier (`read=2>5 write=5>5`). No selection
  follows. Load widens the window (three `printf` Workers retire first), which
  is why a busy machine made it frequent.
- Not a lost wake-up and not Firefox throttling: in every captured failure
  page timers ran at 10 ms, the page was visible and focused, and the
  presenter had painted the newest frame.

A user can hit the kernel half in any browser: a mouse press, drag or wheel
step in the ring when a foreground program's Worker retires is dropped, so a
selection does not start and Ctrl+Shift+C copies nothing; a large interactive
program (python, Pi, games) delays its retirement by 500 ms, which widens the
window. Keys typed then are dropped by design (stale input of the old program).

Fix (kernel only, image inputs unchanged `047fc328…`):

- `dolly_input_ring_discard(ring, terminal_ui)` (`host/display/input-ring.c`):
  a discard still drops the old program's key, text and paste records and
  still hands resize to the driver; when the terminal owns the display its
  own pointer and scroll records reach the driver too. A graphics owner's
  lease ending keeps dropping them (its coordinates were the program's).
- `refresh_foreground()` (`src/process-kernel.c`) publishes no foreground
  while an exited owner awaits retirement, so nothing mistakes it for a
  program in raw mode.

Evidence: unit test of the rule in `test/terminal-ring.test.mjs`; the
retirement case in `test/display-browser.mjs` (a 160 MiB interactive program
prints a ruler and exits; drags written while no foreground is published must
all reach the selection), which fails 2 of 3 runs in Chrome with the discard
restored; 600 of 600 openings under the ten-loop load that reproduced it;
`core`, `boundary`, `display`, `terminal`, `shell` and `process` in both
browsers.

Still open: the narrowed mouse-drag failure at `terminal-browser.mjs:67`
(after zoom and paste) is a different sequence, no foreground program ends
there, and it did not occur in these runs.

