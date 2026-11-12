# The console test's flood never ends after an earlier console's close or interrupt, on the page

- STATUS: CLOSED
- PRIORITY: 320
- TAGS: console,bug,tests,0.1.6

Found on main `2b8036055` (2026-11-12 evening): the post-round console test's "console pipes"
timed out in Chromium (`work/modular/build/round-1112p-evidence/console.log`).

## Measured

- The flood check (`fix/console-interrupt`) runs `/bin/slop -c "yes | head -n 10000000"` in
  `system`, which has no `yes` (its manifest has `/bin/head` and no `yes`, on main and before):
  `yes` is not found, `head` reads nothing and exits 0. Run alone, the flood ends at once with 0
  bytes and status 0, so the check could never see its 20,000,000 bytes.
- Children's output does reach a pipe console: Donna, on the same kernel, reads 20,000,000 bytes of
  `dd if=/dev/zero bs=1000000 count=20 | cat` and the whole of `seq 1 2000000 | cat` through
  `dolly_console_read` (2026-11-12, `default` of the 9045 release).
- Not explained: in the whole test, after the `sleep 30` console was interrupted, the flood
  console did not exit within 3 s and its output did not end for 300 s, where alone it ended at
  once.

- Donna, on main, three rounds of a piped `sleep 30` interrupted after 2 s and then a new console's
  20 MB `dd | cat`: 130 at 2.0 s, then every byte in 4.9 s. The kernel side holds.
- The page, main's build, the flood now `dd if=/dev/zero bs=1000000 count=20 | cat` (`system` has
  `dd` and `cat`): alone it passes in Chromium (waiting at 3 s, all 20,000,000 bytes, status 0), so
  the window and its resume work; after the endless console's `close()` and the `sleep 30`
  console's `interrupt()` it hangs as before.

## Do

Split the two: the flood after `close()` alone, then after `interrupt()` alone, and trace the
page's console messages (`console-pause`, `console-resume`, `console-output`) of the stuck one.

## Done when

"console pipes" passes in Chromium and Firefox, its flood delivering 20,000,000 bytes.

## Closed (2026-11-13)

The cause: a closed console's id was the next console's. `dolly_console_close` freed the id at
once while the closed console's program still ran, `dolly_console_open_pipes` gave the lowest free
id again, and the page and the Worker route a console's messages by id: the closed program's end
reached the next console. Split in Chromium on main's build: the flood after the endless console's
`close()` alone delivered every byte but "exited" at once with 141 (the closed program's
SIGPIPE); after the sleeper's `interrupt()` alone it was right; after both it received nothing.
Now an id is a slot and how many consoles the slot has held (`host/console/kernel.c`), so a closed
console's id names nothing again (`dolly-console-0.wat` says so); image inputs unchanged
(`46de2b9c…`). `test/console-browser.mjs` passes in Chromium and Firefox, its flood `dd | cat`
waiting at 3 s and then delivering 20,000,000 bytes with status 0; the three splits likewise.
