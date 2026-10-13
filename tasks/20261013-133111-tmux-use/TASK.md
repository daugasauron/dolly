# tmux in use: one pane's output on another's screen, a flickering status line, and what using it finds

- STATUS: OPEN
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
install tmux vi`. Evidence is in `work/tmuxuse/build/tmuxuse-evidence/`.

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
