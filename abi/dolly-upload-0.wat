(module
  ;; Explicit local-user input. No new callable host import: the page polls
  ;; this mailbox and offers a file picker. Only a user's selection supplies
  ;; bytes. No host path, filename, handle, URL or filesystem operation crosses.
  (import "env" "memory" (memory i64 1024 131072 shared))
  (func (export "dolly_upload_mailbox_address") (result i64) i64.const 0)
  (func (export "dolly_upload_mailbox_version") (result i32) i32.const 0)

  ;; Nine atomic little-endian u32 words, then padding to 64 B, then 64 KiB:
  ;; 0 request sequence (kernel), 1 cancelled sequence (kernel),
  ;; 2 completed sequence (browser: no further writes for this request),
  ;; 3 chunk sequence (browser), 4 consumed sequence (kernel),
  ;; 5 chunk length, 6 positive target errno (0 on success), 7 EOF (0 or 1).
  ;; 8 provider enabled (browser: 1 while mounted, 0 otherwise). Rebuild-only
  ;; workers have no picker; UPLOAD_FILE returns ENOSYS there, never waits.
  ;; Browser waits for chunk == consumed, copies bytes and metadata, then
  ;; publishes chunk+1. Kernel consumes before acknowledging. EOF/error ends
  ;; the stream. Cancellation retires the UI/reader before completing request.
  ;; Kernel starts another request only after browser completion. One file at
  ;; a time, at most 64 MiB; both sides enforce bounds independently. Wasm owns
  ;; destination, temporary file, atomic publication and process-exit cleanup.
)
