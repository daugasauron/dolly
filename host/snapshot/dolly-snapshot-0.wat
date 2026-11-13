(module
  ;; Named user sessions are opaque snapshots of the whole filesystem but /dev,
  ;; /proc and /run, requested through a separate shared-memory mailbox. The browser may compress and persist the
  ;; bytes, but never receives path-level filesystem operations. This adds no
  ;; callable browser import and therefore no escape capability.
  (import "env" "memory" (memory i64 1024 131072 shared))

  ;; Eleven atomic little-endian u32 words in a 64-byte header (snapshot.h
  ;; mirrors them): the page writes request_sequence, the session's name being
  ;; the page's own; the kernel publishes total_size, chunk_length and
  ;; chunk_eof under chunk_sequence (notified), the page acknowledges with
  ;; chunk_consumed_sequence, and the kernel ends the request with status
  ;; and completed_sequence (notified). The page writes cancelled_sequence
  ;; to abandon a request. changes is the kernel's count, published at each
  ;; service, of the changes processes made to files, directories and links
  ;; since the last capture began (it stops at its largest value): zero says a
  ;; save would hold what the last one does.
  (global (export "DOLLY_SESSION_MAILBOX_HEADER_SIZE") i32 (i32.const 64))
  (global (export "DOLLY_SESSION_TRANSFER_CAPACITY") i32 (i32.const 1048576))
  (global (export "DOLLY_SESSION_WORD_REQUEST_SEQUENCE") i32 (i32.const 0))
  (global (export "DOLLY_SESSION_WORD_COMPLETED_SEQUENCE") i32 (i32.const 1))
  (global (export "DOLLY_SESSION_WORD_STATUS") i32 (i32.const 2))
  (global (export "DOLLY_SESSION_WORD_CHUNK_SEQUENCE") i32 (i32.const 3))
  (global (export "DOLLY_SESSION_WORD_CHUNK_CONSUMED_SEQUENCE") i32 (i32.const 4))
  (global (export "DOLLY_SESSION_WORD_CHUNK_LENGTH") i32 (i32.const 5))
  (global (export "DOLLY_SESSION_WORD_CHUNK_EOF") i32 (i32.const 6))
  (global (export "DOLLY_SESSION_WORD_TOTAL_SIZE_LOW") i32 (i32.const 7))
  (global (export "DOLLY_SESSION_WORD_TOTAL_SIZE_HIGH") i32 (i32.const 8))
  (global (export "DOLLY_SESSION_WORD_CANCELLED_SEQUENCE") i32 (i32.const 9))
  (global (export "DOLLY_SESSION_WORD_CHANGES") i32 (i32.const 10))
  (func (export "dolly_session_mailbox_address") (result i64)
    i64.const 0)
  ;; One step of a save: starts a requested capture or publishes the next
  ;; chunk once the page consumed the previous one; it never waits.
  (func (export "dolly_session_service"))
  (func (export "dolly_session_transfer_address") (result i64)
    i64.const 0)
  ;; A boot that restores a save in place of an image: begin empties the
  ;; filesystem but /dev, /proc and /run; each write takes the next bytes of the
  ;; decompressed save from the transfer range, at most its capacity, and
  ;; last=1 ends it, every record arrived. Nonzero fails the boot.
  (func (export "dolly_session_restore_begin") (result i32)
    i32.const 0)
  ;; A recovery takes a save into a new directory of the booted filesystem,
  ;; which stays as it is otherwise: the transfer range holds the directory's
  ;; path and then each path to take, every one NUL-terminated, the parameter
  ;; their bytes in all. The save follows through dolly_session_restore_write;
  ;; of its records the regular files and directories at or under a path to
  ;; take are made below the directory, and the rest is passed over. A failure
  ;; removes the directory.
  (func (export "dolly_session_recover_begin") (param i64) (result i32)
    i32.const 0)
  (func (export "dolly_session_restore_write") (param i64 i32) (result i32)
    i32.const 0)
)
