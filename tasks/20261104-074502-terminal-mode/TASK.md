# The terminal starts in POSIX's mode: ICRNL on, VMIN 0 and VTIME honoured

- STATUS: OPEN
- PRIORITY: 240
- TAGS: core,terminal,kernel,libc

Two findings of the same discipline, decided 2026-11-04 (`tasks/20261102-133353-owner-decisions`).

**VMIN 0 and VTIME.** The discipline refused every non-canonical `VMIN` but 1 and every `VTIME`
but 0, so a TUI that reads keys without blocking the termios way (kilo, many C and Rust programs)
failed `tcsetattr` with EINVAL and exited at once, only on a real terminal (Studio take s8b's Rust
garden). Fixed on `fix/video-findings`: ab51b690 (`DOLLY_TERMINAL_VMIN_ZERO` bit 7 and
`DOLLY_TERMINAL_VTIME` bits 16-23 in `runtime.h`, the kernel's read deadline, the adapter's
translation both ways), 588a5ebd (a VMIN 0 read a signal interrupts begins anew), 8f3a9d49 (pins).
Measured on rebuilt `default` and `system` in Chromium and Firefox (`terminal`, `pty`, `core`).
Its task, `tasks/20261102-023648-video-findings`, is on the branch; its other boxes (the garden
driver's variants on rebuilt Rust images, Pi's RPC latency around a failed request) stay its own.
Yes: merge the branch. A seed change, a round.

**ICRNL.** The kernel's initial mode (`src/dolly.c:21`) is CANONICAL ECHO OPOST ONLCR ISIG, without
ICRNL, where every Unix terminal starts with it (`stty sane`). A program that leaves `c_iflag` as
`tcgetattr` gives it reads Enter as CR in raw mode: measured on Neatvi (`one^Mtwo^Mthree` on one
line, `:wq` never runs; `vi-enter-2.log` of `tasks/20261102-133210-recipes-core`), which is why
`demos/tools/Dollyfile-vi` wraps `read`. `DOLLY_TERMINAL_ICRNL` exists (bit 5); the line editor
already ends a line at either character (`dolly.c:132`). Yes: the flag joins the initial mode (kernel
C, not an image input), vi's wrapper goes and vi rebuilds. A program that wants CR clears the flag.

Done when: `fix/video-findings` is merged and its task closed; `DOLLY_TERMINAL_ICRNL` is in the
initial `terminal_mode_flags`, a check in `test/fixtures/terminal-ui.c` reads it back through
`tcgetattr` (fails before); `Dollyfile-vi` has no `read` wrapper and the rebuilt vi takes `one`,
Enter, `two`, Enter, `:wq` as two lines in Chromium and Firefox; `test/terminal-browser.mjs`
(`vmin0`), `test/pty-browser.mjs` and `test/core-browser.mjs` pass in both browsers on the
round's images; `docs/process-model.md` lists the initial mode as it is.
