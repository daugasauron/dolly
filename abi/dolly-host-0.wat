(module
  ;; A linked command or DSO may carry dolly.host custom sections. Each is a
  ;; concatenation of 40-byte little-endian records: 32 bytes for a NUL-padded
  ;; ASCII module name, u32 ABI revision (0..65535), u32 reserved (zero). Names match
  ;; [a-z][a-z0-9-]{0,30}. At most 64 records across all sections; duplicates
  ;; with the same revision are allowed, conflicting revisions are rejected.
  ;; A selected client archive member contributes one record. Header inclusion
  ;; alone contributes nothing. These records demand compatibility, not authority.
  (global (export "DOLLY_HOST_RECORD_BYTES") i32 (i32.const 40))
  (global (export "DOLLY_HOST_NAME_BYTES") i32 (i32.const 32))
  (global (export "DOLLY_HOST_MAX_RECORDS") i32 (i32.const 64))
)
