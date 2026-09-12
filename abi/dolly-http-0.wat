(module
  ;; Browser-facing streaming HTTP schema. The browser may fetch, but response
  ;; bytes and synchronization pass through a fixed slot pool in shared Wasm
  ;; memory. No filesystem or command state is delegated to JavaScript.
  (import "env" "memory" (memory i64 1024 131072 shared))
  (import "env" "dolly_http_dispatch"
    (func $dolly_http_dispatch
      (param i64 i64 i64 i64 i64 i64 i64 i64 i32 i32) (result i32)))

  ;; Version 5 admission: pointer/byte-length pairs for method, URL, headers,
  ;; and body, followed by flags and request sequence. Returns 0 or -errno.
  ;; The browser validates ALL spans before decoding or copying: method <= 32,
  ;; URL <= 8192, headers <= 65536, body <= 8388608 bytes. Metadata is UTF-8,
  ;; excludes NUL, and need not be NUL-terminated. No unbounded string scans.
  ;; Admission copies the request before returning. A host-only acknowledgement
  ;; bounds queued admission descriptors to one; it is NOT guest memory.

  ;; The nonzero u32 handle selects slot (handle - 1) % 16 and its generation.
  ;; A slot's next handle advances by 16; never wrap and reuse a stale handle.
  ;; A null method cancels that EXACT handle; every other argument must be zero.
  ;; Admission/cancellation do not await response completion. A cancelled host
  ;; slot remains occupied until its provider settles; forged guest state cannot
  ;; allocate extra providers. EBUSY means this slot is still occupied.

  ;; Version 5 has 16 contiguous slots, each with seven atomic LE u32 fields in a
  ;; 64-byte header: state, sequence, HTTP status, byte length, EOF, error, and
  ;; chunk kind. Kinds 1, 2, and 3 are the effective URL, one complete response
  ;; header line, and response body data. A 64 KiB chunk follows. State 1 means
  ;; writable by the browser, state 2 readable by Wasm, and state 0 idle.
  ;; State 3 is terminal failure. The browser can set it without waiting for
  ;; consumption or overwriting chunk bytes. Wasm acknowledges state 2 using
  ;; compare-exchange, so a concurrent failure cannot be lost.
  ;; The error word is written BEFORE state 3: positive target errno, as
  ;; generated from the pinned sysroot (dist/dolly-errno.mjs). EACCES: policy,
  ;; EDQUOT: request quota, E2BIG: byte cap, ETIMEDOUT: deadline, ECANCELED:
  ;; cancellation, EIO: transport. EINVAL/EFAULT/EPROTONOSUPPORT describe invalid
  ;; requests. No URL, headers, credentials, or inferred CORS cause is returned.
  (func (export "dolly_http_mailbox_address") (result i64)
    i64.const 0)
  (func (export "dolly_http_mailbox_version") (result i32)
    i32.const 5)
  (func (export "dolly_http_slot_count") (result i32)
    i32.const 16)
  (func (export "dolly_http_chunk_capacity") (result i32)
    i32.const 65536)
)
