(module
  ;; The standard streams of a root process the host starts. A terminal
  ;; console is a pseudo-terminal (host/pty) whose master end the host holds in
  ;; place of a process: the host types into it, reads what its programs show,
  ;; sizes it and hangs it up. Its mode, its interrupt key and the signals of
  ;; its size and hang-up are a pseudo-terminal's, delivered as theirs are
  ;; (dolly_process_next_event, abi/dolly-supervisor-0.wat). A pipe console is three pipes of 64 KiB: the
  ;; host writes descriptor 0's and reads 1's and 2's, byte for byte. The host
  ;; calls these on its supervisor's thread; none waits. There are at most
  ;; DOLLY_PTY_LIMIT consoles (ENFILE), and a terminal one is a pseudo-terminal
  ;; too. No process calls them, so this contract records no executable's
  ;; identity.

  ;; What write takes and read gives, in kernel memory, at this address.
  (global (export "DOLLY_CONSOLE_TRANSFER_BYTES") i32 (i32.const 65536))
  (func (export "dolly_console_transfer_address") (result i64)
    i64.const 0)
  ;; A terminal console of `columns` by `rows`, both 1 to 65535: its id, or
  ;; -EINVAL, -ENFILE, -ENOMEM.
  (func (export "dolly_console_open") (param i32 i32) (result i32)
    i32.const 0)
  ;; A pipe console: its id, or -ENFILE, -ENOMEM.
  (func (export "dolly_console_open_pipes") (result i32)
    i32.const 0)
  ;; Spawns the packet in the supervisor's mailbox as dolly_process_spawn_serialized
  ;; does, a root process whose descriptors 0, 1 and 2 are the console's slave
  ;; or its pipes: the packet maps no descriptors (else -EINVAL). Its pid, or a
  ;; negative errno; a pipe console takes one (-EBUSY).
  (func (export "dolly_console_spawn") (param i32 i64) (result i32)
    i32.const 0)
  ;; Input, the first `length` bytes of the transfer buffer, as if typed: the
  ;; bytes taken (at least one), -EAGAIN while the input is full, -EIO (a
  ;; terminal) or -EPIPE (pipes) once no process can read it, -EINVAL after
  ;; end_input, -EBADF for an id that names no console.
  (func (export "dolly_console_write") (param i32 i64) (result i64)
    i64.const 0)
  ;; What the processes wrote to `descriptor`, 1 or 2 (else -EINVAL), into the
  ;; transfer buffer, at most `capacity` bytes: their count, -EAGAIN while there
  ;; is none, zero once they have closed it and all is read. Both descriptors
  ;; of a terminal are its one output.
  (func (export "dolly_console_read") (param i32 i32 i64) (result i64)
    i64.const 0)
  ;; The end of a pipe console's input: its reader gets end of file. A
  ;; terminal's input ends as typed, with its VEOF (-EINVAL).
  (func (export "dolly_console_end_input") (param i32) (result i32)
    i32.const 0)
  ;; Ctrl-C for a pipe console's program, which has no interrupt key: SIGINT
  ;; by the terminal's rules (an interactive program's commands in its place,
  ;; else it and its descendants), which the host carries out at its next
  ;; event (dolly_process_next_event). -ESRCH before a program started; a
  ;; terminal's interrupt key is typed (-EINVAL).
  (func (export "dolly_console_interrupt") (param i32) (result i32)
    i32.const 0)
  ;; A terminal's new size, as the master's resize: SIGWINCH for the programs on
  ;; the slave (a pipe console's: -EINVAL).
  (func (export "dolly_console_resize") (param i32 i32 i32) (result i32)
    i32.const 0)
  ;; The host lets go: SIGHUP for the programs on a terminal's slave, EPIPE for
  ;; their writes to pipes; the id is free.
  (func (export "dolly_console_close") (param i32) (result i32)
    i32.const 0)
)
