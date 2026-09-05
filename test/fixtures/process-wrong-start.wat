(module
  (import "env" "memory" (memory i64 1 131072 shared))
  (import "dolly_process_0" "call"
    (func (param i32 i64 i64 i64 i64) (result i64)))
  ;; Valid Wasm, but not Dolly's zero-argument entry point.
  (func (export "_start") (param i32))
)
