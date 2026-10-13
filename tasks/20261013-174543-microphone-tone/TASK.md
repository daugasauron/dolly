# The microphone test once recorded 290 Hz for a 440 Hz tone: a third of the frames were silence

- STATUS: OPEN
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
  before and in the rerun after.
- The change under test did not touch it (the page's parser lost an unread
  field; a comment).
- Not known: who wrote the zeros. Chrome's fake device loops a one-second
  file (`--use-file-for-fake-audio-capture`); whether it gives silence when
  its thread is starved is not measured. On Dolly's side the worklet posts
  blocks to the provider, which queues them; whether any step fills a gap
  with zeros was not read to the end. The fixture skips frames before it
  measures (`test/fixtures/microphone.c`), by count, not by content.
