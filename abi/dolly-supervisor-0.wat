(module
  ;; Typed internal boundary used by the trusted runtime Worker to schedule
  ;; private process Workers. Filesystem and process semantics remain in the
  ;; kernel Wasm implementation behind these operations.

  ;; Terminal output. The browser supplies one text sink for output written
  ;; while no display driver is resident: boot, rebuilds and headless images.
  ;; The page shows it only as bounded plain text in the bootstrap log.
  (import "env" "dolly_bootstrap_write_bytes" (func (param i64 i64) (result i32)))
  ;; The supervisor's words about the executable it prepares. Before a display
  ;; driver is installed they reach the bootstrap sink. After it they go to
  ;; descriptor 2 of the process that waits for the executable where that is a
  ;; terminal, the display's or a pseudo-terminal's, and nowhere otherwise,
  ;; without host interpretation. Zero, or the negative error number of a
  ;; refused bootstrap write.
  (func (export "dolly_terminal_write_bytes") (param i64 i64) (result i32) i32.const 0)
  ;; Runs the kernel's constructors: once, after instantiation, before any
  ;; other export.
  (func (export "_initialize"))
  ;; The supervisor's mailbox holds DOLLY_PROCESS_PACKET_LIMIT bytes (process.h)
  ;; for its own packets: spawn_serialized, worker_failed and exec_refused.
  (func $mailbox_address (result i64) i64.const 0)
  (func $spawn_serialized (param i64) (result i32) i32.const 0)
  ;; A process Worker's own mailbox, as many bytes of kernel memory, which the
  ;; Worker fills with each request and reads each response from: PID, TID (zero
  ;; for a process without threads) and its address, named when the Worker
  ;; starts and withdrawn with zero when it ends. dispatch and
  ;; dolly_threads_dispatch find it by the thread.
  (func $worker_mailbox (param i32 i32 i64) (result i32) i32.const 0)
  (func $dispatch (param i32 i32 i64 i64) (result i64) i64.const 0)
  ;; Remaining wait from the last dispatch, or -1 for no finite timer.
  ;; This is a wakeup hint; retry dispatch to decide readiness in Wasm.
  (func $deferred_milliseconds (result f64) f64.const -1)
  ;; 1 when a pipe changed since the last call, so deferred calls may now
  ;; complete: retry them instead of waiting for the next service tick.
  (func $take_wakeup (result i32) i32.const 0)
  ;; The kernel opens the executable of a process to launch and shows its
  ;; bytes only when asked. image_version is the version of those bytes as
  ;; they are now, which every write of the file renews, or zero: a module
  ;; compiled from that version runs without them. image_size is their size,
  ;; or a negative errno; they lie in the file's own blocks of
  ;; DOLLY_FS_BLOCK_SIZE bytes, the last short, each at image_block's address
  ;; (zero past the end): the kernel makes no copy. image_consumed closes
  ;; the executable.
  (func $next_launch (result i32) i32.const 0)
  (func $image_version (param i32) (result i64) i64.const 0)
  (func $image_size (param i32) (result i64) i64.const 0)
  (func $image_block (param i32 i64) (result i64) i64.const 0)
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
  ;; PID and signal: 0 once it is pending or has ended the process, 1 when
  ;; the process ignores it and it is discarded, or a negated errno.
  (func $signal (param i32 i32) (result i32) i32.const 0)
  ;; Milliseconds until the spawn deadline, or -1 when none applies.
  (func $deadline_remaining (param i32) (result f64) f64.const -1)
  ;; Raise due SIGALRM timers: a PID whose default action must be delivered
  ;; like a kill, or zero. Handled alarms only become pending, ignored ones
  ;; nothing.
  (func $take_alarm (result i32) i32.const 0)
  ;; EXEC read a program for a running process, whose image the image exports
  ;; then name. Once the supervisor has compiled and admitted it, commit makes
  ;; the process start it: state starting, the old program's CLOEXEC
  ;; descriptors and module state gone; the result is the lowest pending signal
  ;; the new program must answer within the grace of a delivered one, or zero.
  ;; Refused, or interrupted by a signal, the staged program is dropped and the
  ;; old one answered; the mailbox holds a diagnostic line of the given size
  ;; for the process's descriptor 2, or nothing.
  (func $exec_commit (param i32) (result i32) i32.const 0)
  (func $exec_refused (param i32 i64) (result i32) i32.const 0)
  (func $collect (param i32) (result i32) i32.const 0)
  (func $parent (param i32) (result i32) i32.const 0)
  ;; The signal that ended an exited process; zero when it exited, runs or is
  ;; unknown.
  (func $exit_signal (param i32) (result i32) i32.const 0)
  ;; The terminal mailbox, display or not: six atomic little-endian u32 words
  ;; (src/dolly.c mirrors them). Wasm writes result_sequence (incremented and
  ;; notified after each shell result), result_status, foreground_pid and
  ;; foreground_interruptible (the terminal's interrupt character, termios VINTR,
  ;; while it has ISIG set, so that key interrupts the foreground rather than
  ;; reaching it as input; 0 when nothing interrupts). The page asks
  ;; for that interrupt by writing interrupt_target_pid, then incrementing
  ;; interrupt_sequence.
  (global (export "DOLLY_TERMINAL_WORD_RESULT_SEQUENCE") i32 (i32.const 0))
  (global (export "DOLLY_TERMINAL_WORD_RESULT_STATUS") i32 (i32.const 1))
  (global (export "DOLLY_TERMINAL_WORD_FOREGROUND_PID") i32 (i32.const 2))
  (global (export "DOLLY_TERMINAL_WORD_FOREGROUND_INTERRUPTIBLE") i32 (i32.const 3))
  (global (export "DOLLY_TERMINAL_WORD_INTERRUPT_SEQUENCE") i32 (i32.const 4))
  (global (export "DOLLY_TERMINAL_WORD_INTERRUPT_TARGET_PID") i32 (i32.const 5))
  ;; A file's bytes lie in blocks of this size (src/file-blocks.cpp kBlockSize).
  (global (export "DOLLY_FS_BLOCK_SIZE") i32 (i32.const 1048576))
  (func $terminal_mailbox_address (result i64) i64.const 0)
  ;; Consume the page's latest interrupt request: the targeted PID when it is
  ;; still the interruptible foreground owner, otherwise zero.
  (func $take_interrupt (result i32) i32.const 0)

  ;; Boot files, beside dolly_write_file (abi/dolly-image-0.wat): the Worker
  ;; reads a guest-writable file only through this bound. Path, buffer and
  ;; capacity; the file's size, or -EFBIG when it is larger than the capacity.
  (func (export "dolly_read_file") (param i64 i64 i64) (result i32) i32.const 0)
  (func (export "dolly_remove_file") (param i64) (result i32) i32.const 0)

  (export "dolly_process_mailbox_address" (func $mailbox_address))
  (export "dolly_process_spawn_serialized" (func $spawn_serialized))
  (export "dolly_process_worker_mailbox" (func $worker_mailbox))
  (export "dolly_process_dispatch" (func $dispatch))
  (export "dolly_process_deferred_milliseconds" (func $deferred_milliseconds))
  (export "dolly_process_take_wakeup" (func $take_wakeup))
  (export "dolly_process_next_launch" (func $next_launch))
  (export "dolly_process_image_version" (func $image_version))
  (export "dolly_process_image_size" (func $image_size))
  (export "dolly_process_image_block" (func $image_block))
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
  (export "dolly_process_exec_commit" (func $exec_commit))
  (export "dolly_process_exec_refused" (func $exec_refused))
  (export "dolly_process_collect" (func $collect))
  (export "dolly_process_parent" (func $parent))
  (export "dolly_process_exit_signal" (func $exit_signal))
  (export "dolly_terminal_mailbox_address" (func $terminal_mailbox_address))
  (export "dolly_process_take_interrupt" (func $take_interrupt))

  ;; A device leased per process (gpu@0, audio@0, microphone@0, nena@0): a
  ;; process calls the device's operation with a packet, a
  ;; dolly_device_header (runtime.h) and the operation's body; the
  ;; kernel binds scope 0 of an OPEN to a lease it owns, one outstanding call a
  ;; lease, and calls the device's import with the packet's span, copied or
  ;; refused before it returns. The import with a null span and a scope in its
  ;; size revokes exactly that lease (process exit and CLOSE). The page answers
  ;; in the device's reply slots, each 64 bytes of five atomic little-endian
  ;; u32 words (state, scope, sequence, errno, length) and padding, then the
  ;; device's reply bytes; it writes them and publishes state 1 last, and the
  ;; kernel reads them only for the lease and sequence it waits for.
)
