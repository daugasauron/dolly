# On a slow device Pi starts with part of a terminal reply in its prompt

- STATUS: CLOSED
- PRIORITY: 110
- TAGS: bug,pi,terminal

## Closed (2026-10-13)

Fixed in `cb9ae5cd` (branch `core/polish`): Janis's terminal read hands over all that waits, up
to 64 KiB, in place of 256 bytes a call (`demos/javascript/quickjs-main.c`, `js_dolly_read_raw`).
The tmux agent fixed the same function the same morning (`503e90fc`, one `read` after the first
byte in place of a call a byte); the round of 2026-10-13 keeps that one, with this task's test.

The cause, measured:

- Pi's reader is the terminal branch of Janis's pump (`Dolly.readRaw`), which read 256 bytes a
  call. The terminal's answers to Pi's eighteen colour questions are 472 bytes, and byte 256 is
  the last `7` of `rgb:e8e8/e3e3/d7d7` in the answer for palette colour 7: its `ESC \` came with
  the next read (`build/polish-evidence/reply-cut.mjs`, not committed, does the count).
- Pi's input buffer sets its 50 ms timer when a chunk ends in an unfinished sequence. Janis runs
  due timers before it reads again, so when Pi's own work after the first chunk takes longer than
  that, the buffer gives up and what it held is taken as typed text: `/d7d7`.
- Reproduced on this desktop, Chromium, with the browser pinned to one core that nine busy loops
  share (Pi is up after 73 to 108 s in place of 6 s): the `pi` image of main `4ed1d9ef` shows
  `/d7d7` in Pi's prompt in 3 of 3 loads, the image with the fix in 0 of 3. Runs 2 and 3 on the
  old image had a timing probe for another task in the supervisor; run 1 did not.
- The same cut explains the `u` of `DOLLY-ENTRY-CWuD`
  (`tasks/20261001-095000-terminal-text-flake`, "Sighting 1 explained").

The test that fails without the fix: `demos/javascript/test/fixtures/janis-terminal.mjs` asks the
eighteen questions and requires every `data` event to end where an answer ends. Against the
image before the fix it exits 1 and the rest of the answers land at the shell's prompt.

Ran on the rebuilt chain (`typescript-build`, `javascript`, `pi-build`, `pi-coding-agent`,
`pi-runtime`, `pi`): JavaScript's demo test, Pi's twelve times (12 of 12), Python's in Chromium
and Firefox.

Not done: the phone itself was not used. `/pi/` and `/pi-phone/` on the MD06P show it after the
next release; the phone image is `tasks/20261010-193000-phone-voice-pi`.

## The defect

Found 2026-10-10 on a Mode1 MD06P (MT6769, Chrome 152) with the `pi-phone` image: after every
load, three of three, Pi's prompt holds `/d7d7` before anything is typed. On this desktop it
never does. A command or prompt typed after it begins with it.

Reproduce: open `/pi-phone/` (or `/pi/`) on such a phone and read the prompt line once Pi is up.

What is known:

- `d7d7` ends the terminal's answer to a colour question, `rgb:e8e8/e3e3/d7d7` (the
  foreground, `src/ghostty/display.c`, and most of the palette).
- Pi asks for the foreground, the background and sixteen palette colours and then for device
  attributes, and waits 100 ms (`theme-controller.ts`, `tui.ts` `queryTerminalColors`). Replies
  after that are meant to be taken as late ones; a reply that arrives when no question is
  pending goes to the prompt as input (`consumeTerminalColorResponse`). Pi's reader gives up on
  an unfinished escape sequence after 50 ms (`stdin-buffer.ts`).
- The kernel answers within the write and hands a reader all that is queued
  (`src/process-kernel.c`, the terminal read), and Pi reads 4096 bytes at a time
  (`demos/javascript/janis.js`), so no split of one reply across two reads was found by
  reading. Not found: where the 50 ms or the missing question comes from.

Next: log what Pi's reader receives, with times, on a slowed desktop (Chrome's CPU throttling
of the page and its workers) until the fragment appears; then fix where it splits, here or in
Pi.

Done means: no text in Pi's prompt after start on the phone, and a test that fails without the
fix.

## 2026-10-13: the same cut, seen on this desktop (the tmux agent)

Pi's reader takes the `readRaw` branch: `janisStdin.isTTY` is true at a
terminal (`demos/javascript/janis.js`, the pump), so every read of Pi's is
cut at 256 bytes. On 2026-10-13 that cut put a `u` into a typed line in 12 of
43 runs of Pi's demo test on a loaded desktop, with and without `pty@0`
(numbers in `tasks/20261012-130814-tmux` and
`tasks/20261001-095000-terminal-text-flake`). The eighteen colour answers of
this task are longer than 256 bytes together, so the same cut can leave the
end of one, `d7d7`, for a read that comes after Pi's 100 ms: not measured
here.

