(module
  ;; Browser-facing display and input contract. The browser supplies shared
  ;; memory and one bootstrap-only text sink. Once the source-built display
  ;; driver is resident, raw terminal output never crosses this boundary.
  (import "env" "memory" (memory i64 1024 131072 shared))
  (import "env" "dolly_bootstrap_write_bytes"
    (func $dolly_bootstrap_write_bytes (param i64 i64)))

  ;; Mailbox version 3 starts with 30 atomic u32 fields. The final two fields
  ;; form the PID-targeted SIGINT sequence. Input events remain fixed 128-byte
  ;; records beginning at byte 128. The browser copies ordinary DOM event data
  ;; without terminal encoding; the in-Wasm Ghostty driver owns encoding.
  (func (export "dolly_display_mailbox_address") (result i64)
    i64.const 0)
  (func (export "dolly_display_mailbox_version") (result i32)
    i32.const 3)
  (func (export "dolly_display_event_size") (result i32)
    i32.const 128)
  (func (export "dolly_display_event_capacity") (result i32)
    i32.const 256)

  ;; Two fixed-address RGBA buffers are allocated in Wasm memory. The mailbox
  ;; atomically publishes which one contains the latest complete frame and its
  ;; checked dimensions and stride.
  (func (export "dolly_display_framebuffer_address") (param i32) (result i64)
    i64.const 0)
  (func (export "dolly_display_framebuffer_capacity") (result i64)
    i64.const 0)

  ;; Clipboard data is capability-directional. The browser can publish one
  ;; explicit user paste into the paste buffer; Dolly continuously publishes
  ;; the active terminal selection into the copy buffer. Atomic mailbox
  ;; sequence fields make both byte snapshots race-free.
  (func (export "dolly_display_paste_buffer_address") (result i64)
    i64.const 0)
  (func (export "dolly_display_copy_buffer_address") (result i64)
    i64.const 0)
  (func (export "dolly_display_clipboard_capacity") (result i32)
    i32.const 262144)

  ;; WasmFS's JavaScript device passes bytes straight back into this runtime
  ;; export. Before driver installation it reaches the bootstrap sink; after
  ;; installation the resident driver consumes it without host interpretation.
  (func (export "dolly_terminal_write_bytes") (param i64 i64))

  ;; This call owns the worker until the shell exits. It may block on the
  ;; mailbox wake word because it is never invoked on the browser main thread.
  (func (export "dolly_shell_run") (result i32)
    i32.const 0)
)
