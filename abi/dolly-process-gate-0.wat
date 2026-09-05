(module
  ;; Trusted byte-copy gate between one private process memory and the Dolly
  ;; kernel memory. It contains no policy or syscall semantics; bounds checks
  ;; are provided by memory.copy and failures trap before either memory is
  ;; touched outside its declared range.
  (import "process" "memory" (memory $process i64 1 131072 shared))
  (import "kernel" "memory" (memory $kernel i64 1024 131072 shared))

  (func $request (param $process_address i64)
                 (param $kernel_address i64)
                 (param $size i64)
    (memory.copy $kernel $process
      (local.get $kernel_address)
      (local.get $process_address)
      (local.get $size)))

  (func $response (param $kernel_address i64)
                  (param $process_address i64)
                  (param $size i64)
    (memory.copy $process $kernel
      (local.get $process_address)
      (local.get $kernel_address)
      (local.get $size)))

  (export "request" (func $request))
  (export "response" (func $response))
)
