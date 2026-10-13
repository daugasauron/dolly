# The microphone test once recorded 290 Hz for a 440 Hz tone: a third of the frames were silence

- STATUS: CLOSED
- PRIORITY: 125
- TAGS: tests,flaky,microphone,chromium

Done when: it is known whether the silence came from Chrome's fake device or
from Dolly's capture path, and either the test no longer depends on the
first (it waits for a tone before it measures, or measures over a window it
has checked) or the second is fixed with a test that fails before.

## As filed (2026-10-14, `integrate/round-1013` `a2b9f912`)

- Seen once: the core suite of 02:26 to 02:32, Chromium,
  `test/microphone-browser.mjs:66`: "the tone is not the one played: 290 Hz".
  The program's line: `MICROPHONE_CAPTURED frames=24000 rms=0.2802 hz=290
  dropped=29120` (`work/evidence-2026-10-14/integration/browser-microphone-290hz.log`).
- The numbers agree with each other: 290 / 440 = 0.66, and (0.2802 /
  0.3453)² = 0.66. So about a third of the 24,000 frames the program read
  were zeros and the rest was the tone at its right level and pitch. Not a
  lost or repeated block of tone, which would not lower the level.
- It ran beside three other test files, right after four images were built,
  with two agents reading the tree. Alone it passes three of three (440 Hz,
  rms 0.3453; Firefox 1000 Hz), and it passed in the core suite two hours
  before and in the rerun of the whole suite twenty minutes after (427 s,
  all passed).
- The change under test did not touch it (the page's parser lost an unread
  field; a comment).
- Not known: who wrote the zeros. Chrome's fake device loops a one-second
  file (`--use-file-for-fake-audio-capture`); whether it gives silence when
  its thread is starved is not measured. On Dolly's side the worklet posts
  blocks to the provider, which queues them; whether any step fills a gap
  with zeros was not read to the end. The fixture skips frames before it
  measures (`test/fixtures/microphone.c`), by count, not by content.

## Closed 2026-10-14 03:10: the silence is Chrome's, and the test no longer measures it

Reproduced: the test pinned to one processor (`taskset -c 3`) failed one run
of three, with a temporary count in the fixture: `lead=1 zeros=520`, 431 Hz,
rms 0.3417. The tone was there from the first frame; 480 frames in the middle
were exact zeros (the other 40 are the sine's own: one sample in 600 is zero
at 440 Hz and 48 kHz). 480 frames is one 10 ms buffer of the device. The
first failure's 34% is seventeen such buffers.

Dolly's path writes no zeros, read to the end: the worklet posts the input's
samples as they come (`host/microphone/worklet.mjs`), the provider appends
each block to its ring and a read copies what is queued
(`host/microphone/provider.mjs`, `queue` and the `READ` branch), the client
copies exactly the frames the reply names (`host/microphone/client.c:59-72`).
So the zeros are what the browser's audio graph gives when its capture did
not deliver a buffer in time: Chrome's fake device on a starved machine. A
real microphone would glitch the same way.

The fixture now measures the first half second without such a gap (64 or
more samples of exact zero in a row end the window and it starts again after
them; ten seconds without one clean half second fail the test and say so).
The assertions on pitch and level are as strict as before, and the count of
frames (captured = skipped + read + queued + dropped) is unchanged.
`test/fixtures/microphone.c`, `test/microphone-browser.mjs` (one comment:
the old one said a lost block would shift the numbers, which it would not).

Measured after: 12 of 12 runs pinned to one processor pass in both browsers
(440 or 439 Hz, rms 0.3453; Firefox 1000 or 999 Hz, 0.0707), 2 of 2
unpinned; source suite 429.

What the test no longer shows: a block that Dolly itself would fill with
zeros would be taken for a gap. Dolly has no code that does.

