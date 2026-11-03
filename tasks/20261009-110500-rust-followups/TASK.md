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
- `src/ghostty/generated/`'s Unicode tables (233,650 of its 239,297 lines, 5.6 MB): generated in
  `ghostty-build` since 2026-11-01. uucode's generator reads its UCD files (now in `uucode.tar`)
  and Ghostty's two print their tables over its output, each a program of the image's Zig
  (`-ofmt=c`, `cc`); their root gives them libc's allocator, since Zig's page allocator on
  WebAssembly grows the memory behind libc's `sbrk`. The three tables, Ghostty VT's C and
  `libdisplay.so` (sha256 `64f8bc2b…`) are byte for byte those of the committed tables; the image
  build takes 110 s instead of 77.

## `cargo test`: the target unwinds (2026-11-03 night)

`cargo test` failed with `error[E0463]: can't find crate for 'test'` (2026-10-27): the SDK had
no libtest, and the target's panics aborted.

Decision: panics unwind (`"panic-strategy": "unwind"` in the target spec), the standard library
is built to unwind with libtest beside it, and its `panic_abort` is built to abort, so a program
of either strategy links it. Reasons, each read in the sources or measured:

- On a target whose panics abort, stable Cargo cannot run tests. Cargo passes `-C panic` only
  for a strategy other than unwind and builds tests "always unwind" (`PanicSetting::AlwaysUnwind`
  in Cargo's `profiles.rs`), so rustc builds them with the target's abort and asks for the
  unstable `-Zpanic-abort-tests`. With that flag libtest runs each test as a child of
  `current_exe`: a fresh process per test, and every `cargo test` needs a `-Z` flag or an
  `[unstable]` table.
- Upstream's own Emscripten target unwinds (`wasm32_unknown_emscripten.rs`: `panic_strategy:
  Unwind`), with Wasm exceptions (`wants_wasm_eh` is `is_like_wasm`), and libtest runs tests in
  the test process there, one after another, on no thread of their own.
- Dolly has everything unwinding needs. The objects of an unwinding std and libtest reference
  only `_Unwind_RaiseException`, `_Unwind_DeleteException` and the `__cpp_exception` tag, which
  `cc` links from libunwind into every program; `catch_unwind` catches all, so there is no
  personality call and no `__wasm_lpad_context`, and libc++abi is not needed. The spec asks for
  the exnref instructions (`-wasm-use-legacy-eh=false`, upstream's base Wasm choice), the
  encoding Dolly's C and C++ use: std's objects hold `try_table` and `throw_ref`, no legacy `try`.
  A procedural macro (a `dso@0` library) imports the tag and the two functions, which rustc
  exports as provider symbols. `stack@0` takes no part: it serves programs `stack-wrap`
  rewrote, and already throws an exception again across its stacks.
- Measured before the image build: the native rustc 1.98.1 of the seed's build compiled std
  (with `panic_unwind`) and libtest for the new spec, and a three-test crate (one passing, one
  failing, one `#[should_panic]`); Dolly's own `cc` in `default` linked the recorded inputs
  (1,292,783 bytes, 0.35 s Chromium, 0.67 s Firefox), and the program printed libtest's report
  (`test result: FAILED. 2 passed; 1 failed`) with status 101, and status 0 for a filter that
  selects the passing test, in Chromium and Firefox.
- rustc keeps aborting: its first generation links the seed's std, compiled to abort, and a
  crate built to unwind cannot link one that aborts (rustc's `RequiredPanicStrategy`); the
  recipe passes `panic="abort"` for the compiler. Building the library twice was not an option
  for `panic_abort`: Cargo refuses `panic` in a package profile, so a five-line wrapper adds
  `-C panic=abort` for that one crate, as Rust's own build does in its rustc shim.
- Every Rust project the images stage built with `panic = "abort"` (`rust_sources.cargo_config`)
  only because the SDK could do nothing else; the profile now leaves panics to the target, as
  upstream's projects do. Tokio and Codex then see a task's panic as a `JoinError`, and a
  procedural macro's panic as rustc's error rather than the end of the compiler (rustc warned
  that a macro built to abort may crash it).

### The cost, measured (2026-11-03)

ripgrep 15.1.0 with the images' profile, compiled natively three ways by the seed build's
rustc 1.98.1 and linked by Dolly's `cc` in `default`; `rg -c` over a 33 MB file of a million
lines, median of five runs (`build/stack-evidence/rg-ab.mjs`, not committed):

| ripgrep | bytes | Chromium: regex, `amet$`, `-i` | Firefox: the same |
| --- | --- | --- | --- |
| program and std abort (before) | 5,318,491 | 79, 114, 119 ms | 118, 204, 208 ms |
| program aborts, std unwinds (a crate's `panic = "abort"` now) | 5,384,227 (+1.2%) | 76, 113, 115 ms | 114, 207, 221 ms |
| program and std unwind (the images now) | 6,255,232 (+17.6%) | 80, 113, 124 ms | 105, 211, 234 ms |

The landing pads cost size, not speed: the times differ less than run to run. The standard
library's rlibs (embedded bitcode, the SDK's flags) are 80,771,308 bytes aborting and
81,286,438 unwinding; the SDK adds libtest and getopts (25 rlibs, 88,271,418 bytes).
The images' programs could keep 1.2% by building to abort, but upstream's release profiles of
Codex, fd and ripgrep unwind (only ripgrep's Debian profile aborts), and so do they here.

Without the wrapper, an aborting program fails to link: "the crate `panic_abort` does not have
the panic strategy `abort`"; with it, ripgrep built to abort links against the unwinding std.

### Found on the way: a C++ `catch` in a shared object does not catch

A C++ library loaded with `dlopen` that throws and catches an `int` itself runs the cleanup and
then fails the process with an uncaught `WebAssembly.Exception` (`default`, Chromium, 2026-11-03).
The library imports `GOT.mem.__wasm_lpad_context`, and the executable exports that thread-local
variable as its offset in the TLS block (88), not its address (`__tls_base + 88`): the landing
pad writes its index and LSDA to address 88 while libc++abi's personality reads the real
variable. Rust is not affected (its pads catch all and call no personality).

## Still open

- **Network Cargo**: a git dependency over HTTPS needs libgit2's curl transport, which Cargo
  registers only with a non-default `[http]` setting; `cargo search`, `publish` and `login` need
  `CONNECTTIMEOUT`, `LOW_SPEED_*` and `PUT` in Dolly's libcurl. `vendor-crates` covers crates.io.
- **`libc` for a user's project**: crates.io's `libc` has wasm32 layouts for this target, so a
  project patches it to `/opt/rust-sdk/src/libc` (`vendor-crates` writes the patch).
- **Not measured**: that a third rustc equals the second with the recipe's commands (needs LLVM
  in the image; `Dollyfile-rust-build` drops it), and that Cargo's parallel Codex build equals a
  serial one byte for byte.
- **`libdisplay.so` is 1,862,935 bytes** (2026-11-01; 1,644,503 on 2026-10-13, before kitty
  graphics and Wuffs), against an LLVM Zig's 1,007,438 then, since Ghostty is emitted as C.
  Where the size comes from is not measured.
- **`wuffs-c.zig` and the two options modules stay committed** (`src/ghostty/generated/`,
  5,610 lines): translate-c is not built inside Dolly.

## Done when

Each is fixed or has its own task.

## Lessons

- A reason recorded beside committed output ("the generators need a host filesystem") goes
  stale as the platform grows: Zig ran inside Dolly for a month before anyone tried the
  generators, which then ran in under an hour of trying and gave identical bytes.
- A generated module's file name reaches the C Zig emits (its identifiers): generating the same
  tables under other names changed 16 MB of Ghostty VT's C, so compare outputs, not inputs.
