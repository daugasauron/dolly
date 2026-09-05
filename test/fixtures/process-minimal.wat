(module
  (import "env" "memory" (memory i64 1 131072 shared))
  (import "dolly_process_0" "call"
    (func $call (param i32 i64 i64 i64 i64) (result i64)))
  ;; No libc, allocator, function table, stack global, or DSO namespace.
  (data (i64.const 80) "PROCESS-FREESTANDING-OK\n")
  (func (export "_start")
    (i32.store (i64.const 64) (i32.const 1))
    (i64.store (i64.const 72) (i64.const 24))
    (if (i64.ne
      (call $call (i32.const 17) (i64.const 64) (i64.const 40) (i64.const 128) (i64.const 8))
      (i64.const 8)) (then unreachable)))
)
