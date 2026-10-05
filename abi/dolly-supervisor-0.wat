(module
  ;; Typed internal boundary used by the trusted runtime Worker to schedule
  ;; private process Workers. Filesystem and process semantics remain in the
  ;; kernel Wasm implementation behind these operations.

  ;; Terminal output. The browser supplies one text sink for output written
  ;; while no display driver is resident: boot, rebuilds and headless images.
  ;; The page shows it only as bounded plain text in the bootstrap log.
  (import "env" "dolly_bootstrap_write_bytes" (func (param i64 i64)))
  ;; WasmFS's output devices pass bytes back into this export. Before a display
  ;; driver is installed they reach the bootstrap sink; after installation the
  ;; resident driver consumes them without host interpretation.
  (func (export "dolly_terminal_write_bytes") (param i64 i64))
  ;; The process mailbox holds DOLLY_PROCESS_PACKET_LIMIT bytes (process.h).
  (func $mailbox_address (result i64) i64.const 0)
  (func $spawn_serialized (param i64) (result i32) i32.const 0)
  (func $dispatch (param i32 i32 i64 i64) (result i64) i64.const 0)
  ;; Remaining wait from the last dispatch, or -1 for no finite timer.
  ;; This is a wakeup hint; retry dispatch to decide readiness in Wasm.
  (func $deferred_milliseconds (result f64) f64.const -1)
  ;; 1 when a pipe changed since the last call, so deferred calls may now
  ;; complete: retry them instead of waiting for the next service tick.
  (func $take_wakeup (result i32) i32.const 0)
  (func $next_launch (result i32) i32.const 0)
  (func $image_address (param i32) (result i64) i64.const 0)
  (func $image_size (param i32) (result i64) i64.const 0)
  (func $image_consumed (param i32) (result i32) i32.const 0)
  (func $worker_started (param i32) (result i32) i32.const 0)
  ;; A Worker returned, failed or was stopped: PID, status and termination
  ;; signal (zero for none). A process that already exited keeps its status.
  (func $worker_exited (param i32 i32 i32) (result i32) i32.const 0)
  ;; A Worker failed or its executable was refused. The mailbox holds one
  ;; diagnostic line of the given size: the kernel writes it to the process's
  ;; descriptor 2, so the program that asked is told, and records status 126.
  (func $worker_failed (param i32 i64) (result i32) i32.const 0)
  ;; 1 once the kernel recorded the process's exit, which an ancestor's EXIT
  ;; can do before the process launches, or when it is unknown; otherwise 0.
  (func $exited (param i32) (result i32) i32.const 0)
  ;; A child becomes waitable only after its Worker references are retired.
  (func $worker_retired (param i32) (result i32) i32.const 0)
  (func $spawn_flags (param i32) (result i32) i32.const 0)
  (func $signal (param i32 i32) (result i32) i32.const 0)
  ;; Milliseconds until the spawn deadline, or -1 when none applies.
  (func $deadline_remaining (param i32) (result f64) f64.const -1)
  ;; Raise due SIGALRM timers: a PID whose default action must be delivered
  ;; like a kill, or zero. Handled alarms only become pending.
  (func $take_alarm (result i32) i32.const 0)
  (func $collect (param i32) (result i32) i32.const 0)
  (func $parent (param i32) (result i32) i32.const 0)
  ;; The terminal mailbox, display or not: six atomic little-endian u32 words
  ;; (src/dolly.c mirrors them). Wasm writes result_sequence (incremented and
  ;; notified after each shell result), result_status, foreground_pid and
  ;; foreground_interruptible (1 while the terminal has ISIG set, so Ctrl-C
  ;; interrupts the foreground rather than reaching it as input). The page asks
  ;; for that interrupt by writing interrupt_target_pid, then incrementing
  ;; interrupt_sequence.
  (global (export "DOLLY_TERMINAL_WORD_RESULT_SEQUENCE") i32 (i32.const 0))
  (global (export "DOLLY_TERMINAL_WORD_RESULT_STATUS") i32 (i32.const 1))
  (global (export "DOLLY_TERMINAL_WORD_FOREGROUND_PID") i32 (i32.const 2))
  (global (export "DOLLY_TERMINAL_WORD_FOREGROUND_INTERRUPTIBLE") i32 (i32.const 3))
  (global (export "DOLLY_TERMINAL_WORD_INTERRUPT_SEQUENCE") i32 (i32.const 4))
  (global (export "DOLLY_TERMINAL_WORD_INTERRUPT_TARGET_PID") i32 (i32.const 5))
  (func $terminal_mailbox_address (result i64) i64.const 0)
  ;; Consume the page's latest interrupt request: the targeted PID when it is
  ;; still the interruptible foreground owner, otherwise zero.
  (func $take_interrupt (result i32) i32.const 0)

  (export "dolly_process_mailbox_address" (func $mailbox_address))
  (export "dolly_process_spawn_serialized" (func $spawn_serialized))
  (export "dolly_process_dispatch" (func $dispatch))
  (export "dolly_process_deferred_milliseconds" (func $deferred_milliseconds))
  (export "dolly_process_take_wakeup" (func $take_wakeup))
  (export "dolly_process_next_launch" (func $next_launch))
  (export "dolly_process_image_address" (func $image_address))
  (export "dolly_process_image_size" (func $image_size))
  (export "dolly_process_image_consumed" (func $image_consumed))
  (export "dolly_process_worker_started" (func $worker_started))
  (export "dolly_process_worker_exited" (func $worker_exited))
  (export "dolly_process_worker_failed" (func $worker_failed))
  (export "dolly_process_exited" (func $exited))
  (export "dolly_process_worker_retired" (func $worker_retired))
  (export "dolly_process_spawn_flags" (func $spawn_flags))
  (export "dolly_process_signal" (func $signal))
  (export "dolly_process_deadline_remaining" (func $deadline_remaining))
  (export "dolly_process_take_alarm" (func $take_alarm))
  (export "dolly_process_collect" (func $collect))
  (export "dolly_process_parent" (func $parent))
  (export "dolly_terminal_mailbox_address" (func $terminal_mailbox_address))
  (export "dolly_process_take_interrupt" (func $take_interrupt))
)
