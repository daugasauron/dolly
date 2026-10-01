(module
  ;; Image boot contract. The browser may pack and persist system snapshots;
  ;; the runtime validates and restores the retained filesystem. This adds no
  ;; callable browser import and therefore no escape capability.
  (import "env" "memory" (memory i64 1024 131072 shared))

  (func (export "dolly_snapshot_format_version") (result i32)
    i32.const 2)

  ;; Allocate a bounded staging region in Wasm memory. The worker may only copy
  ;; the verified packaged snapshot into this checked region before asking Wasm
  ;; to restore it. A restore attempt consumes the staging allocation, including
  ;; on failure; the caller must allocate and copy again before retrying.
  (func (export "dolly_snapshot_restore_address") (param i64) (result i64)
    i64.const 0)
  (func (export "dolly_bootstrap_snapshot") (param i64) (result i32)
    i32.const 0)
  ;; Fresh boot streaming uses the same staging range, bounded by the caller.
  ;; Begin reads 32 expected digest bytes and receives the canonical image size.
  ;; Write consumes bytes; end_part=1 requires a complete sorted snapshot part
  ;; and returns its SHA-256 in the first 32 staging bytes. End verifies the
  ;; complete canonical image and starts the display. On failure discard the
  ;; runtime: no command or saved session may observe a partial filesystem.
  (func (export "dolly_bootstrap_snapshot_begin") (param i64) (result i32)
    i32.const 0)
  (func (export "dolly_snapshot_stream_write") (param i64 i32) (result i32)
    i32.const 0)
  (func (export "dolly_bootstrap_snapshot_end") (result i32)
    i32.const 0)
  (func (export "dolly_bootstrap_finish") (result i32)
    i32.const 0)
  (func (export "dolly_process_bootstrap_prepare") (result i32)
    i32.const 0)
  ;; Restore only /bin/dollyfile from the staged base. That command's FROM
  ;; operation owns the full filesystem restore. The second parameter is 1.
  (func (export "dolly_process_bootstrap_resume_prepare")
    (param i64 i32) (result i32)
    i32.const 0)

  ;; The Worker stages fixed boot-control records in the in-Wasm filesystem.
  ;; This is a memory-to-WasmFS copy, not a browser filesystem capability.
  (func (export "dolly_write_file") (param i64 i64 i64) (result i32)
    i32.const 0)

  ;; A cold /rebuild asks Wasm to capture the system manifest, then copies the
  ;; resulting opaque range into a static packaged artifact. Each capture
  ;; invalidates its predecessor; failure leaves address/size zero. Finishing
  ;; boot releases the successful capture, so copy it before bootstrap_finish.
  (func (export "dolly_snapshot_capture") (result i32)
    i32.const 0)
  (func (export "dolly_snapshot_address") (result i64)
    i64.const 0)
  (func (export "dolly_snapshot_size") (result i64)
    i64.const 0)
)
