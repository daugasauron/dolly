(module
  ;; Optional process-local dynamic-link profile, not an executable or a
  ;; browser import surface. Actual library symbols are typed by their Wasm.
  (import "env" "memory" (memory i64 0 131072 shared))
  (import "env" "__indirect_function_table" (table $table i64 0 funcref))
  (import "env" "__stack_pointer" (global $stack (mut i64)))
  (import "env" "__memory_base" (global i64))
  (import "env" "__table_base" (global i64))
  ;; "symbol" stands for any relocation symbol name in these namespaces.
  ;; Immutable i64 side-module data exports are offsets from __memory_base;
  ;; GOT.mem and dlsym expose the corresponding absolute process address.
  (import "GOT.mem" "symbol" (global (mut i64)))
  (import "GOT.func" "symbol" (global (mut i64)))

  ;; The owning executable supplies these three exports when using DSOs.
  (export "__indirect_function_table" (table $table))
  (export "__stack_pointer" (global $stack))
  (func (export "__dolly_dso_allocate") (param i64 i64) (result i64) unreachable)

  ;; Optional library initialization hooks, called only after link checks.
  (func (export "__wasm_apply_data_relocs"))
  (func (export "__wasm_call_ctors"))

  ;; Process operations, called through dolly_process_0.call and served inside
  ;; the process Worker of an executable that records dso@0: they reach neither
  ;; the kernel nor the browser. Packets are in dso.h.
  ;; OPEN: dolly_dso_open_request, then the library's bytes (at most LIMIT; none
  ;; selects the executable itself) -> dolly_dso_response with a handle.
  ;; SYMBOL: dolly_dso_symbol_request, then the name -> its address or table index.
  ;; CLOSE: dolly_dso_close_request -> dolly_dso_response; code and static
  ;; storage stay until the process exits.
  (global (export "DOLLY_DSO_OPEN") i32 (i32.const 112))
  (global (export "DOLLY_DSO_SYMBOL") i32 (i32.const 113))
  (global (export "DOLLY_DSO_CLOSE") i32 (i32.const 114))
  (global (export "DOLLY_DSO_GLOBAL") i32 (i32.const 1))
  (global (export "DOLLY_DSO_LIMIT") i32 (i32.const 536870912))
  (global (export "DOLLY_DSO_ERROR_CAPACITY") i32 (i32.const 240))
  ;; Calls and callbacks whose signature is known only at run time, in libffi's
  ;; wasm64 layouts. The packets carry addresses and table indices of the
  ;; calling process; a wild one is EFAULT or EINVAL.
  ;; CALL: dolly_ffi_call_request -> empty. CLOSURE_ALLOC: u64 closure address
  ;; -> u64 table index that will call it. CLOSURE_FREE: u64 closure address
  ;; -> empty. CLOSURE_PREP: dolly_ffi_closure_prep_request -> empty.
  (global (export "DOLLY_FFI_CALL") i32 (i32.const 120))
  (global (export "DOLLY_FFI_CLOSURE_ALLOC") i32 (i32.const 121))
  (global (export "DOLLY_FFI_CLOSURE_FREE") i32 (i32.const 122))
  (global (export "DOLLY_FFI_CLOSURE_PREP") i32 (i32.const 123))
)
