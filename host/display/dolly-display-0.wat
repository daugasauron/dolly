(module
  ;; Browser-facing display contract: the frames the page shows and the
  ;; surface it shows them on. Once the source-built driver is resident, the
  ;; kernel sends raw terminal output to it.
  (import "env" "memory" (memory i64 1024 131072 shared))

  ;; Boot-only, host-initiated display installation. Wasm reads DISPLAY from
  ;; its own filesystem and exposes bytes; the browser instantiates those
  ;; bytes with Wasm-only imports, then returns the v6 driver structure address.
  ;; There is deliberately no guest-callable browser loader import.
  (func (export "dolly_display_prepare") (result i32) i32.const 0)
  (func (export "dolly_display_module_address") (result i64) i64.const 0)
  (func (export "dolly_display_module_size") (result i64) i64.const 0)
  (func (export "dolly_display_install") (param i64) (result i32) i32.const 0)

  ;; The mailbox is 44 atomic little-endian u32 words (display.h mirrors them;
  ;; kernel.c checks the offsets). The kernel and its driver write the first
  ;; 19. The page advances the animation-frame sequence once per frame it
  ;; draws while a program holds the display, and publishes the surface it
  ;; shows frames on: width and height in CSS pixels and the device scale in
  ;; thousandths, between two steps of the surface sequence, which is odd
  ;; while they change. It publishes the terminal's colours so too, before
  ;; the driver is installed and whenever they change: the background, the
  ;; text, the cursor, then the 16 colours programs name, each 0xRRGGBB. The
  ;; cursor style is Dolly's closed enum.
  (global (export "DOLLY_DISPLAY_MAILBOX_SIZE") i32 (i32.const 176))
  (global (export "DOLLY_DISPLAY_WORD_FLAGS") i32 (i32.const 0))
  (global (export "DOLLY_DISPLAY_WORD_FRAME_SEQUENCE") i32 (i32.const 1))
  (global (export "DOLLY_DISPLAY_WORD_FRAME_INDEX") i32 (i32.const 2))
  (global (export "DOLLY_DISPLAY_WORD_FRAME_WIDTH") i32 (i32.const 3))
  (global (export "DOLLY_DISPLAY_WORD_FRAME_HEIGHT") i32 (i32.const 4))
  (global (export "DOLLY_DISPLAY_WORD_FRAME_STRIDE") i32 (i32.const 5))
  (global (export "DOLLY_DISPLAY_WORD_TERMINAL_COLS") i32 (i32.const 6))
  (global (export "DOLLY_DISPLAY_WORD_TERMINAL_ROWS") i32 (i32.const 7))
  (global (export "DOLLY_DISPLAY_WORD_FONT_SIZE_MILLI") i32 (i32.const 8))
  (global (export "DOLLY_DISPLAY_WORD_COPY_SEQUENCE") i32 (i32.const 9))
  (global (export "DOLLY_DISPLAY_WORD_COPY_LENGTH") i32 (i32.const 10))
  (global (export "DOLLY_DISPLAY_WORD_COPY_FLAGS") i32 (i32.const 11))
  (global (export "DOLLY_DISPLAY_WORD_CURSOR_COL") i32 (i32.const 12))
  (global (export "DOLLY_DISPLAY_WORD_CURSOR_ROW") i32 (i32.const 13))
  (global (export "DOLLY_DISPLAY_WORD_CELL_WIDTH") i32 (i32.const 14))
  (global (export "DOLLY_DISPLAY_WORD_CELL_HEIGHT") i32 (i32.const 15))
  (global (export "DOLLY_DISPLAY_WORD_PADDING_X") i32 (i32.const 16))
  (global (export "DOLLY_DISPLAY_WORD_PADDING_Y") i32 (i32.const 17))
  (global (export "DOLLY_DISPLAY_WORD_CURSOR_STYLE") i32 (i32.const 18))
  (global (export "DOLLY_DISPLAY_WORD_ANIMATION_FRAME_SEQUENCE") i32 (i32.const 19))
  (global (export "DOLLY_DISPLAY_WORD_SURFACE_SEQUENCE") i32 (i32.const 20))
  (global (export "DOLLY_DISPLAY_WORD_SURFACE_WIDTH") i32 (i32.const 21))
  (global (export "DOLLY_DISPLAY_WORD_SURFACE_HEIGHT") i32 (i32.const 22))
  (global (export "DOLLY_DISPLAY_WORD_SURFACE_SCALE_MILLI") i32 (i32.const 23))
  (global (export "DOLLY_DISPLAY_WORD_PALETTE_SEQUENCE") i32 (i32.const 24))
  (global (export "DOLLY_DISPLAY_WORD_PALETTE_BACKGROUND") i32 (i32.const 25))
  (global (export "DOLLY_DISPLAY_WORD_PALETTE_FOREGROUND") i32 (i32.const 26))
  (global (export "DOLLY_DISPLAY_WORD_PALETTE_CURSOR") i32 (i32.const 27))
  (global (export "DOLLY_DISPLAY_WORD_PALETTE_COLORS") i32 (i32.const 28))
  (func (export "dolly_display_mailbox_address") (result i64)
    i64.const 0)
  ;; The flags' bit while a foreground command holds the framebuffer lease.
  (global (export "DOLLY_DISPLAY_GRAPHICS_ACTIVE") i32 (i32.const 1))
  ;; The cursor styles: the page's own cursors, what a window system shows
  ;; over an edge, a corner, something being moved, work in progress, a
  ;; refusal and help.
  (global (export "DOLLY_DISPLAY_CURSOR_TEXT") i32 (i32.const 0))
  (global (export "DOLLY_DISPLAY_CURSOR_DEFAULT") i32 (i32.const 1))
  (global (export "DOLLY_DISPLAY_CURSOR_CROSSHAIR") i32 (i32.const 2))
  (global (export "DOLLY_DISPLAY_CURSOR_POINTER") i32 (i32.const 3))
  (global (export "DOLLY_DISPLAY_CURSOR_HIDDEN") i32 (i32.const 4))
  (global (export "DOLLY_DISPLAY_CURSOR_NS_RESIZE") i32 (i32.const 5))
  (global (export "DOLLY_DISPLAY_CURSOR_EW_RESIZE") i32 (i32.const 6))
  (global (export "DOLLY_DISPLAY_CURSOR_NWSE_RESIZE") i32 (i32.const 7))
  (global (export "DOLLY_DISPLAY_CURSOR_NESW_RESIZE") i32 (i32.const 8))
  (global (export "DOLLY_DISPLAY_CURSOR_MOVE") i32 (i32.const 9))
  (global (export "DOLLY_DISPLAY_CURSOR_WAIT") i32 (i32.const 10))
  (global (export "DOLLY_DISPLAY_CURSOR_PROGRESS") i32 (i32.const 11))
  (global (export "DOLLY_DISPLAY_CURSOR_NOT_ALLOWED") i32 (i32.const 12))
  (global (export "DOLLY_DISPLAY_CURSOR_HELP") i32 (i32.const 13))

  ;; Two fixed-address RGBA buffers of MAX_WIDTH * MAX_HEIGHT * 4 bytes are
  ;; allocated in Wasm memory. The mailbox atomically publishes which one
  ;; contains the latest complete frame and its checked dimensions and stride.
  ;; Its pixels are four bytes each, red, green, blue and a fourth the page
  ;; does not show, for a frame is opaque as a window is; left to right in rows
  ;; top to bottom.
  (global (export "DOLLY_DISPLAY_PIXEL_RGBA8") i32 (i32.const 1))
  (global (export "DOLLY_DISPLAY_MAX_WIDTH") i32 (i32.const 4096))
  (global (export "DOLLY_DISPLAY_MAX_HEIGHT") i32 (i32.const 2304))
  (global (export "DOLLY_DISPLAY_FRAME_COUNT") i32 (i32.const 2))
  (func (export "dolly_display_framebuffer_address") (param i32) (result i64)
    i64.const 0)

  ;; Dolly continuously publishes the active terminal selection into the copy
  ;; buffer: bytes, then length, flags and sequence, so the page's snapshot
  ;; around the sequence is never torn. The flags: a selection is available,
  ;; and it was longer than the buffer.
  (global (export "DOLLY_DISPLAY_COPY_CAPACITY") i32 (i32.const 262144))
  (global (export "DOLLY_DISPLAY_COPY_AVAILABLE") i32 (i32.const 1))
  (global (export "DOLLY_DISPLAY_COPY_TRUNCATED") i32 (i32.const 2))
  (func (export "dolly_display_copy_buffer_address") (result i64)
    i64.const 0)

  ;; The terminal's tick: apply a newly published surface and palette and the
  ;; pointer and scroll input that is the terminal's own, then publish at most
  ;; one dirty frame. Returns zero or a negative errno.
  (func (export "dolly_terminal_present_pending") (result i32) i32.const 0)

  ;; Process operations of a foreground command's framebuffer lease; their
  ;; packets are defined in display.h.
  (global (export "DOLLY_DISPLAY_ACQUIRE") i32 (i32.const 96))
  (global (export "DOLLY_DISPLAY_SET_SIZE") i32 (i32.const 97))
  (global (export "DOLLY_DISPLAY_BEGIN_FRAME") i32 (i32.const 98))
  (global (export "DOLLY_DISPLAY_WRITE_FRAME") i32 (i32.const 99))
  (global (export "DOLLY_DISPLAY_PRESENT") i32 (i32.const 100))
  (global (export "DOLLY_DISPLAY_WAIT_FRAME") i32 (i32.const 101))
  (global (export "DOLLY_DISPLAY_SET_CURSOR") i32 (i32.const 102))
  (global (export "DOLLY_DISPLAY_RELEASE") i32 (i32.const 103))
)
