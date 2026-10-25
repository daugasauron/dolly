# The terminal's interrupt key is Ctrl+C alone: termios c_cc[VINTR] is not honoured (Emacs sets C-g)

- STATUS: OPEN
- PRIORITY: 70
- TAGS: core,terminal,0.1.4

## State (2026-10-25)

Measured on `core/runtime-cleanup` (2026-10-24, the process-group change, recorded in
`tasks/20261023-220000-getrusage`): in Emacs, `C-g` during `M-! sleep 30` does not interrupt
the command, which runs its 30 s; Emacs reads the `C-g` after it ends. Emacs, as on any Unix,
sets the terminal's interrupt character to `C-g` (`c_cc[VINTR]` through `tcsetattr`) and relies
on the terminal to signal the foreground. Dolly's terminal signals SIGINT for Ctrl+C alone
(`ISIG`, the owner's decision of 2026-10-01), and the libc adapter refuses such a `tcsetattr`
with `EINVAL` (`terminal_mode_from_attributes` in `src/process/libc-adapter.c`: with `ISIG`,
`VINTR` must be 3 and `VQUIT` and `VSUSP` 0), so Emacs keeps Ctrl+C as the terminal's key.

The interrupt key is not in the terminal's mode contract (`DOLLY_TERMINAL_*` in
`include/dolly/runtime.h` is a set of bits, and the page's interrupt check knows Ctrl+C), so
honouring `VINTR` extends that contract: the owner's decision before any code.

To do: the terminal sends SIGINT for the character `c_cc[VINTR]` holds while `ISIG` is set
(and `VQUIT` and `VSUSP` as far as Dolly has those signals, or say they have none), with a check
in the terminal or pty test, and Emacs's `C-g` measured again.

Done when: `C-g` interrupts `M-! sleep 30` in Emacs in Chromium and Firefox, and a program that
sets `VINTR` to another character gets SIGINT from it and not from Ctrl+C.
