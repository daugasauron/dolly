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

## Seen again with the parked presenter (2026-10-06, pi-local)

Since `77f18fce` (`host/display/display.mjs:443`, "terminal selection reset")
`demos/local-llm/test/local-llm-browser.mjs` fails in Chrome at the same
step in 2 of 2 runs: after the session is saved and the page reloads,
`waitForInteractiveTerminal(... 'restored Pi')` throws "timed out waiting for
terminal selection reset" (once "... selection publication"). Every step
before it passes, including a Pi agent run. The trials rig for task
`20261005-215204-pi-local-loop` hit the same two messages on first boot about
one run in four under load and passed on retry. Not investigated further:
the helper's press-then-wait-for-null step may not run while the idle
presenter is parked.

## Note (2026-10-06, `core/decisions`)

Under machine load (a CMake bootstrap building beside the test, load average
6 to 13) `demos/emacs/test/emacs-browser.mjs firefox` fails about every
second run, on the old seed (`46a5776f`, 5 of 8 passed) and the new one (4 of
8) alike, with "timed out waiting for terminal selection publication" or text
that never appears after typing. The core `display` suite showed the first
message once in four Firefox runs. Chrome did not fail.

## The neovim demo failure and keys typed after an exit (2026-10-07, `fix/selection-after-exit`)

Seed round (`9077dda1`, image inputs `22d006ca…`): `demos/neovim` failed 6 of
10 runs in Chrome with `timed out waiting for terminal selection publication`
at `prompt(recoveryPrompt)`, right after `:q`.

Mechanism, from a timeline of the terminal and display mailbox words in the
failing runs (`build/selfix-evidence/repro-wait-1.log`): no record is lost.
`waitForInteractiveTerminal` starts reading the screen while Neovim, still the
foreground program in raw mode, is about to exit. `visibleTerminalText()`
(`host/display/display.mjs`) presses, waits a frame for the old selection to
go, then drags. Neovim leaves the alternate screen in between, and a drag
cannot extend a selection whose press was on the other screen
(`handle_pointer` in `src/ghostty/display.c`: the gesture yields none). The
helper then waited its five seconds and threw through the outer wait.
Confirmed without any program exiting: press, `printf '\033[?1049l'`, drag
selects nothing; output or a clear in between does not break it
(`altscreen.log`). The discard at retirement is not involved: Neovim has no
reclamation delay here and the records were consumed by the driver.

Fix 1 (`521ef85f`, page only): the helper makes the gesture again when it
yields no selection, with waits of 0.25, 0.5, 1 and 3.25 s.
`test/terminal-browser.mjs` makes a full-screen program's exit fall between
the press and the drag; it fails with the same timeout without the fix.

Fix 2 (kernel only, image inputs unchanged): keys are a different matter.
Measured with the 160 MiB interactive fixture: a command typed in the 500 ms
between the program's exit and its Worker's retirement was dropped, 3 of 3
(`keys-after-exit.log`), because `dolly_process_worker_retired` discarded
pending input. The discard now happens when the terminal's owner exits
(`mark_process_exited`): what it left unread is dropped, what is typed
afterwards reaches the shell. `test/display-browser.mjs` types a command in
that window.

Evidence on both fixes: `demos/neovim` 10 of 10; `terminal`, `display` and
`process` in Chrome and Firefox; `core`, `shell` and `boundary` in Chrome.
