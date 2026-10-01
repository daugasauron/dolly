(module
  ;; Explicit local-user input. No new callable host import: the kernel worker
  ;; reports each new request to the page, which offers a file picker. Only a
  ;; user's selection supplies bytes. No host path, filename, handle, URL or
  ;; filesystem operation crosses. A request right after the user cancelled
  ;; fails with ECANCELED without reopening the picker.
  (import "env" "memory" (memory i64 1024 131072 shared))
  (func (export "dolly_upload_mailbox_address") (result i64) i64.const 0)

  ;; Ten atomic little-endian u32 words (upload.h mirrors them; kernel.c
  ;; checks the offsets), then padding to the header size, then one chunk:
  ;; request sequence (kernel), cancelled sequence (kernel), completed
  ;; sequence (browser: no further writes for this request), chunk sequence
  ;; (browser), consumed sequence (kernel, notified), chunk length, positive
  ;; target errno (0 on success), EOF (0 or 1), provider enabled (browser: 1
  ;; while mounted, 0 otherwise; rebuild-only workers have no picker, so
  ;; UPLOAD_FILE returns ENOSYS there and never waits) and the file size
  ;; (browser, the same in every chunk of a transfer).
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
  (global (export "DOLLY_UPLOAD_HEADER_SIZE") i32 (i32.const 64))
  (global (export "DOLLY_UPLOAD_WORD_REQUEST") i32 (i32.const 0))
  (global (export "DOLLY_UPLOAD_WORD_CANCELLED") i32 (i32.const 1))
  (global (export "DOLLY_UPLOAD_WORD_COMPLETED") i32 (i32.const 2))
  (global (export "DOLLY_UPLOAD_WORD_CHUNK") i32 (i32.const 3))
  (global (export "DOLLY_UPLOAD_WORD_CONSUMED") i32 (i32.const 4))
  (global (export "DOLLY_UPLOAD_WORD_LENGTH") i32 (i32.const 5))
  (global (export "DOLLY_UPLOAD_WORD_ERROR") i32 (i32.const 6))
  (global (export "DOLLY_UPLOAD_WORD_EOF") i32 (i32.const 7))
  (global (export "DOLLY_UPLOAD_WORD_ENABLED") i32 (i32.const 8))
  (global (export "DOLLY_UPLOAD_WORD_SIZE") i32 (i32.const 9))
  (global (export "DOLLY_UPLOAD_CHUNK_CAPACITY") i32 (i32.const 1048576))
  (global (export "DOLLY_UPLOAD_MAX_SIZE") i32 (i32.const 1073741824))

  ;; Process operation: a dolly_process_path_request naming the destination,
  ;; which must not exist; no response.
  (global (export "DOLLY_UPLOAD_FILE") i32 (i32.const 57))
)
