(module
  ;; Optional profile of an executable that continues deep recursion on a
  ;; fresh browser stack (docs/browser-stack.md); stack-wrap produces it. Each
  ;; function of the program is entered through a wrapper that charges an
  ;; estimate of its frames against dolly_stack_room, in 8-byte slots, and
  ;; restores the room when it returns. A wrapper that finds too little room
  ;; stashes its call in the program's own globals and makes it through
  ;; CONTINUE instead.

  ;; The room left on the browser stack this thread runs on. The provider sets
  ;; it when a thread starts and around each fresh stack.
  (global (export "dolly_stack_room") (mut i32) (i32.const 0))
  ;; Makes the stashed call.
  (func (export "dolly_stack_continue"))

  ;; A process operation, called through dolly_process_0.call and served inside
  ;; the process Worker of an executable that records stack@0.
  ;; CONTINUE: empty -> empty. Calls dolly_stack_continue on a fresh browser
  ;; stack and returns 0 once it has returned, with the room as it was. An
  ;; exception it throws is thrown from this call; a trap in it is a trap of
  ;; the process.
  (global (export "DOLLY_STACK_CONTINUE") i32 (i32.const 116))
)
