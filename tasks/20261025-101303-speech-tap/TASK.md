# Speech test: voice's Menu tap is lost in 2 of 6 runs, before "Thinking"

- STATUS: CLOSED
- PRIORITY: 110
- TAGS: demo,speech,flaky,0.1.4

## State (2026-10-25)

`node demos/speech/test/speech-browser.mjs` (Chromium) failed in the full round of `500d4329`
(seed `debea04d`) and in 2 of 6 runs looped after it, each with `no button Thinking:` at
`demos/speech/test/speech-browser.mjs:103`. The screen then shows voice's main page (Speak, Send,
Stop, Menu, Erase; Up, Down): the test chose a model (`tap("Choose")`), waited for the chosen
name, tapped Menu, and the menu page never came. The other 4 runs passed (62 s each).

Read so far, not measured: the wait for the chosen name (`waitText(chosen)`) can match text
already on the screen, as Pi's start banner names the default model, so it proves nothing;
voice draws the main page on Choose (`pressed()` in `demos/speech/voice.c`), and a tap is a
DOWN and an UP on one button (`touched()`), whose static `finger` would ignore a DOWN while an
earlier finger never ended. Neither explains a lost tap on a shown Menu.

To do: reproduce with voice logging each touch record and `pressed()` (a build of pi-phone with
it), find where the tap goes, and fix that; then make the test wait for what Choose does.

Done when: 20 runs in a row pass in Chromium.

## Closed (2026-10-27, `64c82b5f`): the tap was aimed from a screen read that the screen scrolled under

Reproduced at once on `main` `f9cbff51` with the pi-phone part of the test and a page-side log
of every pointer event (`work/flaky/build/flaky-evidence/`): 3 of 5 runs lost Menu. In each,
the text `tap()` searched had 48 to 56 lines on the 32-row screen, so Menu was found on row 43
or 51 and tapped at y 1103 or 1304 of the 839-pixel page: the event's target was `<html>`, not
the canvas, and `touch@0` never saw it. voice and its touch records were not at fault, so no
logging build of voice was needed.

Why the text was longer than the screen: voice keeps Pi in a scroll region starting at the top
row, and Ghostty moves rows that such a region scrolls into the history. Choose ends Pi's model
list, and Pi redraws in full (`\e[2J\e[H\e[3J` and every line), scrolling about 24 rows into
the history. `visibleTerminalText()` presses on the first cell and then drags to the last; a
redraw between the two carries the press's anchor up with its row, and the selection covers
history and screen. Such a text cannot be the screen, since lines only join (soft wraps) and
never multiply, so it now makes the gesture again when the text has more lines than the
screen has rows. A smaller scroll above trailing blank rows, which the selection trims, cannot
be told apart from the text alone; an exact read needs the display to publish the selection's
rows or the visible text, a `display@0` contract question for the owner.

The test waited for nothing real either: it read the chosen model right after tapping Down,
before Pi had moved the arrow, and its pattern took the check mark that precedes the current
model's name, then waited for that name or mark, both already on the screen (one such run
failed with `terminal never showed /✓/`). It now waits for `(2/N)`, skips the mark, waits for
Pi's `Model: NAME`, and waits for the Thinking list's title instead of sleeping a second.

Evidence: the pi-phone part 10 of 10 with a temporary count of rejected reads (4 runs had one,
of 37 to 55 lines, each made again); `node demos/speech/test/speech-browser.mjs` (Chromium)
20 of 20 in a row, pi-phone 24.7 to 35.3 s.
