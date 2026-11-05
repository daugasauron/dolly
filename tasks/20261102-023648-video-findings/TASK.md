# What the recordings found: a Rust image that exits at once, the agent's retry

- STATUS: OPEN
- PRIORITY: 150
- TAGS: bug,rust,demo

## State (2026-11-05)

The fix is on `main`: f701e633 into `core/terminal-mode`, merged as be576525d; that task is
closed. The confirming round of 2026-11-05 (`integrate/2026-11-05` at 693b9842f, now `main`
943019e6d, image inputs `88959af6…`) was the catalog round for the seed change. It rebuilt every
image, the Rust ones included. In `work/integrate/build/round-1105b-evidence/`:
- `terminal` (with `vmin0`), `pty` and `core` passed in Chromium and Firefox (`browser.log`).
- The rust demo passed on the rebuilt `rust-tools` in Chromium (`demos.log`).
- The javascript demo, with Janis's pump check in `janis-process.mjs`, passed in Chromium.
- classicube's injected provider timeout, with automatic retry, exhausted retries and Retry task
  with a fresh Pi process, passed in Chromium.

Left:
- The garden driver's `run` and `thread` variants on the rebuilt Rust images. The driver and its
  recipes are in `work/evidence-2026-11-02/audit-host/video-findings-evidence/`
  (`garden-browser.mjs`, `Dollyfile-garden-*`).
- Finding 2's cause: Pi's RPC latency around a failed request, measured as section 2 says. The
  classicube run above passed, but it recorded no latency.

Two findings from the recordings of 2026-11-01 (Claude Opus 5.5 working in
Dolly), each a claim until reproduced. Evidence in
`build/video-findings-evidence/` of `work/audit-host` (branch
`fix/video-findings`, from `integrate/html`).

## 1. A Rust terminal program built in Studio "exited at once" (take s8b)

Opus wrote `garden`, a Cargo crate drawing a fox and rabbit field with ANSI
escapes: raw keyboard input through termios (`/opt/rust-sdk/src/libc`), the
terminal's size, a signal handler that restores the terminal, keys read
without blocking, `--headless TICKS`. Its 30 checks passed under `cargo test`
(`harness = false`), the image built (`studio/s8b-garden/build-11.log`), and
the tab that opened it ended in `dollyStatus` "failed" or "exited" within
about 30 s (`rig/studio.mjs` line 95; which of the two is not recorded). The
source is lost. Opus's summary: "On this session's real terminal it started,
set and restored the terminal's keyboard mode, and exited cleanly when
stopped (status 0). Without a terminal it drew frames for a few seconds."

Pi's bash tool spawns `slop -c COMMAND` with stdin ignored
(`demos/pi/dolly-tools.js`): nothing Opus ran in the session had a terminal.
The opened image is the first place the program met one, so the step that
differs is termios on a real tty.

### Reproduction

`build/video-findings-evidence/garden/`: a crate with a lib (the field),
a bin (termios raw mode, `TIOCGWINSZ`, the alternate screen and the kitty
keyboard mode, `sigaction` for SIGTERM, SIGINT and SIGHUP, keys by `poll`,
a thread, or termios `VMIN 0`, 24-bit colour frames, a trace of every step
to `/tmp/garden-trace.txt`) and `tests/rules.rs` with `harness = false`.
`garden-browser.mjs` builds it as Studio's recipe did (FROM system, INSTALL
rust and cargo, `cargo test`, `cargo build --release`, a headless run,
`EXPORTS TOOL`) on `/custom/rebuild/`, opens it and records how it ends;
its recipes are `Dollyfile-garden-*`. On the round's seed (`a58af3f9…`),
Chromium:

| Variant | Raw mode | ENTRY | Result |
| --- | --- | --- | --- |
| script | `cfmakeraw` (VMIN 1) | script: `garden`, then a shell | ready; draws at 6 ticks/s (`chromium-script-after-8s.png`); `q` leaves to the shell; trace complete |
| direct | `cfmakeraw` | `/bin/foreground -i /usr/bin/garden` | ready; draws; `q` ends the image ("exited with status 0") |
| kilo | by hand, `VMIN 0`, `VTIME 1` | script | `tcsetattr` fails with EINVAL; the program exits at once with status 2 (`garden5.log`) |
| nonblock | by hand, `VMIN 0`, `VTIME 0` | script | the same EINVAL |

