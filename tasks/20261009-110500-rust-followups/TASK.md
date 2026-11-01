# Rust, Cargo and Zig built inside Dolly: what they left open

- STATUS: OPEN
- PRIORITY: 90
- TAGS: toolchain,rust,zig,bootstrap

What the three toolchains built inside Dolly left open; nothing on it blocks a user or a build.
rustc is built inside Dolly in two generations whose standard libraries are checked equal,
Cargo by that rustc (v0.1.1, `2370dc85`); Zig since 2026-10-01, emitting Ghostty as C.
`cargo run` works in `default` after `amy install cargo` and is in `test/amy-browser.mjs`.

## Closed from this list (2026-11-01)

- `pthread_attr_init`, `_setstacksize`, `_destroy` in the single-threaded libc: on `main` since
  `ba5f2568` (musl's three in `libdolly-runtime.a`, `scripts/build.sh`; `demos/rust/pthread-attr.c`
  gone).
- `cargo run`, Cargo's two lock stopgaps and WAMR's target: done (`69d7a5b7`, `cb97afaf`,
  `f082a01b`, recorded in the closed tasks they came from).
- `--frozen` half the runs: not reproduced since the kernel has file locks (6 of 6 on
  2026-10-27), and mozbuild does not pass it to SpiderMonkey's build, the one that met it.
- The seed's bytes depend on its build tree: a property recorded in the closed
  self-host-rust task, a rule for whoever copies images between trees, not work.
- Cargo's one environment for every build script (Oniguruma's C settings reach every C file of
  the Codex build, `demos/codex/config/cargo.toml`): Cargo's `[env]` semantics, harmless there.
- The `cargo` image needing 5 to 6 GB: `tasks/20261006-145958-builder-artifact-copies`, closed.

## Still open

- **`cargo test`**: `error[E0463]: can't find crate for 'test'` (2026-10-27). The SDK needs the
  `test` crate, and a panic-abort target needs `-Zpanic-abort-tests`; unwinding panics
  (`libpanic_unwind` is in the sysroot, C++ has Wasm exceptions) is the stable route. Either
  rebuilds `rust-build` (four rustc at once: the integrator's `hugebuild`) and all built with it.
- **Network Cargo**: a git dependency over HTTPS needs libgit2's curl transport, which Cargo
  registers only with a non-default `[http]` setting; `cargo search`, `publish` and `login` need
  `CONNECTTIMEOUT`, `LOW_SPEED_*` and `PUT` in Dolly's libcurl. `vendor-crates` covers crates.io.
- **`libc` for a user's project**: crates.io's `libc` has wasm32 layouts for this target, so a
  project patches it to `/opt/rust-sdk/src/libc` (`vendor-crates` writes the patch).
- **Not measured**: that a third rustc equals the second with the recipe's commands (needs LLVM
  in the image; `Dollyfile-rust-build` drops it), and that Cargo's parallel Codex build equals a
  serial one byte for byte.
- **`src/ghostty/generated/` is committed output**: 5.7 MB, 239,297 lines (`uucode-tables.zig`
  233,478), the largest deletion available in the core tree. Its README says the generators need
  a host-style filesystem; since Zig runs inside Dolly (a standard-library program through
  `-ofmt=c` and `cc`, `test/amy-browser.mjs`), the uucode and Ghostty table generators could run
  in `ghostty-build` from pinned UCD files. Not tried: it changes the seed's display.
- **`libdisplay.so` is 1,644,503 bytes**, 63% more than an LLVM Zig's 1,007,438 (2026-10-13),
  since Ghostty is emitted as C. Where the size comes from is not measured.

## Done when

Each is fixed or has its own task.
