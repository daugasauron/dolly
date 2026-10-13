# On a slow device Pi starts with part of a terminal reply in its prompt

- STATUS: OPEN
- PRIORITY: 110
- TAGS: bug,pi,terminal

## State (2026-10-12)

Unchanged since it was found: no fix, no reproduction on a desktop yet. It waits with the parked
phone image (`tasks/20261010-193000-phone-voice-pi`). Lowered from 150 with it.

A lead, not checked: `demos/javascript/janis.js` reads the terminal with `Dolly.readStdin(4096)`
in one branch and `Dolly.readRaw` in the other (lines 3130 to 3132), and `readRaw` returns at
most 256 bytes a call (`demos/javascript/quickjs-main.c:882`), fewer than the eighteen colour
answers together. `tasks/20261001-095000-terminal-text-flake` found that cut splitting a key's
sequence. Which branch Pi's reader takes was not read.

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

