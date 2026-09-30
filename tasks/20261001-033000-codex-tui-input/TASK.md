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

Done when: the Codex demo test passes in Chrome.
