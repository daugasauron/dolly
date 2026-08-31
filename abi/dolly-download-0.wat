(module
  ;; Explicit file-export capability. A compromised userspace can request a
  ;; bounded byte range from its own shared memory, but it cannot name a host
  ;; path or access host storage. The browser implementation sanitizes the
  ;; suggested filename and initiates an ordinary user-visible download.
  (import "env" "memory" (memory i64 1024 131072 shared))
  (import "env" "dolly_download_dispatch"
    (func $dolly_download_dispatch (param i64 i64 i64 i64) (result i32)))
)
