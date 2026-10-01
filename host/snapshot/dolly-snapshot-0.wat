(module
  ;; Named user sessions are opaque filesystem snapshots requested through a
  ;; separate shared-memory mailbox. The browser may compress and persist the
  ;; bytes, but never receives path-level filesystem operations. This adds no
  ;; callable browser import and therefore no escape capability.
  (import "env" "memory" (memory i64 1024 131072 shared))

  (func (export "dolly_session_mailbox_address") (result i64)
    i64.const 0)
  (func (export "dolly_session_mailbox_version") (result i32)
    i32.const 2)
  (func (export "dolly_session_base_capture") (result i32)
    i32.const 0)
  (func (export "dolly_session_service"))
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
