(module
  ;; Internal typed exports. Only trusted supervisor Worker contexts select
  ;; PID/TID. A thread's normal completion is reported after leaving Wasm.
  (func (export "dolly_threads_attach") (param i32) (result i32) i32.const 0)
  (func (export "dolly_threads_dispatch") (param i32 i32 i32 i64 i64) (result i64) i64.const 0)
  ;; Returns one when no live threads remain; zero otherwise.
  (func (export "dolly_threads_retired") (param i32 i32 i64) (result i32) i32.const 0)
  ;; Roll back a reserved child when no Worker could be created.
  (func (export "dolly_threads_unstarted") (param i32 i32) (result i32) i32.const 0)
)
