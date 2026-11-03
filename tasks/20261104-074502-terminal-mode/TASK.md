# The terminal starts in POSIX's mode: ICRNL on, VMIN 0 and VTIME honoured

- STATUS: OPEN
- PRIORITY: 240
- TAGS: core,terminal,kernel,libc

## State (2026-11-04, branch `core/terminal-mode`)

Done in code: `fix/video-findings` merged (f701e633, repinned ac273d20); the initial mode with
ICRNL (1c725ae7). Measured on this tree's rebuilt `default`, `system` and `vi` (seed `3bc72763…`,
24 images, 17.5 min): `terminal` (its `vmin0` and `discipline`), `pty`, `core` and the vi probe
pass in Chromium and Firefox. Left: Janis's and Python's checks on rebuilt `typescript` and
`python` (building), the fixtures' failure before the kernel change, and the catalog round.

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

## Work (2026-11-04)

- **Merge.** `fix/video-findings` into `core/terminal-mode` with `work/integrate-merge.sh`: one hand
  merge in `src/process-kernel.c` (the process struct took both integrate's `mailbox` and the
  branch's `read_deadline`), recipes three-way, docs digests and pins regenerated (ac273d20); no
  recipe line of the branch lost (the script's CHECK guard). Its task's open boxes stay its own.
- **Stale after the merge:** `demos/python/test/fixtures/python-process.py` still expected
  `tcsetattr` to refuse VMIN 0 and VTIME 5; it now expects the refusal of VMIN 2 (825f18c8).
- **ICRNL** (1c725ae7). `DOLLY_KERNEL_TERMINAL_INITIAL_MODE` (`src/process-kernel.h`) is the one
  initial mode, of the display's terminal (`src/dolly.c`) and of a pseudo-terminal's slave
  (`host/pty/kernel.c`, which had the same five flags: a program under tmux or xterm met the same
  CR). What assumed the old mode follows:
  - Janis's `setRawMode` cleared CANONICAL, ECHO and ISIG only. With ICRNL on it would have handed
    Pi LF for Enter; it now clears ICRNL as libuv's raw mode does (`tmp.c_iflag &= ~(BRKINT |
    ICRNL | INPCK | ISTRIP | IXON)`). Check: `javascript-browser.mjs`, Enter in raw mode is 13.
  - Slop's line editor ends a line at CR or LF (`src/slop.c`, `read_interactive_line`): unchanged.
  - `terminal-ui.c discipline` asserted `c_iflag == 0`; it now reads ICRNL back. `pty.c` reads it
    on a new pair. `python-process.py` asserted no ICRNL. Neovim's test bounded the mode word at
    31 (its flags before ICRNL); now below 128 (VMIN_ZERO), still not an error status.
  - `demos/tools/Dollyfile-vi` lost its `read` wrapper and the `-include` that applied it.
  - `docs/process-model.md` lists the initial mode.
  - Read and left: programs that set raw mode with `cfmakeraw`, linenoise, readline, ncurses'
    `raw`/`nonl`, crossterm, Go's x/term, Python's `tty.setraw` clear ICRNL themselves; voice.c
    and xterm-pty.c take the mode they find.
- **Measured** (`build/termmode-evidence/`, 08:35-08:40 JST): `test/terminal-browser.mjs`,
  `test/pty-browser.mjs`, `test/core-browser.mjs` and `vi-enter.mjs` (in `default`: `amy install vi`,
  `vi /tmp/vi-enter`, `ione`, Enter, `two`, Escape, `:wq`, Enter; vi ends with status 0 and the file
  is `one`, `two`) passed in Chromium and Firefox (`a-*-{chromium,firefox}.log`). Before, a vi built
  without the wrapper put `one^Mtwo^Mthree` on one line and never ran `:wq` (`vi-enter-2.log`,
  `work/evidence-2026-11-03/recipes-core/`).
