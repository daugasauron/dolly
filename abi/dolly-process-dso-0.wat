(module
  ;; Optional process-local dynamic-link profile, not an executable or a
  ;; browser import surface. Actual library symbols are typed by their Wasm.
  (import "env" "memory" (memory i64 0 131072 shared))
  (import "env" "__indirect_function_table" (table $table i64 0 funcref))
  (import "env" "__stack_pointer" (global $stack (mut i64)))
  (import "env" "__memory_base" (global i64))
  (import "env" "__table_base" (global i64))
  ;; "symbol" stands for any relocation symbol name in these namespaces.
  (import "GOT.mem" "symbol" (global (mut i64)))
  (import "GOT.func" "symbol" (global (mut i64)))

  ;; The owning executable supplies these three exports when using DSOs.
  (export "__indirect_function_table" (table $table))
  (export "__stack_pointer" (global $stack))
  (func (export "__dolly_dso_allocate") (param i64 i64) (result i64) unreachable)

  ;; Optional library initialization hooks, called only after link checks.
  (func (export "__wasm_apply_data_relocs"))
  (func (export "__wasm_call_ctors"))
)
