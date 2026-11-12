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

## State (2026-11-12)

On `fix/osc-colours` (from main): `render_frame` (`src/ghostty/display.c`) reads Ghostty's
effective colours before drawing (`GHOSTTY_TERMINAL_DATA_COLOR_FOREGROUND`, `_BACKGROUND`,
`_CURSOR`, `_PALETTE`); the page's palette stays the terminal's defaults (`set_palette`), which
OSC 104 and 110 to 112 restore. `test/theme-browser.mjs`'s first part prints OSC 11 with
`#102030` and reads the frame's corner, then OSC 111 and the page's background again: passed in
Chromium and Firefox on ghostty-build, display and system built from the branch in the root. The
change reaches every image that installs `display` (about 200 recipes repinned), so it waits for
a full round. Not measured yet: what Neovim, Emacs and tmux send on their defaults (as far as
read, Neovim only asks the background with OSC 11 `?`).

Done when: a program's `printf '\e]11;#102030\a'` turns the canvas background, read as a pixel,
and `\e]111\a` restores the page's, in Chromium and Firefox; the terminal and display suites pass.
