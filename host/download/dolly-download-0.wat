(module
  ;; Explicit file-export capability. A compromised userspace can stream
  ;; bounded byte ranges from its own shared memory, but it cannot name a host
  ;; path or access host storage. The browser implementation sanitizes the
  ;; suggested filename and offers an ordinary user-visible download.
  (import "env" "memory" (memory i64 1024 131072 shared))
  ;; (operation, span address, span byte length) -> 0 or -errno; one stream at
  ;; a time. OPEN's span is the UTF-8 basename; EBUSY while a stream is open or
  ;; 4 offers wait for a click. WRITE appends 1 to CHUNK_CAPACITY bytes, copied
  ;; out of Wasm memory before it returns; EFBIG past MAX_SIZE in total. CLOSE
  ;; offers the complete file and ABORT discards it; both take an empty span
  ;; and end the stream.
  (import "env" "dolly_download_dispatch"
    (func $dolly_download_dispatch (param i32 i64 i64) (result i32)))
  (global (export "DOLLY_DOWNLOAD_OPEN") i32 (i32.const 1))
  (global (export "DOLLY_DOWNLOAD_WRITE") i32 (i32.const 2))
  (global (export "DOLLY_DOWNLOAD_CLOSE") i32 (i32.const 3))
  (global (export "DOLLY_DOWNLOAD_ABORT") i32 (i32.const 4))
  (global (export "DOLLY_DOWNLOAD_CHUNK_CAPACITY") i32 (i32.const 1048576))
  (global (export "DOLLY_DOWNLOAD_MAX_SIZE") i32 (i32.const 1073741824))

  ;; Process operation: a dolly_process_path_request naming a regular file of
  ;; at most MAX_SIZE bytes; no response. The kernel streams one chunk per
  ;; scheduling turn and returns once the browser offers the file. Other
  ;; downloads wait; process exit aborts the stream.
  (global (export "DOLLY_DOWNLOAD_FILE") i32 (i32.const 51))
)
