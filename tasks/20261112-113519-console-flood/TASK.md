# The console test's flood runs a program `system` lacks, and after an interrupt it never ends

- STATUS: OPEN
- PRIORITY: 320
- TAGS: console,bug,tests

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

## Do

Flood with a program `system` has (`head -c 20000000 /dev/zero` or `seq`), then run the whole
test again to see whether the hang after `interrupt()` stays; if it does, trace the next
console's processes after `dolly_console_interrupt`.

## Done when

"console pipes" passes in Chromium and Firefox, its flood delivering 20,000,000 bytes.
