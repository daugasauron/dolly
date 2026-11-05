# The terminal draws the colours a program sets (OSC 4, 10, 11, 12)

- STATUS: OPEN
- PRIORITY: 100
- TAGS: display,terminal

Found by `core/terminal-palette` (2026-11-04): the renderer draws the page's palette and ignores
the colours a program sets with OSC 4 (a palette entry), 10, 11 and 12 (foreground, background,
cursor), which Ghostty's terminal state already holds. A terminal that honours them is what programs
expect (themes in editors and shells set them). Decided by the integrator: yes; the renderer draws
Ghostty's effective colours, with the page's palette as the defaults OSC 104/110/111/112 restore.
Measure first what it changes: the programs in the catalog that send these sequences (Neovim, Emacs,
tmux) on their default configurations, before and after.

Done when: a program's `printf '\e]11;#102030\a'` turns the canvas background, read as a pixel,
and `\e]111\a` restores the page's, in Chromium and Firefox; the terminal and display suites pass.
