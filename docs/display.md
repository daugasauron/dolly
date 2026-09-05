# Display ownership

Dolly has one display surface and two producers: the resident Ghostty terminal
and, temporarily, one foreground process. This is an in-Wasm ownership change,
not a new browser capability. The browser continues to do exactly one thing:
validate and copy the most recently published kernel RGBA buffer to its canvas.

## Command ABI

`<dolly/display.h>` exposes eight operations implemented by the process adapter.
Their closed opcodes and pointer-free packets live in `<dolly/process.h>` and
cross the sole `dolly_process_0.call` executable import:

- `dolly_display_acquire` gives the active foreground command an exclusive
  generation token and the current surface geometry;
- `dolly_display_set_size` selects bounded logical framebuffer dimensions for
  the lease while retaining the browser viewport's aspect ratio in adapters;
- `dolly_display_begin_frame` returns a private process buffer, its exact
  writable length, dimensions, stride, and pixel format;
- `dolly_display_present` atomically publishes that buffer;
- `dolly_display_wait_frame` waits for the next browser animation frame using
  a sequence word, without exposing a callback, timer, or browser object;
- `dolly_display_set_cursor` selects one value from the closed text, default,
  crosshair, pointer, and hidden cursor enum;
- `dolly_display_next_event` returns one bounded semantic Dolly input record,
  or times out;
- `dolly_display_release` restores the terminal.

Pixels are top-to-bottom, left-to-right, non-premultiplied RGBA8. Present first
copies sequential, bounded chunks from the process's private memory through the
multi-memory gate into an inactive fixed-capacity kernel frame. The kernel
enforces maximum width, height, stride, generation, buffer index, and complete
frame length before publishing it. A process cannot publish a private or
arbitrary browser address. The browser scales the checked kernel image.

Mailbox version 4 adds only two atomic words: an animation-frame sequence and
a semantic cursor value. The trusted page increments the former from
`requestAnimationFrame` only while a graphics lease is active and maps the
latter through a fixed JavaScript table. Neither is a new Wasm import or an
open-ended browser capability.

While a lease is active, Ghostty keeps parsing terminal output and tracks
resize internally but does not publish frames. On release it immediately
rasterizes its retained grid into the inactive buffer, so the previous shell or
Pi screen returns without reconstructing terminal state.

Without a graphics lease, terminal writes update Ghostty's parser and grid
synchronously in Wasm. Rasterization is deliberately coalesced: the process
supervisor calls the kernel's presentation service every 16 milliseconds, and
the resident driver publishes at most one dirty framebuffer on that tick. This
keeps long compiler logs incremental without repainting a complete RGBA frame
for every small `write(2)`. A presentation tick has zero output capacity, so it
cannot consume or discard terminal-query responses waiting to become stdin.
The tick is a kernel export call, not a browser import or new capability.

## Lifecycle rule

The lease belongs to a Dolly PID and generation, and only the foreground root
or one of its active descendants may acquire it. The kernel releases a matching
lease whenever that process exits or its Worker fails. This covers normal
return, `exit`, traps, and forced Ctrl-C status 130.

Terminal input has the same ownership rule even without a framebuffer lease.
When the resident Pi process exits, pending records from that foreground epoch
are drained before recovery Slop is published. Resize records are applied, but
keys, text, paste, pointer, and scroll records cannot leak into the new prompt;
the tty's encoded and canonical buffers are reset as well.

There is deliberately no compositor, window tree, DOM handle, canvas API, or
background owner. Version 0 is one exclusive fullscreen surface because it is
the smallest model useful for games, visual tools, and future TUIs. Corrupt
processes can draw arbitrary pixels while they own the lease. Private process
memory prevents direct terminal-state corruption, though Dolly's containment
claim still assumes total compromise of all in-Wasm state.

The gamedev image compiles upstream raylib 6.0's no-OS `PLATFORM_MEMORY`
software renderer and Box3D 0.1.0 from pinned source. A small
`libdolly-raylib.a` adapter calls raylib's software rasterizer copy operation
directly into Dolly's inactive leased buffer. This removes the former
`LoadImageFromScreen` allocation and intermediate in-Wasm copy; one
rasterizer-to-Dolly copy and the browser's validated stable copy remain. The
default adapter caps software rendering at 800×450 while preserving the
viewport aspect ratio, then the browser scales the complete image. This raised
the measured demo cadence from about 21 to 48 frames per second on the audit
machine without adding a browser import.

`/usr/bin/graphics-demo` is an interactive 3D physics game built from both
libraries. It renders oriented rigid bodies, collapsible block towers, a
distance-joint pendulum, and Box3D explosions with Iosevka UI text, a fixed
physics step, animation-frame pacing, and a crosshair cursor. Use WASD or
arrows to move, Space to jump, E or a pointer click to blast, R to reset, and Q
or Escape to restore Slop. For a finite smoke test, run
`graphics-demo --frames 2`. The retained source and Pi skill document the same
adapter API for agent-written games.

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
