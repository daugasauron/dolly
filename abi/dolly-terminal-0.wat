(module
  ;; Host-facing terminal schema. Within the terminal device boundary, the
  ;; browser supplies the shared Wasm memory and two output callbacks. Input
  ;; and command-result state live in the shared memory mailbox returned below.
  ;; Emscripten bootstrap, clocks, and entropy are audited separately.
  (import "env" "memory" (memory i64 1024 131072 shared))
  (import "env" "dolly_terminal_write"
    (func $dolly_terminal_write (param i64)))
  (import "env" "dolly_terminal_write_bytes"
    (func $dolly_terminal_write_bytes (param i64 i64)))

  ;; Mailbox version 1 is aligned to 64 bytes. Its first seven little-endian
  ;; atomic u32 values are input_read, input_write, input_wake,
  ;; result_sequence, result_status, foreground_pid, and flags. The input ring
  ;; begins at byte 64 and has the capacity returned below. Cursors are
  ;; monotonically wrapping u32 values; the capacity is a power of two.
  (func (export "dolly_terminal_mailbox_address") (result i64)
    i64.const 0)
  (func (export "dolly_terminal_mailbox_version") (result i32)
    i32.const 1)
  (func (export "dolly_terminal_input_capacity") (result i32)
    i32.const 65536)

  ;; This call owns the worker until the shell exits. It may block on atomic
  ;; wait because it is never invoked on the browser main thread.
  (func (export "dolly_shell_run") (result i32)
    i32.const 0)
)
