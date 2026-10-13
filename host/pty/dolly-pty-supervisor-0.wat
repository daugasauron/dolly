(module
  ;; What the supervisor asks of pty@0. A pseudo-terminal raises signals for
  ;; the programs on its slave: SIGINT for the interrupt key, SIGWINCH for a
  ;; resize, SIGHUP when the master closes (dolly-pty-0.wat). The supervisor
  ;; takes each and delivers it as it delivers a kill, so a program that does
  ;; not answer SIGINT or SIGHUP within the grace is ended, as at the
  ;; display's terminal.
  ;; take_signal: the PID the next raised signal is for, or zero when none
  ;; waits. taken_signal: the number of the signal last taken.
  (func (export "dolly_pty_take_signal") (result i32) i32.const 0)
  (func (export "dolly_pty_taken_signal") (result i32) i32.const 0)
)
