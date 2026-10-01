(module
  ;; A linked command or DSO may carry dolly.host custom sections. Each is a
  ;; concatenation of 72-byte little-endian records: 32 bytes for a NUL-padded
  ;; ASCII module name, u32 ABI revision (0..65535), u32 reserved (zero), then
  ;; the module's 32-byte ABI digest (DOLLY_<NAME>_ABI_DIGEST in <NAME>-abi.h).
  ;; Names match [a-z][a-z0-9-]{0,30}. At most 64 records across all sections;
  ;; duplicates are allowed only with the same revision and digest. The loader
  ;; rejects a digest that differs from the provider's, as it rejects a wrong
  ;; dolly.process stamp. A selected client archive member contributes one
  ;; record. Header inclusion alone contributes nothing. These records demand
  ;; compatibility, not authority.
  (global (export "DOLLY_HOST_RECORD_BYTES") i32 (i32.const 72))
  (global (export "DOLLY_HOST_NAME_BYTES") i32 (i32.const 32))
  (global (export "DOLLY_HOST_DIGEST_BYTES") i32 (i32.const 32))
  (global (export "DOLLY_HOST_MAX_RECORDS") i32 (i32.const 64))
)
