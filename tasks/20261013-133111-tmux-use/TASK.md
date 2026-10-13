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
