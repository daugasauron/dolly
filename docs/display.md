# Display ownership

Dolly has one display surface and two renderers: the resident Ghostty terminal
and, temporarily, one foreground command. This is an in-Wasm ownership change,
not a new browser capability. Both renderers use the same two runtime-allocated
RGBA buffers and the browser continues to do exactly one thing: validate and
copy the most recently published buffer to its canvas.

## Command ABI

`<dolly/display.h>` exposes five operations whose exact Wasm types live in
`abi/dolly-0.wat`:

- `dolly_display_acquire` gives the active foreground command an exclusive
  generation token and the current surface geometry;
- `dolly_display_begin_frame` returns only the non-visible buffer, its exact
  writable length, dimensions, stride, and pixel format;
- `dolly_display_present` atomically publishes that buffer;
- `dolly_display_next_event` returns one bounded semantic Dolly input record,
  or times out;
- `dolly_display_release` restores the terminal.

Pixels are top-to-bottom, left-to-right, non-premultiplied RGBA8. The runtime
owns width, height, and `width * 4` stride; a command cannot publish arbitrary
browser addresses or geometry. Resize events update the surface before the
next `begin_frame`.

While a lease is active, Ghostty keeps parsing terminal output and tracks
resize internally but does not publish frames. On release it immediately
rasterizes its retained grid into the inactive buffer, so the previous shell or
Pi screen returns without reconstructing terminal state.

## Lifecycle rule

The lease belongs to a Dolly PID and generation, and only that active command
may use it. The runtime forcibly releases a matching lease at the synchronous
command boundary. This covers normal return, `exit`, assertion termination, and
PID-targeted Ctrl-C status 130. A fatal runtime-wide `abort` still destroys the
whole version-0 machine, so there is no display state to restore.

There is deliberately no compositor, window tree, DOM handle, canvas API, or
background owner. Version 0 is one exclusive fullscreen surface because it is
the smallest model useful for games, visual tools, and future TUIs. Corrupt
commands can corrupt any in-Wasm pixels or terminal state—they already share
the userspace address space—but they gain no new way out of the Wasm sandbox.

The gamedev image compiles upstream raylib 6.0's no-OS `PLATFORM_MEMORY`
software renderer and Box2D 3.1.1 from pinned source. A small
`libdolly-raylib.a` adapter copies raylib's completed in-Wasm RGBA image into
the leased Dolly buffer; it adds no browser import. `/usr/bin/graphics-demo`
is an interactive physics game built from both libraries. Use A/D or arrows,
Space, and pointer clicks; Q or Escape restores Slop. For a finite smoke test,
run `graphics-demo --frames 2`. The retained source and Pi skill document the
same adapter API for agent-written games.

## Terminal selection and scrolling

The browser never reconstructs terminal cells. It forwards bounded pointer and
scroll records into the shared input ring. The resident in-Wasm driver passes
press, drag, and release through Ghostty's selection-gesture state machine,
installs the resulting Ghostty selection, renders its highlight, and formats
the selected cells into Dolly's bounded copy buffer. `Ctrl+Shift+C` is a direct
local-user gesture that copies that already-formatted text to the host system
clipboard; it is not an autonomous capability callable by a command.

Wheel movement is encoded as signed thousandths of a terminal row. Touch drag
is converted to the same semantic record on phones. Fractional deltas,
scrollback position, terminal history, and rasterization all remain in Wasm;
the browser has no terminal viewport of its own. Touch taps still become a
bounded Ghostty pointer gesture, while a vertical drag scrolls rather than
selects.
