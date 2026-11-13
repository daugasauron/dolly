# One descriptor record; the pipe a stream kind; the display's terminal a pseudo-terminal

- STATUS: OPEN
- PRIORITY: 300
- TAGS: kernel,architecture,terminal,audit,0.1.6

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, K1, K2).

## State (2026-11-13)

- 1 is on main: the pipe as a stream kind (`74e1d2bb6`) and one descriptor record per descriptor
  (`2320b1a06`, `dolly_kernel_descriptor` in `process->fds[]`). `process_dispatch` is the table of
  every operation, each one's packet a function (`fix/audit-0.1.6`, kernel-lifecycle-small).
- 2 and 3 are open: the display's terminal is still its own line discipline. Not in tonight's
  candidate, decided: 2 changes what Ctrl+C reaches (the display's rule, the interactive owner's
  commands in its place, else it and its descendants, against a pty's SIGINT to every holder of the
  slave), moves the display's input from a pull to a ring and its output through a second copy, and
  touches every interactive program; the task orders 3's latency measurement on a quiet machine
  before it, and today's machine runs a seed round and three agents. Both stay in 0.1.6, for the
  round after tonight's.

## State (2026-11-12)

On `fix/streams` (b7f90f722, from the events test branch): a pipe is a stream kind, two ends
(`dolly_kernel_socket`) over one ring, whose descriptor counts are its readers and writers; the
process table loses `pipes[]` and `pipe_directions[]`, and reads, writes, polls, flags and fstat
lose their pipe branches. A stream kind states its access (`FD_GET_FLAGS`). console@0's pipes are
kernel pipes whose host ends it holds (`dolly_kernel_pipe_open`, `dolly_kernel_socket_release`),
about 80 lines fewer in console. To test with the events branch in work/events, then land with it.
Left: the descriptor record (the remaining parallel arrays: file, stream, directory, description,
flags, terminal) and 2, the display's terminal as a pseudo-terminal, which removes the terminal
branches; 3's latency measurement before any of 2.
Measured for 3 (2026-11-12, release `0d27c879…` on 9045, `default`'s Slop prompt, Chrome headless,
a keydown dispatched to the terminal, `__dolly.frame()` polled each millisecond until the display's
frame changes; two image builds ran on the machine): median 25.8 ms, 8.6 to 39.4 ms over 20 keys
(scratchpad `echo/echo.mjs`). The baseline an ordinary-program emulator must meet; on a quiet
machine and with real X key events and ffmpeg's x11grab of a headed Chrome before deciding.

## Found

- A process has eight parallel 1,024-entry arrays (`descriptors[]`, `descriptions[]`,
  `descriptor_flags[]`, `pipes[]`, `pipe_directions[]`, `sockets[]`, `terminal_descriptors[]`,
  `directories[]`, `src/process-kernel.c:73-82`) and every descriptor operation branches on which is
  set. Pipes are built in; sockets, pty ends and console pipes implement `dolly_kernel_socket_kind`,
  each with its own ring (four byte queues).
- The display's terminal (`terminal_descriptors[]`, the line discipline in `src/dolly.c:147-212`)
  and the pseudo-terminal share `dolly_kernel_line_*` and nothing else.

## Do

1. One descriptor record `{ kind, object, flags }`; the pipe as a `dolly_kernel_socket_kind`;
   console's pipes become kernel pipes with one end held by the host.
2. The display's terminal becomes a pseudo-terminal the kernel opens at boot, its master read and
   written by the display and input modules; `terminal_descriptors[]` and its branches go.
3. Investigation only: the terminal emulator as an ordinary program (no kernel plugin), with an
   echo-latency measurement first (owner, 2026-10-16: "it needs to be snappy").

## Done when

1 and 2 are in, `process_dispatch` has no per-kind branches, the lifecycle, pty, console and
terminal suites pass in Chromium and Firefox, and 3 has its number.
