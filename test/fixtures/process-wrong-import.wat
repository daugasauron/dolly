(module
  (import "env" "memory" (memory i64 1 131072 shared))
  (import "dolly_process_0" "call"
    (func (param i32 i64 i64 i64 i64) (result i64)))
  ;; Valid Wasm, but it asks the host for a function outside the contract.
  (import "env" "fetch" (func (param i64 i64) (result i32)))
  (func (export "_start"))
)
