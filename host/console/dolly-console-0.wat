(module
  ;; Terminals the host holds. A console is a pseudo-terminal (host/pty) whose
  ;; master end the host holds in place of a process: the host types into it,
  ;; reads what its programs show, sizes it and hangs it up, and starts a root
  ;; process on its slave. Its mode, its interrupt key and the signals of its
  ;; size and hang-up are a pseudo-terminal's, delivered as theirs are
  ;; (dolly-pty-supervisor-0.wat). The host calls these on its supervisor's
  ;; thread; none waits. Consoles are pseudo-terminals: ENFILE once there are
  ;; DOLLY_PTY_LIMIT of them. No process calls them, so this contract records no
  ;; executable's identity.

  ;; What write takes and read gives, in kernel memory, at this address.
  (global (export "DOLLY_CONSOLE_TRANSFER_BYTES") i32 (i32.const 65536))
  (func (export "dolly_console_transfer_address") (result i64)
    i64.const 0)
  ;; A console of `columns` by `rows`, both 1 to 65535: its id, or -EINVAL,
  ;; -ENFILE, -ENOMEM.
  (func (export "dolly_console_open") (param i32 i32) (result i32)
    i32.const 0)
  ;; Spawns the packet in the supervisor's mailbox as dolly_process_spawn_serialized
  ;; does, a root process whose descriptors 0, 1 and 2 are the console's slave:
  ;; the packet maps no descriptors (else -EINVAL). Its pid, or a negative errno.
  (func (export "dolly_console_spawn") (param i32 i64) (result i32)
    i32.const 0)
  ;; Input, the first `length` bytes of the transfer buffer, as if typed: the
  ;; bytes taken (at least one), -EAGAIN while the input is full, -EIO once no
  ;; process can read it, -EBADF for an id that names no console.
  (func (export "dolly_console_write") (param i32 i64) (result i64)
    i64.const 0)
  ;; Output into the transfer buffer, at most `capacity` bytes: their count,
  ;; -EAGAIN while there is none, zero once the slave is closed and all is read.
  (func (export "dolly_console_read") (param i32 i64) (result i64)
    i64.const 0)
  ;; A new size, as the master's resize: SIGWINCH for the programs on the slave.
  (func (export "dolly_console_resize") (param i32 i32 i32) (result i32)
    i32.const 0)
  ;; The host lets go: SIGHUP for the programs on the slave; the id is free.
  (func (export "dolly_console_close") (param i32) (result i32)
    i32.const 0)
)
