(module
  ;; Valid shared memory32, deliberately incompatible with Dolly memory64.
  (import "env" "memory" (memory 1 65536 shared))
  (import "dolly_process_0" "call"
    (func (param i32 i64 i64 i64 i64) (result i64)))
  (func (export "_start"))
)
