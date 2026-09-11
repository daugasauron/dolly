# Display ownership

One surface has two producers: the resident Ghostty terminal and, temporarily,
one foreground graphics process. Pixels, terminal parsing and application input
handling stay in Wasm. The browser validates/blits frames and forwards input.

## Process API

`<dolly/display.h>` exposes these operations over `dolly_process_0.call`;
packet layouts live in `<dolly/process.h>`.

| Operation | Purpose |
| --- | --- |
| `dolly_display_acquire` | Foreground lease, generation and geometry |
| `dolly_display_set_size` | Bounded logical framebuffer dimensions |
| `dolly_display_begin_frame` | Private writable buffer, dimensions, stride and length |
| `dolly_display_present` | Copy and publish a complete frame |
| `dolly_display_wait_frame` | Wait for the browser frame sequence, not a callback |
| `dolly_display_set_cursor` | Closed cursor values, including click-gated capture |
| `dolly_display_next_event` | Bounded semantic input record or timeout |
| `dolly_display_release` | Restore the terminal |

Pixels are top-down non-premultiplied RGBA8. Present copies bounded chunks from
private process memory into an inactive kernel frame. The kernel checks
dimensions, stride, generation, index and complete length before publication;
the browser checks and copies that frame. Programs cannot publish browser addresses.

Mailbox v5 includes animation-frame pacing and captured-pointer input in the
128-byte layout. Capture requires a user canvas click; Escape, release or failure
undoes it. Relative movement is bounded thousandths of a CSS pixel. Camera
sensitivity and gestures belong to the program, not the host.

Pointer records use flags bits 8–10 for the DOM button number (0 left, 1 middle,
2 right, 3 back, 4 forward). Zero preserves the original left-button encoding.
These additive semantics keep mailbox v5's record size and offsets unchanged.
Graphics leases receive hover and button events, including while captured;
terminal selection still receives only left-button drags. SDL2 translates these
records and captured movement into ordinary SDL mouse events.

## Lifecycle and terminal

A lease belongs to PID/generation and can be acquired only by the foreground
root or an active descendant. Exit, trap and forced termination release it.
There is no compositor, background owner, DOM/Canvas handle or WebGL API.

During a lease, Ghostty keeps parsing output and tracking resize without
publishing frames. Release redraws its retained grid. Foreground replacement
also drains old key/paste/pointer input and tty buffers; resize is preserved so
old input cannot become commands at the recovery prompt.

Terminal writes update Ghostty synchronously; the supervisor coalesces dirty
rasterization on a 16 ms kernel presentation tick. That tick cannot consume
terminal-query responses. It services resize, selection and scrolling even when
no program reads stdin, leaving keys/text/paste for the reader.

Ghostty owns selection and formats bounded copy text. Ctrl+Shift+C performs the
browser clipboard write after a user gesture; terminal output cannot request it.
Wheel deltas are thousandths of a row; scrollback and fractional movement stay
in Wasm. Mouse and touch use the same records, with no browser phone mode.

Before the renderer is available, bootstrap progress uses a plain-text sink.
See [Ghostty builds](zig-ghostty.md) and the [boundary review](browser-boundary.md).

## Games and rebuilding

Gamedev compiles raylib's `PLATFORM_MEMORY` software renderer and Box3D's real
3D physics from pinned source. `libdolly-raylib.a` copies rasterizer output
into the process frame without an intermediate Image allocation; process-to-
kernel and checked browser copies still occur. Prefer a small logical resolution
for software-rendered 3D; the browser scales the complete image.

- `/gamedev/` runs Singularity. Space/click fires, G changes gravity, E pulses,
  A/D or drag orbits, W/S zooms, R resets, Q/Escape exits.
- `/bhop/` runs Airtime's Foundry course. A/D plus mouse turning builds air
  speed; Space or either wheel direction jumps. Escape pauses/releases capture,
  Q exits, R resets and 1–4 select practice sections. It uses its own fixed-step
  movement controller, not Box3D player physics. The [agent overlay](bhop.md)
  supports OpenRouter and local Codex with recorded framebuffer attempts.
- `/gamedev-phone/` keeps touch controls inside the same Wasm program.
  It still needs a memory64-capable browser.

```sh
make -f /usr/src/dolly/gamedev/gamedev.mk
graphics-demo --frames 12
# In the bhop image:
make -f /usr/src/dolly/bhop/bhop.mk all check
```

The retained sources and gamedev skill document the adapter and game mechanics.
