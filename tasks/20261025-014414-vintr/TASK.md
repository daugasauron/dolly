# The terminal's interrupt key is Ctrl+C alone: termios c_cc[VINTR] is not honoured (Emacs sets C-g)

- STATUS: CLOSED
- PRIORITY: 70
- TAGS: core,terminal,0.1.4

## Closed (2026-10-25): the terminal's interrupt key is VINTR, on the owner's word ("Just fix the C-g thing now")

- The terminal mode carries the interrupt character in bits 8 to 15 (`DOLLY_TERMINAL_INTERRUPT`
  in `include/dolly/runtime.h`); 0 there is Ctrl+C, so a mode set from flags alone keeps it.
  The process contract is unchanged: the character travels in the `flags` word `MODE_SET` has.
- The libc adapter takes `VINTR` from `tcsetattr` and reports it in `tcgetattr`; under `ISIG`
  it refuses `VINTR` off, `VQUIT` other than off or `VINTR`'s key, and `VSUSP` on.
- The kernel publishes the key in the terminal mailbox's word 3 (`abi/dolly-supervisor-0.wat`:
  the interrupt character while `ISIG` is set, 0 otherwise); the page's interrupt chord is that
  key's control character, and the Worker interrupts only if it is still the key. `pty@0`'s
  line discipline takes the same key.
- Emacs's Dolly patch no longer clears `ISIG`: Emacs sets `VINTR` (and `VQUIT`) to C-g as on any
  Unix.
- Measured on the seed `17781608`: `test/process-browser.mjs` (a program sets C-g: Ctrl+C
  reads as its byte, C-g interrupts), `terminal-browser.mjs` and `pty-browser.mjs` pass in
  Chromium and Firefox; `demos/emacs/test/emacs-browser.mjs` passes in both, C-g ending `M-!
  sleep 30` at once (the test allows 15 s; before, it ran its 30 s).

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
