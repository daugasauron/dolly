# Codex TUI exits: "terminal input stream closed during startup"

- STATUS: OPEN
- PRIORITY: 190
- TAGS: bug,codex,demo,terminal

`npm run test:demos -- codex` (2026-10-01, images rebuilt from the new seed):
the Codex 0.153.4 TUI draws its header, then exits with `› Error: terminal input
stream closed during startup` and the image falls back to the recovery shell
(`build/evidence/final-demos.log`). The message comes from
`codex-rs/tui/src/startup_draft.rs` when crossterm's event stream ends.

Leads:
- The test had not run since the harness port (`tests/demotests` skipped Codex:
  its image was stale), so there is no known-good baseline for these images.
- Pi (Janis), Neovim and Python read the same terminal and pass; the kernel's
  terminal read and poll semantics did not change on 2026-10-01.
- crossterm reads fd 0 when `isatty(0)`, otherwise `/dev/tty`, which the kernel
  does not map to the caller's terminal (only `/dev/stdin`, `/dev/stdout`,
  `/dev/stderr` are, since `26277ef`). Check which fd it uses and what `read` or
  `poll` returns there.

## Findings (2026-10-01, 05:30)

- Still fails on `takeover-20260930`: the image entry prints the error before
  the sign-in screen.
- Codex is not threaded (`threads@0` is not enabled for the codex image) and
  is spawned by `/usr/bin/codex` (`demos/codex/launch.c`) as a nested
  foreground child. A C probe that does the same (nested
  `dolly_spawn_foreground`, raw mode, pipes set `O_NONBLOCK`, SIGWINCH
  `SA_RESTART|SA_SIGINFO`, `poll` on fd 0 with 1 ms timeouts, `read`) gets
  `isatty(0) = 1` and reads a typed key in the default image.
- A temporary trace of failing process calls while Codex starts shows only
  expected results: `PATH_OPEN`/`PATH_STAT` `ENOENT`, `PATH_READLINK` `EINVAL`
  on non-links, `PATH_CREATE_DIRECTORY` `EEXIST`, `FD_READ` `EAGAIN`; no failing
  `poll` or terminal call. So the `None` is probably produced inside Codex:
  `TuiEventStream::poll_crossterm_event` also returns `None` when its
  `resume_stream` ends, and `demos/codex/config/tui-events.patch` replaces the
  crossterm `EventStream` on Emscripten. Next: log the `EventResult` error or
  the `resume_stream` end in that patch and rebuild `codex-build` (about 70 min).
  `TuiEventStream` also ends when its draw broadcast closes. Codex writes no
  `~/.codex/log/*.log`, even with `RUST_LOG=trace` and the directory present,
  and leaves `state_5.sqlite` empty.

Done when: the Codex demo test passes in Chrome.
