# One descriptor record; the pipe a stream kind; the display's terminal a pseudo-terminal

- STATUS: OPEN
- PRIORITY: 300
- TAGS: kernel,architecture,terminal,audit,0.1.6

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, K1, K2).

## State (2026-11-13, `fix/terminal-pty`)

3, measured (release candidate's `default`, Slop prompt; the base runtime saved and served beside
this branch's, two pages or windows, keys alternating between them so the machine's load, 16 to 25
from a catalog round and an agent run, is common to both; `work/termpty/build/echo/`):

| Method | Before (base) | After (pseudo-terminal) |
| --- | --- | --- |
| keydown dispatched in headless Chrome, `__dolly.frame()` polled (the 2026-11-12 method), 100 keys | median 23.4 ms, mean 24.8, p10 13.4, p90 36.5 | median 22.5 ms, mean 24.4, p10 13.4, p90 38.2 |
| XTEST key press into headed Chrome on Xvfb :148, ffmpeg x11grab of the cursor's row at 500 frames a second, 100 keys | median 17.4 ms, mean 17.5, p10 9.0, p90 25.5 | median 15.8 ms, mean 16.9, p10 8.8, p90 26.0 |

The same runtime on both sides (A/A, 40 and 30 keys) differed by up to 3.6 ms in the median: the
change is within the noise. Screen echo is 5 to 43 ms, a 16 ms service tick and a 16.7 ms frame
apart. Scripts `ab.mjs` (headless), `x11.mjs` and `xkeys.c` (XTEST), logs `ab-*-100.log`,
`aa-*.log`.

2, done on the branch: the display's terminal is the boot terminal, a pseudo-terminal the kernel
opens with its first write and holds the master of (`src/dolly.c`). `terminal_descriptors[]`, the
display's line discipline and every terminal branch of reads, polls, opens, spawns and the terminal
request are gone; the terminal is a stream like any other. Decided:
- The pseudo-terminal moves into the core (`src/pty.c`, `src/pty-kernel.h`); `pty@0` keeps openpty
  (its OPEN, contract, client and headers) and `console@0` uses the core's. With both dropped from
  `host/manifests.mjs` the runtime builds (image inputs `63a92c02…`, as the drop test found);
  booting it needs that seed's images.
- A kernel holder of a master (`dolly_pty_holder`): told when the slave wrote (the display renders
  it then, or the bootstrap log takes it), asked for input when a reader of the slave finds none
  (input stays a pull: a push would wait for the 16 ms tick or need an input@0 export), and given
  the interrupt key typed at the master. Its slave's size request is `EPERM`, as the display's was.
- Ctrl+C reaches what it reached: the page's mailbox interrupt, the interactive owner's commands in
  its place, else it and its descendants. A `VINTR` byte that reaches the boot terminal under
  `ISIG` (a paste, a key the page did not take) is the same interrupt; it was input before.
  Other pseudo-terminals keep SIGINT to the slave's holders.
- The terminal mailbox and its contract are unchanged: the foreground words are published as
  before, from the boot terminal's mode (a mode set on any terminal republishes); a result is
  published from the boot terminal only. `dolly_terminal_write_bytes` is unchanged: before a
  display attaches its line reaches the bootstrap log, after it the process's descriptor 2 when
  that is a terminal.
- Without a display the boot terminal's output goes to the bootstrap log, now with `ONLCR`'s CRLF,
  which the page's log and the build log show as LF. Its size stays 0 by 0 there.
- What programs see: a root process's 0, 1 and 2 are one read-write open file (were the kernel's
  stdin and two write-only files); a resize is `SIGWINCH` for the processes that hold the boot
  terminal, delivered as a raised signal (a blocked call's handler runs at once), where it was
  marked pending for the foreground owner's tree; a pseudo-terminal under `ICANON` types and echoes
  its line when polled, as the display's did.
- Image inputs unchanged (`46de2b9c…`): kernel-only, no contract or seed change.

Tests (`work/termpty/build/logs/r1-SUITE-BROWSER.log`): terminal, pty, console, shell, shell-env,
display, display-cursor, slop, process (the lifecycle suite), core, ending, image-input and
threads pass in Chromium and Firefox; ended-worker, touch and pager fail in both before or apart
from the terminal, for images this catalog lacks (`composed`'s `pin`, `amy install less`). The
source tests pass but `platform-documents`: `Dollyfile-dolly-docs`'s pins are the round's to renew
(five were stale on `fix/audit-0.1.6`; this branch's four documents join them, and renewing them
repins 13 demo recipes).

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
