(module
  ;; Build-artifact contract. Snapshot contents remain opaque to the harness:
  ;; the Wasm runtime owns the fixed path manifest and binary format.
  ;; This adds no callable browser import and therefore no escape capability.
  (import "env" "memory" (memory i64 1024 131072 shared))

  (func (export "dolly_snapshot_format_version") (result i32)
    i32.const 1)

  ;; Allocate a bounded staging region in Wasm memory. The worker may only copy
  ;; the verified packaged snapshot into this checked region before asking Wasm
  ;; to restore it.
  (func (export "dolly_snapshot_restore_address") (param i64) (result i64)
    i64.const 0)
  (func (export "dolly_bootstrap_snapshot") (param i64) (result i32)
    i32.const 0)
  (func (export "dolly_bootstrap_resume") (param i64 i32) (result i32)
    i32.const 0)
  (func (export "dolly_bootstrap_finish") (result i32)
    i32.const 0)

  ;; A cold /rebuild asks Wasm to capture the system manifest, then copies the
  ;; resulting opaque range into a static packaged artifact.
  (func (export "dolly_snapshot_capture") (result i32)
    i32.const 0)
  (func (export "dolly_snapshot_address") (result i64)
    i64.const 0)
  (func (export "dolly_snapshot_size") (result i64)
    i64.const 0)

  ;; Named user sessions are opaque filesystem snapshots requested through a
  ;; separate shared-memory mailbox. The browser may compress and persist the
  ;; bytes, but never receives path-level filesystem operations.
  (func (export "dolly_session_mailbox_address") (result i64)
    i64.const 0)
  (func (export "dolly_session_mailbox_version") (result i32)
    i32.const 1)
  (func (export "dolly_session_name_address") (result i64)
    i64.const 0)
  (func (export "dolly_session_name_capacity") (result i32)
    i32.const 128)
  (func (export "dolly_session_transfer_address") (result i64)
    i64.const 0)
  (func (export "dolly_session_transfer_capacity") (result i32)
    i32.const 1048576)
  (func (export "dolly_session_restore_address") (param i64) (result i64)
    i64.const 0)
  (func (export "dolly_session_restore") (param i64) (result i32)
    i32.const 0)
)
