# Ghostty in X11 snappy; kitty graphics in Dolly's terminal

- STATUS: CLOSED
- PRIORITY: 80
- TAGS: graphics,demo,owner

Owner (2026-10-16): "Now, optimize ghostty in x11, it needs to be snappy.
Also I want you to add kitty graphics, this should be in the default image
as well. The idea is that agents (such as pi) can render image output in
the terminal." Before, on the Ghostty demo: "It's really slow, not snappy at
all" and "It should have amy".

Done when Ghostty's window answers keys without a visible lag, ghostty-x11
has amy, and pi shows an image in the default image's terminal.

## Closed (2026-10-16, 18:15)

Built and tested in the round on `integrate/ghostty` (pins `7bac6611`,
tests `e73bf6a4`): source 433/0, artifacts 25/0, core browser suite,
demos 26 passed. Evidence: `work/evidence-2026-10-16/ghostty-x11/`,
`work/evidence-2026-10-16/kitty/`.

- Ghostty (`0e890140`, `02e92e15`): a profile showed Ghostty's GTK thread
  87% in softpipe's shader interpreter, a frame of a shell 410 ms. On
  Emscripten the renderer clears to the background color and shades cell
  backgrounds only over the rows that have one: 51 ms a frame; a key's echo
  in 65 ms instead of 0.7 s; `seq 1 5000` 0.2 s instead of 2.2 s; built
  ReleaseFast (no debug banner). ghostty-x11 installs amy and nena.
  Measured before: Dolly's wakeups (pipes, ptys, sockets, threads, GLib's
  main loop, libxev's Async) all under a millisecond.
- Kitty graphics (`2d2faca8`, `935477e0`): Ghostty's terminal library with
  kitty graphics and Wuffs at Ghostty's pins; the display plugin decodes PNG
  with stb_image and draws placements below and above the text; it answers
  size queries (CSI 14/16/18 t); `TERM_PROGRAM=ghostty`. Shared memory and
  files are refused. pi, reading a PNG through a scripted model, shows it
  inline in Chromium and Firefox, a square square.
- Found on the way: `threads@0` allows 32 Workers a process (GLib's task
  pool met Ghostty's threads past 16 in Firefox; 64 in all unchanged);
  the Wasm interface reader passed a large table's indices as spread
  arguments and refused Mojo's compiler and Codex (`1f110359`).
