(module
  (import "env" "memory" (memory i64 1 131072 shared))
  ;; Valid Wasm, but the last syscall argument has the wrong width.
  (import "dolly_process_0" "call"
    (func (param i32 i64 i64 i64 i32) (result i64)))
  (func (export "_start"))
)
