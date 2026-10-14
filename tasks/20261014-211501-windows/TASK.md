# Several programs in their own windows

- STATUS: OPEN
- PRIORITY: 90
- TAGS: graphics,host-modules,owner

Owner (2026-10-14): "I want different apps in different windows", with
reusable upstream software, not a window system of Dolly's own. Today one
foreground process holds the display (`docs/display.md`): SDL2, raylib and
Wine draw for one program at a time.

Done when the owner has chosen a path and it is a task of its own.

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
