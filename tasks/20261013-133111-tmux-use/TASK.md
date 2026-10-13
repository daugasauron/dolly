# tmux in use: one pane's output on another's screen, a flickering status line, and what using it finds

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: demo,tmux,bug,terminal

Owner (2026-10-13): "Tmux works but there are a lot of bugs apparent at any
usage. Use an agent to test using tmux with different windows/panes to find
and fix issues. One example now is that output from one pane shows in the
other panes screen. Also the bottom bar flickers etc."

Done when: an agent has used tmux as a person does (several windows, panes
split both ways, an editor in one pane and builds in another, long output,
scrolling back, resizing the window, detach and attach), every defect it
met is fixed with a test that failed before, or written here with its
reproduction; the two the owner names are among the fixed; in Chromium and
Firefox.

## As filed (2026-10-13, main `474b19f9`)

The owner's screen, in the `default` image after `nena enable pty` and `amy
install tmux`: an editor on `yeah.mojo` in the left pane, a shell in the
right one. The first lines (the rest of the left pane is the editor's `~`
rows):

```
from gpu.host import DeviceContext                    │dolly:/workspace$ mojo build yeah.mojo
                                                      │
dolly: preparing 91.8 MiB WebAssembly executable for this session...   │dolly:/workspace$ ./mojo
dolly: executable ready in 0.3s                       │slop: ./mojo: No such file or directory
    print("name:", ctx.name())                        │dolly:/workspace$ ./yeah
dolly: preparing 74.7 MiB WebAssembly executable for this session...   │dolly: process 139 was refused: host module gpu@0 is not enabled: nena enable gpu
dolly: executable ready in 0.3seate_buffer[DType.float32](4)           │slop: status 126
dolly:/workspace$ _fill(1.5)                          │dolly:/workspace$ nena enable gpu
    ctx.synchronize()                                 │nena: gpu@0 enabled
