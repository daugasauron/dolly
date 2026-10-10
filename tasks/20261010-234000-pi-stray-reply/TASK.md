# On a slow device Pi starts with part of a terminal reply in its prompt

- STATUS: OPEN
- PRIORITY: 150
- TAGS: bug,pi,terminal

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
