(module
  ;; Explicit local-user input. No new callable host import: the kernel worker
  ;; reports each new request to the page, which offers a file picker. Only a
  ;; user's selection supplies bytes. No host path, filename, handle, URL or
  ;; filesystem operation crosses. A request right after the user cancelled
  ;; fails with ECANCELED without reopening the picker.
  (import "env" "memory" (memory i64 1024 131072 shared))
  (func (export "dolly_upload_mailbox_address") (result i64) i64.const 0)
  (func (export "dolly_upload_mailbox_version") (result i32) i32.const 1)

  ;; Ten atomic little-endian u32 words, then padding to 64 B, then one chunk:
  ;; 0 request sequence (kernel), 1 cancelled sequence (kernel),
  ;; 2 completed sequence (browser: no further writes for this request),
  ;; 3 chunk sequence (browser), 4 consumed sequence (kernel, notified),
  ;; 5 chunk length, 6 positive target errno (0 on success), 7 EOF (0 or 1).
  ;; 8 provider enabled (browser: 1 while mounted, 0 otherwise). Rebuild-only
  ;; workers have no picker; UPLOAD_FILE returns ENOSYS there, never waits.
  ;; 9 file size (browser, the same in every chunk of a transfer).
  ;; Browser waits for chunk == consumed, copies bytes and metadata, then
  ;; publishes chunk+1. The kernel sizes its temporary file at the first chunk
  ;; and writes each chunk before acknowledging it, so a transfer holds one
  ;; chunk outside the filesystem; EOF requires exactly the announced size.
  ;; EOF/error ends the stream; the user's Cancel during a transfer is
  ;; ECANCELED. Process cancellation retires the UI/reader before completing
  ;; the request. Kernel starts another request only after browser completion.
  ;; One file at a time, at most MAX_SIZE bytes; both sides enforce bounds
  ;; independently. Wasm owns destination, temporary file, atomic publication
  ;; and process-exit cleanup.
  (global (export "DOLLY_UPLOAD_CHUNK_CAPACITY") i32 (i32.const 1048576))
  (global (export "DOLLY_UPLOAD_MAX_SIZE") i32 (i32.const 1073741824))

  ;; Process operation: a dolly_process_path_request naming the destination,
  ;; which must not exist; no response.
  (global (export "DOLLY_UPLOAD_FILE") i32 (i32.const 57))
)
