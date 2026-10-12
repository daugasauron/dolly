(module
  ;; Pseudo-terminals, called through dolly_process_0.call and served by the
  ;; kernel: a prototype (see pty.h). A pseudo-terminal is two descriptors of
  ;; the process contract. What its holder writes to the master is the slave's
  ;; input; what is written to the slave is read from the master. Each is
  ;; read, written, polled, duplicated, inherited and closed like a pipe; the
  ;; bytes stay in kernel memory and the module has no browser import.
  ;;
  ;; The slave is a terminal to the program that holds it. The terminal
  ;; request of the process contract (DOLLY_PROCESS_TERMINAL, process.h)
  ;; answers its isatty, mode, size and timed read as for the display's
  ;; terminal, so a program runs on one unchanged and links no client. As
  ;; there, input is not edited or echoed, OPOST with ONLCR writes LF as CRLF,
  ;; and while ISIG is set byte 3 written to the master is not input but
  ;; SIGINT for the processes that hold the slave. The one the others descend
  ;; from is spared while it has them: a shell, while its command runs.
  ;;
  ;; A process whose descriptor 0, 1 or 2 is a slave opens that slave as
  ;; /dev/tty; any other process opens the display's terminal there.
  ;;
  ;; A read of the master returns zero once every descriptor of the slave is
  ;; closed and its output is read; a write then fails EIO. Closing the last
  ;; descriptor of the master is SIGHUP to the processes holding the slave,
  ;; end of file to their reads and EIO to their writes. The supervisor
  ;; delivers a pseudo-terminal's signals as it delivers a kill
  ;; (dolly-pty-supervisor-0.wat): a program that does not answer SIGINT or
  ;; SIGHUP within the grace is ended.
  ;;
  ;; Every request is a dolly_pty_request (pty.h).
  ;; OPEN: flags CLOEXEC|NONBLOCK (both descriptors close on spawn; the master
  ;;   does not wait), rows and columns -> dolly_pty_descriptors: the master,
  ;;   the slave and the pseudo-terminal's number, which names it /dev/pts/N
  ;;   for display only. ENFILE when the kernel holds PTY_LIMIT of them.
  ;; RESIZE: the master's descriptor, rows and columns (1 to 65535) -> empty.
  ;;   SIGWINCH to the processes that hold the slave. ENOTTY when the
  ;;   descriptor is not a master.
  (global (export "DOLLY_PTY_OPEN") i32 (i32.const 176))
  (global (export "DOLLY_PTY_RESIZE") i32 (i32.const 177))
  (global (export "DOLLY_PTY_CLOEXEC") i32 (i32.const 1))
  (global (export "DOLLY_PTY_NONBLOCK") i32 (i32.const 2))
  (global (export "DOLLY_PTY_LIMIT") i32 (i32.const 32))
  ;; Unread bytes each direction holds.
  (global (export "DOLLY_PTY_INPUT_BYTES") i32 (i32.const 4096))
  (global (export "DOLLY_PTY_OUTPUT_BYTES") i32 (i32.const 65536))
)
