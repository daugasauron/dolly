# Ctrl+C cannot stop a builtin-only loop at the interactive Slop prompt

- STATUS: OPEN
- PRIORITY: 230
- TAGS: core,kernel,slop,lifecycle,design

`while :; do :; done` typed at the prompt runs forever: an interactive owner without
live children is not interruptible ([`refresh_foreground`](../../src/process-kernel.c)),
so Ctrl+C reaches Slop as input it never reads. Only a page reload recovers.

## Findings

- An experiment (branch `fix/userspace2`, `01bd1f6`, reverted in `takeover-20260930`)
  let Slop handle SIGINT and poll `dolly_interrupt_poll()` once per loop iteration; a
  kernel/supervisor patch marked an interactive owner interruptible whenever it is not
  blocked in a terminal read and delivered SIGINT without the forced-exit timer
  (`work/userspace2/build/userspace2-evidence/kernel-interrupt-experiment.diff`).
  Loops stopped in Chrome and Firefox.
- Not applied: the rule changes every interactive owner, not only Slop. Pi runs as
  `foreground -i /usr/bin/pi` and Janis exits 130 on SIGINT
  (`demos/javascript/quickjs-main.c` interrupt handler), so Ctrl+C while Pi is busy
  would end Pi instead of reaching its editor. The Slop half alone costs one kernel
  call per iteration for a signal that never arrives.

## Open question

How an interactive owner chooses between Ctrl+C as input and Ctrl+C as SIGINT while
busy, without making Ctrl+C mutable terminal state (`include/dolly/runtime.h`).

## Done when

- Browser check: Ctrl+C stops `while :; do :; done` at the Slop prompt, and Ctrl+C in
  Pi while a response streams still reaches Pi as input.
