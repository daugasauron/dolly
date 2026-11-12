.text
.globl dolly_thread_start
.globaltype __stack_pointer, i64
.functype __dolly_pthread_start (i32, i64) -> (i64)
dolly_thread_start:
  .functype dolly_thread_start (i32, i64) -> (i64)
  local.get 1
  i64.load 0
  global.set __stack_pointer
  local.get 0
  local.get 1
  call __dolly_pthread_start
  end_function
