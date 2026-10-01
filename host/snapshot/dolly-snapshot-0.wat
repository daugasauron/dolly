(module
  ;; Named user sessions are opaque filesystem snapshots requested through a
  ;; separate shared-memory mailbox. The browser may compress and persist the
  ;; bytes, but never receives path-level filesystem operations. This adds no
  ;; callable browser import and therefore no escape capability.
  (import "env" "memory" (memory i64 1024 131072 shared))

  ;; Eleven atomic little-endian u32 words in a 64-byte header (snapshot.h
  ;; mirrors them): the page writes the session name, name_length and
  ;; request_sequence; the kernel publishes total_size, chunk_length and
  ;; chunk_eof under chunk_sequence (notified), the page acknowledges with
  ;; chunk_consumed_sequence, and the kernel ends the request with status
  ;; and completed_sequence (notified). The page writes cancelled_sequence
  ;; to abandon a request.
  (global (export "DOLLY_SESSION_HEADER_SIZE") i32 (i32.const 64))
  (global (export "DOLLY_SESSION_NAME_CAPACITY") i32 (i32.const 128))
  (global (export "DOLLY_SESSION_TRANSFER_CAPACITY") i32 (i32.const 1048576))
  (global (export "DOLLY_SESSION_WORD_REQUEST_SEQUENCE") i32 (i32.const 0))
  (global (export "DOLLY_SESSION_WORD_COMPLETED_SEQUENCE") i32 (i32.const 1))
  (global (export "DOLLY_SESSION_WORD_STATUS") i32 (i32.const 2))
  (global (export "DOLLY_SESSION_WORD_NAME_LENGTH") i32 (i32.const 3))
  (global (export "DOLLY_SESSION_WORD_CHUNK_SEQUENCE") i32 (i32.const 4))
  (global (export "DOLLY_SESSION_WORD_CHUNK_CONSUMED_SEQUENCE") i32 (i32.const 5))
  (global (export "DOLLY_SESSION_WORD_CHUNK_LENGTH") i32 (i32.const 6))
  (global (export "DOLLY_SESSION_WORD_CHUNK_EOF") i32 (i32.const 7))
  (global (export "DOLLY_SESSION_WORD_TOTAL_SIZE_LOW") i32 (i32.const 8))
  (global (export "DOLLY_SESSION_WORD_TOTAL_SIZE_HIGH") i32 (i32.const 9))
  (global (export "DOLLY_SESSION_WORD_CANCELLED_SEQUENCE") i32 (i32.const 10))
  (func (export "dolly_session_mailbox_address") (result i64)
    i64.const 0)
  (func (export "dolly_session_base_capture") (result i32)
    i32.const 0)
  ;; One step of a save: starts a requested capture or publishes the next
  ;; chunk once the page consumed the previous one; it never waits.
  (func (export "dolly_session_service"))
  (func (export "dolly_session_name_address") (result i64)
    i64.const 0)
  (func (export "dolly_session_transfer_address") (result i64)
    i64.const 0)
  (func (export "dolly_session_restore_address") (param i64) (result i64)
    i64.const 0)
  (func (export "dolly_session_restore") (param i64) (result i32)
    i32.const 0)
)
