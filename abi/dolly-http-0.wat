(module
  ;; Browser-facing streaming HTTP schema. The browser may fetch, but response
  ;; bytes and synchronization pass through this fixed mailbox in shared Wasm
  ;; memory. No filesystem or command state is delegated to JavaScript.
  (import "env" "memory" (memory i64 1024 131072 shared))
  (import "env" "dolly_http_dispatch"
    (func $dolly_http_dispatch
      (param i64 i64 i64 i64 i64 i32 i32)))

  ;; A null method pointer is the command-boundary cancellation record. Its
  ;; final i32 is the new sequence fence; it carries no URL or request bytes
  ;; and therefore does not introduce a second browser capability.

  ;; Version 2 uses seven atomic little-endian u32 fields at the start of a
  ;; 64-byte header: state, sequence, HTTP status, byte length, EOF, error, and
  ;; chunk kind. Kinds 1, 2, and 3 are the effective URL, one complete response
  ;; header line, and response body data. A 64 KiB chunk follows. State 1 means
  ;; writable by the browser, state 2 readable by Wasm, and state 0 idle.
  (func (export "dolly_http_mailbox_address") (result i64)
    i64.const 0)
  (func (export "dolly_http_mailbox_version") (result i32)
    i32.const 2)
  (func (export "dolly_http_chunk_capacity") (result i32)
    i32.const 65536)
)
