# One descriptor record; the pipe a stream kind; the display's terminal a pseudo-terminal

- STATUS: OPEN
- PRIORITY: 300
- TAGS: kernel,architecture,terminal,audit

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, K1, K2).

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