Also learned on the way: `cargo test` needs `test = false` on the lib and
bin targets and `doctest = false` (no `test` crate, no `rustdoc`;
`garden1-testcrate.log`, `garden2-doctest.log`); the terminal is sized
(157x26) before ENTRY starts; signal handlers, `TIOCGWINSZ`, the alternate
screen, `poll` on stdin and a reader thread all work.

### Cause and fix

The terminal discipline refused every non-canonical `VMIN` but 1 and every
`VTIME` but 0 (`terminal_mode_from_attributes`, documented in
`docs/process-model.md`, decided in the kernel audit of 2026-11-01). A
program that reads keys without blocking the termios way, as kilo and many
C and Rust TUIs do (`VMIN 0`: a read returns at once or after `VTIME` tenths
of a second without a byte), could not enter raw mode at all, and only on a
real terminal. Commit `ab51b690`:

- `include/dolly/runtime.h`: `DOLLY_TERMINAL_VMIN_ZERO` (bit 7) and
  `DOLLY_TERMINAL_VTIME` (bits 16-23, tenths), `DOLLY_TERMINAL_MODE_BITS`
  for the two validators (`src/dolly.c`, `host/pty/kernel.c`). A seed
  input: every image rebuilds.
- `src/process-kernel.c`: a terminal read that finds no byte under `VMIN 0`
  ends with none, at once or at a deadline the process keeps
  (`read_deadline`, cleared when a read ends); the display's terminal and a
  pty slave alike (`socket_read` asks the stream whether it is a terminal
  and for its mode).
- `src/process/libc-adapter.c`: termios `VMIN`/`VTIME` translate both ways;
  `VMIN` above 1 is still refused with EINVAL. `VTIME` with `VMIN 1` is
  POSIX's inter-byte timer; reads return at the first byte as before, and
  the value round-trips.
- Tests that failed before: `test/fixtures/terminal-ui.c vmin0`
  (`test/terminal-browser.mjs`: VTIME 0 returns at once, VTIME 3 after
  250 ms to 2 s, a key typed within VTIME 100 ends the read) and the pty
  pair in `test/fixtures/pty.c` (`test/pty-browser.mjs`).

Whether Opus's garden set `VMIN 0` cannot be known; it is the one step of
what it did that fails only on a terminal, and the fix is right on its own.
Not covered: the recording's exact ENTRY and its opening through
`/custom/run/` (variant `run` of the driver) and the thread variant were
not rerun on the fixed seed, since every Rust image needs a catalog round.

### Not the cause

- The ENTRY shapes (a script that falls back to a shell, a direct program).
- The terminal's size at ENTRY start (157x26 in `/custom/rebuild/`).
- `std::thread::spawn`, `poll`, `sigaction`, the alternate screen, the kitty
  keyboard mode, 24-bit colour. (`chromium-script-after-8s.png` shows every
  cell in the accent colour: the display paints a selected cell so
  (`src/ghostty/display.c`), and something in the rebuild page's flow had
  selected the screen; a display or page finding, not pursued.)

## 2. The game agent's retry after a network error (bhop take b3)

`bhop-b3.log`: the request of 00:12:53 got no response; at 00:14:08 the
browser failed it with `net::ERR_NETWORK_CHANGED`; at 00:14:17 the rig
clicked the overlay's bottom-right button; `bhop/b3/t060.png` then shows
"[provider error] Browser could not fetch the URL…", "[interrupted]",
"[provider error] Pi clear_queue timed out", status "Agent error · Retry
task or open Settings", and no model or user line after it.

Read in `demos/game-agent/mission.mjs` and `viewer.cpp`:

- The button at that place is "Retry task" only while `scratch/retry` is
  "1", which `status()` writes when `failure && !busy`; `busy` turns false
  at Pi's `agent_settled`. Before that it is "Interrupt / Esc" and sends
  `interrupt`. The `retry` path (`closeAgent()`) sets `closing` before any
  timeout can fire, and `interrupt()`'s catch faults only when `!closing`:
  the fault in the log can only come from an `interrupt` command. So 9 s
  after the failure Pi had not settled, the click was an interrupt, and
  `clear_queue` had no answer in 3 s; the timeout killed Pi
  (`terminate`), and the fault left the state "Agent error" with "Retry
  task" showing.
