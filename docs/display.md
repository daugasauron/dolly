# Display

One canvas has two producers: the resident Ghostty terminal and, while it holds a
lease, one foreground graphics process. Terminal parsing and rasterization stay
in Wasm; the browser only checks and blits RGBA frames and publishes the size of
the surface it shows them on
([`host/display/dolly-display-0.wat`](../host/display/dolly-display-0.wat),
[`host/display.mjs`](../host/display/display.mjs)). Keys and the pointer are
another module, [`input@0`](input.md): an image that only draws declares no
input.

```mermaid
flowchart LR
  surface["Surface size and scale"] -- "mailbox words" --> ghostty["Ghostty plugin: VT, scrollback, selection, font"]
  input["input@0 records"] -- "decoder" --> ghostty
  ghostty -- "RGBA frame" --> fb["Two kernel framebuffers"]
  app["Foreground process holding the lease"] -- "dolly_display_present" --> fb
  fb -- "checked copy" --> canvas["Page canvas"]
```

## Page

- The presenter ([`display.mjs`](../host/display/display.mjs)) copies a
  published frame once, into an image it keeps per frame size, and paints only
  when the frame sequence changes. An idle terminal requests no animation
  frames: the Worker notifies the page of a new frame, lease or cursor.
- The page notifies the Worker of each animation frame, so a program waiting
  for one resumes then, not at the next 16 ms tick.
- The page writes the terminal area's size in CSS pixels and the device scale
  into the mailbox whenever they change. The kernel hands them to the driver
  on its tick, lease or not, and sends SIGWINCH when the grid changes, also
  when Ctrl+= or Ctrl+- changed the font size.

## Terminal

- Ghostty is the only resident kernel plugin, so terminal state survives
  foreground replacement. Its closed contract
  ([`dolly-kernel-plugin-0.wat`](../abi/dolly-kernel-plugin-0.wat)) is built only
  by `cc --dolly-kernel-plugin -shared`; ordinary programs cannot target it.
- Trusted boot code copies the plugin bytes from WasmFS and links them to an
  explicit map of kernel exports ([`kernel-plugin.mjs`](../src/kernel-plugin.mjs)):
  no URLs, dependency loading or JavaScript evaluation.
- The driver ([`ghostty/display.c`](../src/ghostty/display.c)) renders
  libghostty-vt's grid with IosevkaTerm SemiBold through stb_truetype. The
  supervisor coalesces redraws on a 16 ms tick.
- Ghostty owns selection and copy text; Ctrl+Shift+C writes the clipboard only
  after that user gesture. Scrollback stays in Wasm.
- The plugin is also the terminal's input decoder: it registers with the
  input kernel how a record becomes the bytes a program reads
  ([`input.h`](../host/input/input.h)). Without `input@0` no record arrives.
- Before the plugin loads, and in images without a display, output goes to a
  plain-text bootstrap log.

## Graphics processes

[`host/display/display.h`](../host/display/display.h) exposes these operations over
`dolly_process_0.call`:

| Operation | Purpose |
| --- | --- |
| `dolly_display_acquire` | Foreground lease, generation and geometry |
| `dolly_display_set_size` | Logical framebuffer size |
| `dolly_display_begin_frame` | Private writable buffer and stride |
| `dolly_display_present` | Copy and publish a complete frame |
| `dolly_display_wait_frame` | Wait for the browser's animation frame |
| `dolly_display_set_cursor` | Closed cursor values |
| `dolly_display_release` | Return the canvas to the terminal |

- Frames are top-down non-premultiplied RGBA8. The kernel checks size, stride,
  generation and length before publishing; the browser checks again.
- Only the foreground process or a descendant can acquire the lease. Exit, trap
  or forced termination releases it, and Ghostty redraws its retained grid.
- The lease starts at the terminal's frame size; a program picks its own with
  `dolly_display_set_size` and the page scales the frame to the canvas. It is
  not told when the page's surface changes.
- A program that also reads keys or the pointer takes the
  [input lease](input.md) beside this one. One that only draws leaves keys
  with the terminal and reads them from its standard input.
- `dolly_display_wait_frame` waits for the page's next animation frame, a
  counter the page advances only while a graphics lease is active and the tab
  is drawn. It is not a clock: the page may advance it faster than the
  program presents, and not at all in a hidden tab. Pace a simulation with
  `clock_gettime(CLOCK_MONOTONIC)` and use the frame only to avoid drawing
  more often than the page shows.

- There is no compositor, DOM or WebGL access; GPU programs use
  [`gpu@0`](gpu.md).

## Zig and the Ghostty build

- `zig-build` ([`Dollyfile-zig-build`](../Dollyfile-zig-build),
  [`Dollyfile-zig-build`](../Dollyfile-zig-build)) builds Zig 0.16 from its source archive with
  Dolly `cc`, as upstream `bootstrap.c` does with two substitutions. WAMR, built
  by `cc` ([`zig1.c`](../src/zig/zig1.c)), interprets upstream `zig1.wasm`
  because wasm2c's translation overflows a browser Worker's native stack. zig1
  emits zig2 as C with only the C backend ([`config.zig`](../src/zig/config.zig)),
  which `cc` compiles to `/usr/bin/zig`.
- `ghostty-build` ([`Dollyfile-ghostty-build`](../Dollyfile-ghostty-build),
  [`Dollyfile-ghostty-build`](../Dollyfile-ghostty-build)) has that Zig emit Ghostty VT and
  compiler_rt as C, compiles them with `cc` and links `/usr/lib/libdisplay.so`.
  `system` copies only that plugin, the font and licenses.
- This Zig has no LLVM: it emits only C, so there is no `zig build` or `zig cc`.
  Host preparation only patches the pinned tree for Emscripten's wasm64 layouts
  and WasmFS ([`zig-0.16.0-dolly-native.patch`](../patches/zig-0.16.0-dolly-native.patch));
  the SDK files are listed in [`zig-sdk-files.txt`](../config/zig-sdk-files.txt).
- Ghostty's generated option and Unicode tables are pinned source inputs
  ([`src/ghostty/generated/`](../src/ghostty/generated/README.md));
  [`ghostty-dolly.patch`](../config/ghostty-dolly.patch) zeroes page-pool buffers.
