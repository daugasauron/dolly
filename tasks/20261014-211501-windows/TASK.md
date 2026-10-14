# Several programs in their own windows

- STATUS: OPEN
- PRIORITY: 90
- TAGS: graphics,host-modules,owner

Owner (2026-10-14): "I want different apps in different windows", with
reusable upstream software, not a window system of Dolly's own. Today one
foreground process holds the display (`docs/display.md`): SDL2, raylib and
Wine draw for one program at a time.

Done when the owner has chosen a path and it is a task of its own.

## State (2026-10-15, 01:00): X11 runs, branch `demo/x11`

The owner asked for X11 ("Run the X11 benchmark", then "launch X11 in a
subagent"). `demos/x11` (worktree `work/bench`, six commits) builds the X
libraries, xorg-server with its SDL output revived on SDL2 (`xsdl/sdl.c`,
408 lines, the 2009 Xsdl brought to today's server), twm, xclock, xeyes and
xterm inside Dolly; image `x11-desktop` puts each in its own window on
Dolly's display. No core change. Checked by the integrator on 2026-10-15
00:45, `node demos/x11/test/x11-browser.mjs chromium firefox`, both passed:
xeyes follows the pointer in 85 / 73 ms, a window drag shows 52 / 49 frames
a second and is redrawn 43 ms after release, a key reaches xterm in 37 / 50
ms (Chrome / Firefox).

The core behaviours the port worked around, each a change to the seed for a
later round: `setuid`/`setgid` to the id a process has returns EPERM (POSIX
allows success); `select` is refused while `pselect` works; a pty master
reads end-of-file when the slave side closes (Linux: EIO); children die with
their parent, so twm's menu cannot start programs; Python has no
`os.geteuid` (`meson install` needs it).

Next on this path is GTK ([Ghostty in X11](../20261014-232500-ghostty-x11/TASK.md)).

## State (2026-10-14, 21:15): measured, the owner's to choose

- X11: `sockets@0` gives what an X server and its clients need to connect
  (a named stream socket and `poll`). An X server still needs an output to
  Dolly's display: xorg-server removed its SDL one (Xsdl, "kdrive: Purge
  Xsdl", SDL 1.2), so it would be revived on SDL2 or written at that size.
  With no shared memory between processes, pixels travel through the socket.
- Wayland: needs shared memory between processes (private Wasm memories) and
  descriptor passing (refused); not reachable.
- Nano-X (Microwindows) in client/server mode: an SDL2 screen driver, a
  window manager and Unix-socket clients, so no Dolly code; it runs Nano-X,
  NX11 (Xlib) and FLTK programs, not GTK or Qt.
- Measured (`bench.c` in a `system` session with `sockets@0`, two processes
  over `/tmp/.X11-unix/X0`, three runs each, the machine busy with a round,
  load 9 on 16 cores). Linux runs the same program in brackets:
  - round trip of 32 bytes each way: Chrome 42-96 us, Firefox 89-104 us (2.8 us);
  - 32-byte requests, one write each, unanswered: Chrome 82-96 k/s, Firefox
    32-35 k/s (3.5 M/s);
  - a 1920x1080 frame (8.3 MB): Chrome 4.3-5.9 ms best, 5.5-8.0 ms mean;
    Firefox 11 ms best, 15-22 ms mean (0.6-0.8 ms);
  - a 1024x768 frame (3 MB): Chrome 1.5-2.0 ms best; Firefox 4.0-4.5 ms best.
  Round trips are no obstacle; a full 1080p frame through a socket takes a
  third to a half of 16.7 ms in Chrome and about all of it in Firefox.
  To be measured again on an idle machine.
