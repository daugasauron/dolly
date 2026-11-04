(module
  ;; Trusted gate between one private process memory and the Dolly kernel
  ;; memory, and the program's one import. It contains no policy or syscall
  ;; semantics; bounds checks are provided by memory.copy and failures trap
  ;; before either memory is touched outside its declared range.
  (import "process" "memory" (memory $process i64 1 131072 shared))
  (import "kernel" "memory" (memory $kernel i64 1024 131072 shared))
  ;; The Worker's call (src/process-worker.mjs).
  (import "process" "call"
    (func $worker_call (param i32 i64 i64 i64 i64) (result i64)))

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

  ;; The program's dolly_process_0.call. The Worker answers a call that ended
  ;; its thread (an EXIT or THREAD_EXIT, or any call of a thread the supervisor
  ;; is ending) with -2^63, which no call returns, and the gate traps: a trap
  ;; leaves Wasm whatever the program catches, a JavaScript exception does not.
  (func $call (param $operation i32)
              (param $request i64) (param $request_size i64)
              (param $response i64) (param $response_capacity i64)
              (result i64)
    (local $result i64)
    (local.set $result
      (call $worker_call
        (local.get $operation)
        (local.get $request) (local.get $request_size)
        (local.get $response) (local.get $response_capacity)))
    (if (i64.eq (local.get $result) (i64.const 0x8000000000000000))
      (then (unreachable)))
    (local.get $result))

  (export "request" (func $request))
  (export "response" (func $response))
  (export "call" (func $call))
)
