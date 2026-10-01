# Ctrl+C cannot stop a builtin-only loop at the interactive Slop prompt

- STATUS: CLOSED
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

## Decision (owner, 2026-10-01)

Termios ISIG, the Unix model. Ctrl+C is SIGINT to the foreground while its
terminal has ISIG set and input while a program clears ISIG (raw mode, as Pi's
editor and Codex do). Slop's line editor clears ISIG while reading a line and
restores it while commands run, so a builtin-only loop stops. This replaces
`include/dolly/runtime.h`'s rule that Ctrl+C is not mutable terminal state.

## Implementation (`ae86e8c`, demos `148f77d`, pins `2f4a89a`)

- `DOLLY_TERMINAL_ISIG` joins the terminal discipline bits and is set by
  default. `refresh_foreground` publishes the foreground as interruptible exactly
  while it is set and runs again on every mode change; the interactive-owner
  child scan is gone. libc and CPython termios translate `ISIG` both ways rather
  than always reporting it; Janis's `setRawMode` clears it with `ICANON`/`ECHO`
  on a TTY, as Node's does, so Pi's editor reads Ctrl+C as input.
- The supervisor still spares an interactive owner while it has running
  descendants (like a job-control shell); without any it now takes SIGINT itself.
- Slop's interactive loop clears `ISIG` while it reads a line and sets it while
  the line runs. Its SIGINT handler (no `SA_RESTART`) records the request; after
  every command the shell checks it, and every 64th command also asks the kernel
  with `dolly_interrupt_poll()`. A builtin loop then ends with 130 and the prompt
  returns; `read` from the terminal stops instead of restarting.
- `dolly_interrupt_poll()` is answered in the process Worker within 1 ms of a
  kernel entry that reported no pending signal, like clock reads already were.
- The display lease follows the foreground owner rather than its interruptibility,
  so a game a raw-mode Pi starts can still acquire it.

## Measurements (2026-10-01, Chrome / Firefox, headless)

- `dolly_interrupt_poll()`: 5.4 / 13.0 µs through the kernel, 0.19 / 0.23 µs
  answered in the Worker.
- `while :; do i=$((i+1)); case $i in N) break;; esac; done`, three commands per
  iteration, 300k iterations, median of 9-11 runs: 2.08 / 2.8-3.1 µs per
  iteration without polling. Polling the kernel after every command: 21.3 /
  35.9 µs (8.5x). Polling the Worker after every command: +50% / +36-43%.
  Every 64th command (shipped): -0.7% (noise) / +2-5%.

## Behaviour changes

- An interactive owner that keeps `ISIG` now takes SIGINT while it runs no
  child: the `foreground -i` game entries (classicube-agent, rts-arena,
  bhop-agent) end on Ctrl+C instead of receiving the key, as games started from
  Slop already did.
- Raw-mode programs read Ctrl+C as input: Ctrl+C in Neovim ends `:sleep` and
  Neovim keeps running; the libuv probe in the CMake demo sets `ISIG` again to
  test its SIGINT callback. Both demo tests are updated but were not run here.

## Evidence (2026-10-01, `work/isig`, default chain rebuilt)

- `node test/browser-tests.mjs chromium` and `firefox`: all 18 core browser
  tests pass. New checks: Ctrl+C ends `while :; do :; done` at the prompt with
  130 and the shell runs the next command (`test/slop-browser.mjs`); a program
  that clears `ISIG` through termios reads Ctrl+C as 0x03
  (`test/terminal-browser.mjs`, `terminal-ui raw`); a display-less page still
  interrupts a script ENTRY (`test/host-compute-browser.mjs`). Existing Ctrl+C
  checks of external commands (core, shell, process, threads, upload, audio)
  pass unchanged.
- javascript image, Chrome and Firefox: a Janis program after
  `process.stdin.setRawMode(true)` receives Ctrl+C as the byte 3 and the
  foreground reads as not interruptible; `qjs` CPU loops still end with 130.
  `demos/javascript/test/javascript-browser.mjs` passes.
- `npm run test:source` (343) and `node --test test/slop.test.mjs` pass.

## Remaining

- Done-when's Pi half: `demos/pi/test/pi-browser.mjs` now types a draft while
  the final response streams and expects Ctrl+C to clear it. The pi image needs
  the Rust seed rebuilt (it hashes `runtime.h`), so it was not run here; nor were
  the updated Neovim and CMake demo tests.


## Gap found (2026-10-01, 14:58)

A Ctrl+C pressed right after Enter, while Slop is still launching the command,
targets the shell (no running descendant yet); Slop records it, but the command
then starts and runs uninterrupted (`qjs -e 'for (;;) {}'` hung until the test
timeout). In Unix the child shares the foreground process group and receives the
signal. Slop should not start a command when an interrupt arrived after the line
was submitted, or the kernel should deliver it to the child once spawned.

## Decision (2026-10-01, delegated)

Slop does not start a command after an interrupt reached the shell since the
line was submitted; the command line ends with 130.

## Closed (2026-10-01, release candidate `rc-2026-10-01`)

ISIG semantics and the launch-window fix (`892c163`: Slop does not start a
command after an interrupt reached it) shipped in the candidate; the Slop
browser test (Ctrl+C ends a builtin loop with 130) and the Pi demo test (Ctrl+C
while a response streams reaches Pi's editor as input) pass on it.