[0] 0:slop*                                                   "dolly" 13:27 13-Oct-26
```

- **One pane's output on another's screen.** The lines that land in the
  editor are the runtime's own, about commands typed in the right pane:
  "dolly: preparing … WebAssembly executable for this session..." and
  "dolly: executable ready in …". A read of the screen, not yet measured:
  they are written to the display's terminal and not to the terminal of the
  program being started, so in tmux they land wherever tmux last left the
  cursor; a prompt of the right pane's shell is in the editor's rows too
  (`dolly:/workspace$ _fill(1.5)`). The refusal of `./yeah` did reach its
  own pane.
- **The status line flickers.**
- Not defects, by the owner's word the same day: plain `tmux` saying `start
  one with: tmux -D &` ("fine due to the fork limitation"), and the status
  line's clock in UTC ("I don't want to add like timezone host bridges").

## 2026-10-14 00:10: what was found (branch `core/tmux-use`)

Driven through the page as the tmux test does: keys typed into it, the
screen read back or photographed, `default` after `nena enable pty` and `amy
install tmux vi`. Evidence is in `work/evidence-2026-10-14/tmuxuse/`.

### 1. The runtime's notice lands in another pane (fixed, `2fcc6c62`)

Reproduced: two panes, the session's first `cc` in the right one, Chrome
asked to compile the whole executable on one thread so that the notice is
due (2.3 s). "dolly: preparing 74.7 MiB WebAssembly executable for this
session..." and "dolly: executable ready in 2.3s" were written at column 0
of the rows under tmux's cursor, the left pane's, and the command's own
output then landed elsewhere, because the display's cursor was no longer
where tmux had left it. That is the owner's screen, the stray prompt too.

Cause: `src/process-supervisor.mjs` writes the two lines with
`dolly_terminal_write_bytes`, which is the display's terminal whoever
started the program. The fix is in the kernel: the supervisor's words are
about the executable it prepares, so they go to that process's descriptor 2
where it is a terminal (the display's, or a pseudo-terminal's slave) and
nowhere otherwise. Not into a file or a pipe, and not onto a display the
process is not on. `dolly_process_worker_failed` already wrote a refusal to
the process's own descriptor 2.

The only other thing the runtime writes to a terminal by itself is that
refusal; the page writes none (its notices are elements of the page). Read
in `src/`, `host/display/` and `host/input/`.

Left for the next round, because the file is pinned in the docs package:
the comment on `dolly_terminal_write_bytes` in `abi/dolly-supervisor-0.wat`
still says "the terminal"; it is the terminal of the process being launched.

### 2. The status line "flickers": the screen was drawn wrong (fixed)

Measured first: the status row's pixels were sampled at every painted frame
(`bar-probe.js`, `flicker.mjs`) while tmux idled, a command was typed, a
pane scrolled 3000 lines, the window was split and each pane scrolled. In
both browsers the row never changed: tmux redraws the status line in one
write inside a synchronized update (`CSI ? 2026 h`), every display write was
logged from the kernel to see it, and the page presents whole frames.

It changed when `vi` (Neatvi) started in the left pane: the status line
went, the screen scrolled once per key typed and each letter landed at the
right edge. The log shows tmux itself writing
`ESC [ 94489280513 ; 94489280515 H` for row 1, column 3: (22 << 32) | 1 and
(22 << 32) | 3, where 22 is the column of the cursor address before it.

Cause: netbsd-curses's `tparm.c` formats every number with `%ld` and hands
it to `snprintf` as an `int` (`onum`). That is undefined; on wasm64 the
variable arguments are read from memory and the other half of the long is
whatever the stack held. A terminal ignores such an address, so everything
tmux draws next is in the wrong place until it redraws: wrong rows, text in
another pane, a status line that goes and comes back. Which addresses came
out wrong depended on what tmux had done before, so it looked like many
bugs. The library's recipe now makes `onum` take the long it is given.

`6a50ec00`. Before it, both new checks failed in Chromium: the tmux test's
editor in the left pane never had its text on the pane's first row, and
amy's `libterminfo` case, which now dirties the stack before it asks for a
cursor address, got another address. The recipe change rebuilds
`libterminfo`, `tmux` and `tmux-panes`.

### 3. tmux used as a person uses it (after the two fixes)

`use.mjs`, a screenshot after each step (`use-BROWSER-NN-*.png`), on
`default`: three windows and switching between them by `n`, `p` and number,
a rename; panes split both ways, moving between them, zoom, resizing a pane
and the browser window; 3000 lines of output and copy mode back through
them; `less` and `vi` in a pane, `vi` beside a pane that scrolls; Ctrl+C;
256 colours, bold, underline, reverse; a paste; `less` in a second window
while switching away and back; detach and attach. Each screen is as tmux
means it.

What it met that is not tmux's and not fixed here:

- **The mouse does nothing in tmux.** tmux asks the terminal for mouse
  reports (`mouse` is on in this build) and gets none: a click selects no
  pane and the wheel scrolls nothing. The display's terminal keeps the
  pointer and the wheel for its own selection and scrollback
  (`docs/input.md`) and has no scrollback to show under a full-screen
  program. Reproduce: two panes, click in the other one, type. Reporting the
  mouse to a program that asks is the display library's
  (`src/ghostty/display.c`), an image input: left.
- **A window's name stays `slop`** whatever runs in it, and a new pane
  starts in the server's directory, not the pane's. The port's
  `osdep_get_name` and `osdep_get_cwd` answer nothing: the kernel has no
  way to ask which program holds a terminal or where it stands. Left until
  it has one.
- **Ctrl+Z does nothing**, here as at the display's terminal: Dolly's
  processes do not stop (`docs/process-model.md`).
- CJK text and emoji are drawn as boxes, two cells wide as they should be:
  the terminal's font has no glyphs for them, in tmux or out of it.

The same in Firefox, screen for screen. The status row sampled again after
the fixes (`flicker.mjs`): no change in any phase in either browser, the
editor in the left pane and a pane scrolling beside it among them (before:
five changes and the row gone).

## Closed 2026-10-14

The done-when is met on `core/tmux-use` (`2fcc6c62`, `6a50ec00`,
`eca9972d`): tmux was used as the task lists, in Chromium and Firefox; the
two defects the owner named are fixed, each with a test that failed before;
what else it met is above with its reproduction, in the demo's README as a
limit, and in [the next round's task](../20261012-220109-next-round/TASK.md)
where it needs the seed.

Measured in `work/tmuxuse` (image inputs unchanged, `538c5a8a…`; runtime
`1e4cdfb2…`; `libterminfo`, `tmux` and `tmux-panes` rebuilt):

| Check | Result |
| --- | --- |
| `demos/tmux/test/tmux-browser.mjs` | passes in both |
| amy's `libterminfo` case, alone in `default` | passes in both |
| Status row sampled at every frame (`flicker.mjs`) | no change in any phase, both |
| `use.mjs`, `editors.mjs` (dte, nvim beside a scrolling pane) | screens as meant, both |
| Core suite (`slot.sh hugebuild`) | 44 tests pass in each browser; `amy-browser.mjs` stops at `amy install cmake`: this tree registers 33 images |
| Pi's demo test | 12 of 12 |
| `javascript`, `python` demo tests | pass |
| Source suite, `test/dolly.artifacts.mjs` | 349 of 349, 17 of 17 |

For the owner to see it, the integrator rebuilds `libterminfo`, `tmux` and
`tmux-panes` and serves the new runtime.
