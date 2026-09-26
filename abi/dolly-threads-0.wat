(module
  ;; Optional static-process extension, called through dolly_process_0.call.
  ;; The build binds this source and threads.h into the contract digest.
  ;; SPAWN: u64 opaque argument -> {u32 tid, u32 zero}.
  ;; SELF: empty -> {u32 tid, u32 zero}.
  ;; EXIT: u64 opaque result -> no return; ends only this thread.
  ;; WAIT: {u32 tid, u32 flags} -> u64 result, then reaps the thread.
  ;; All packets are little-endian and exactly eight bytes unless empty.
  ;; WAIT requires confirmed retirement, rejects self/multiple waiters, and
  ;; returns EAGAIN for a live target with WAIT_NONBLOCK. Unknown flags fail.
  ;; No guest pointers are interpreted by the host. Stack/TLS startup is libc.
  (global (export "DOLLY_THREAD_SPAWN") i32 (i32.const 144))
  (global (export "DOLLY_THREAD_SELF") i32 (i32.const 145))
  (global (export "DOLLY_THREAD_EXIT") i32 (i32.const 146))
  (global (export "DOLLY_THREAD_WAIT") i32 (i32.const 147))
  (global (export "DOLLY_THREAD_WAIT_NONBLOCK") i32 (i32.const 1))
  (func (export "dolly_thread_start") (param i32 i64) (result i64) unreachable)
)
