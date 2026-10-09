# Release v0.1.1

- STATUS: OPEN
- PRIORITY: 300
- TAGS: release

Owner (2026-10-09), after trying the merged `main` locally: "Publish this as
v0.1.1"; and on the Rust toolchain: "implement choice 1 for v0.1.1" (the
`rust` package carries the second generation of rustc; the seed stays the
documented stage 0).

## In it, since v0.1.0

- Rust built inside Dolly: `rust-llvm`, `rust-build` (two generations of
  rustc, the standard library checked identical from both, Cargo); the
  `rust` and `cargo` packages hold nothing of the seed
  (`tasks/20260930-231100-self-host-rust`).
- Patti is removed; ripgrep, fd, cbindgen, protox and Codex are built by
  Cargo from vendored crates (`tasks/20260930-231102-cargo-native`).
- The Wine demo: a desktop with a taskbar and Start menu, Notepad, WineMine,
  ReactOS Paint, and an x86-64 interpreter that runs TinyCC
  (`tasks/20261008-145108-wine-bringup`). `wine` is on the domain's list.
- Live verification asks for each file in its stored encoding.

Not in it: file modes and `umask`, the two terminal-input fixes, the sysroot
demo, the Qwen 4B packaging, alphabetical order on the page.

## Procedure

`tasks/20261007-131241-release-v010` ("Release checklist"), on
`work/rust` with `work/release-round.sh`; the archive of v0.1.0 is
`work/locks/published/v0.1.0`.

## Evidence

Recorded here as each step finishes.
