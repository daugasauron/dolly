(module
  (import "env" "memory" (memory i64 1 131072 shared))
  (import "dolly_process_0" "call"
    (func $call (param i32 i64 i64 i64 i64) (result i64)))
  (func (export "_start")
    ;; Missing optional facilities return target ENOSYS, not startup failure.
    (drop (call $call (i32.const 114) (i64.const 64) (i64.const 8) (i64.const 128) (i64.const 256)))
    (i64.store (i64.const 400)
      (call $call (i32.const 120) (i64.const 64) (i64.const 32) (i64.const 0) (i64.const 0))))
)
