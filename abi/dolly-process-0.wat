(module
  ;; The build binds the SHA-256 of include/dolly/process.h into the emitted
  ;; contract as dolly.process.layout. The import type and the exact operation
  ;; numbers/packet layouts therefore form one executable ABI identity.
  ;; Canonical executable contract for a Dolly process. This module is a
  ;; schema and is never instantiated.
  ;;
  ;; Every process receives a distinct shared memory64 object. "shared" lets
  ;; the trusted cross-memory gate copy syscall packets while the process runs
  ;; in another Worker; no other guest process receives this memory object.
  ;; The executable declares its actual initial and maximum page counts in
  ;; this import and in the dolly.process.memory custom section. The contract
  ;; fixes the memory kind and global ceiling without forcing tiny commands
  ;; and large runtimes to reserve the same initial allocation.
  (import "env" "memory" (memory i64 1 131072 shared))

  ;; A packet contains no pointers: all embedded locations are byte offsets
  ;; within the request or response. The operation number and packet layouts
  ;; are defined by include/dolly/process.h. A non-negative result is the
  ;; response byte count; a negative result is -errno.
  (import "dolly_process_0" "call"
    (func $dolly_process_call
      (param i32 i64 i64 i64 i64)
      (result i64)))

  ;; A process starts once. Returning is equivalent to exit status zero;
  ;; ordinary Emscripten crt1 calls the EXIT operation with main's status.
  (func $_start)
  (export "_start" (func $_start))
)
