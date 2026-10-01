# Add an Emacs image

- STATUS: OPEN
- PRIORITY: 310
- TAGS: demo,editor,image

Owner request (2026-10-01): an Emacs image, built inside Dolly from pinned
upstream GNU Emacs sources, like the Neovim demo (`demos/neovim/`: build image,
runtime module, image that enters the editor, browser test).

## Expect to need (check each against upstream before patching)

- Terminal Emacs only (`--without-x`, `-nw`): termios and a terminfo/ncurses
  (or Emacs' termcap fallback) inside the image.
- The build runs `temacs` to produce the portable dump (`pdump`) and
  byte-compiles the Lisp tree: many spawned Dolly processes and a large memory
  peak; measure both.
- Subprocesses (`M-x shell`, `compile`, `M-!`): Dolly has no `fork`/`exec`;
  Emacs uses `posix_spawn` where configure finds it, which Dolly supports.
- Timers: Emacs uses `setitimer`/`timer_create` for its atimers; Dolly's
  `alarm()` path is unresolved (`20260930-100000-audit-06`). Timers must work
  or fail explicitly, not silently.
- Sockets fail explicitly (no `M-x package-install` from ELPA until an HTTP
  path exists; see `20260930-225918-pip-http` for the broker approach).

## Done when

- `demos/emacs/` owns the recipes, sources, preparation hook, README and test;
  the `emacs` image opens into Emacs; a browser test in Chrome and Firefox
  edits and saves a file, runs `M-!` and a shell command, and exits back to
  Slop; the image builds from a fresh `npm run image -- emacs`.

## Owner priority (2026-10-01, 23:10)

Raised: "I want to make it higher priority to have an emacs image (or
package?)". Decision: Emacs is a Dollyfile 6 `PACKAGE` named `emacs`, so
recipes `INSTALL` it and `amy install emacs` works in any session, plus an
`emacs` application that opens into it, like Neovim. Agent branch `work/emacs`
from the Dollyfile 6 checkpoint `2e0d3cd`.