- Why Pi did not answer in 3 s is not determined (no Pi stderr or event log
  was kept; the images of this tree are invalid until the catalog round, so
  no run today). Candidates, by reading: Pi in its automatic retry of the
  failed request (`auto_retry_start`; the first request hung 75 s before
  the browser failed it, a second may hang as long), while an RPC answer
  waits behind Pi's own event output: janis drains a child's stdout 16 KiB
  per pump (`pumpChildren`, `demos/javascript/janis.js`) through a 64 KiB
  kernel pipe, and Pi awaits `waitForRawStdoutBackpressure()` before
  answering (`rpc-mode.ts`); its events after a prompt carry the
  screenshot the mission attached.
- Measured (`build/video-findings-evidence/drain.mjs`, janis on the
  rebuilt `default`, Chromium): a janis parent drained a child's stdout at
  0.93 to 0.96 MiB/s, one 16 KiB chunk a pump; a line the child wrote after
  1 MB arrived after 1.0 s, after 4 MB after 4.1 s. Pi's events after a
  prompt carry the mission's screenshot (hundreds of KB of base64) and the
  assistant's text; three seconds of backlog is about 3 MB. Not measured:
  Pi's event sizes in the b3 session (nothing of them was kept).
- Fixed the measured part: janis's pump drains what a child has written,
  up to 1 MiB a stream, polling before each further chunk so a child that
  wrote exactly one chunk never blocks its parent
  (`demos/javascript/janis.js`, `pumpChildren`); the check in
  `demos/javascript/test/fixtures/janis-process.mjs` ("a line queued behind
  4 MB … within 2.5 s") failed before. A janis change: every image with
  janis rebuilds (Pi's chain).
- Still open: whether the b3 timeout was that backlog, Pi's retry, or
  something else; the mission's 3 s bound kills an agent whose only fault
  may be being busy and reports its own kill as a provider error. Measure
  Pi's RPC latency around a failed request in
  `demos/classicube/test/fixtures/classicube-agent-browser.mjs` (its
  injected provider timeout already exercises Retry task) before choosing
  between a longer bound and an interrupt that does not kill.

## Done when

- [x] Finding 1 reproduced, the cause fixed in the substrate with tests that
  failed before (`ab51b690`).
- [x] The fix measured on rebuilt `default` and `system` (seed `8dbcbf24…`,
  the closure of both, 23 images, 18 min) in Chromium and Firefox:
  `test/terminal-browser.mjs`, `test/pty-browser.mjs`, `test/core-browser.mjs`
  all passed (`build/video-findings-evidence/*-browser.log`, 12:17 JST).
- [x] Studio's skill says a program that reads keys or sets the terminal's
  mode is proven only in the opened image (`88f27845`).
- [x] A catalog round for the seed change (the confirming round of 2026-11-05,
  `work/integrate/build/round-1105b-evidence/`).
- [ ] The garden driver's `run` and `thread` variants on the rebuilt Rust images.
- [x] Janis's pump change measured: `demos/javascript/test/javascript-browser.mjs`
  passed in Chromium and Firefox on the rebuilt `typescript` (its
  `janis-process.mjs` check included; `build/video-findings-evidence/
  javascript-browser-*.log`, 12:24 JST).
- [ ] Finding 2's cause in the b3 take measured as above (Pi's RPC latency
  around a failed request).

## Lessons

- A program that ran only under Pi's bash tool has never met a terminal:
  the tool spawns `slop -c` with stdin ignored. "It worked in the session"
  says nothing about termios; a TUI is proven on the display's terminal or
  a pty, and the Studio skill should say so.
- Reusing a round's images in another tree takes the round's Rust seed
  bytes in `build/rustc-port` (each tree's seed differs) and its pins, not
  only linked snapshots and packs: the prepare step restages the tree's own
  seed and the plan then says "recipe changed" for every Rust image. Caught
  by `--plan`, after one unintended `rust-sdk` build had started.
- A browser reproduction on cached images costs a minute per variant; the
  driver's own mistakes (an async terminal read, reading a page whose image
  has ended, a grep that hid raw mode's staircase lines) cost more than the
  builds. Trace every step of the probe to a file and to stderr.
- Do the reproduction on the old seed before touching the seed: a runtime
  rebuild under a running browser test hangs it, and the seed change
  invalidates every image of the tree until rebuilt.
- The rig's log is wall-clock, the traffic log UTC: relate the clocks
  before ordering events (the failed request was in flight 75 s).
