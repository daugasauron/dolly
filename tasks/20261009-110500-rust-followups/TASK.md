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
  profile of the staged sources still says `panic = "abort"`, and the library's build alone
  overrides it. Building the library twice was not an option for `panic_abort`: Cargo refuses
  `panic` in a package profile, so a five-line wrapper adds `-C panic=abort` for that one crate,
  as Rust's own build does in its rustc shim.
- The new definition reaches the SDK only with a library built for it: rustc records a JSON
  target as its name and a hash of its contents (`wasm64-emscripten-probe-4841731155276814203`)
  and refuses another's crates. The first image build installed the spec before building the
  library, and std's build scripts, which run on the host, found only the seed's std ("couldn't
  find crate `std` with expected target triple"). The recipe builds the library for the spec
  in `/tmp/rustc/spec`, the host keeping the seed's until the new library and spec replace both.
- The images' own Rust programs keep building to abort (`rust_sources.cargo_config`), as rustc
  does: a first image build that let them unwind made Cargo 34.8% larger (31,401,103 to
  42,319,951 bytes) and ripgrep 17.5% (6,249,873), against about 1% now that only the library
  unwinds (below). Upstream's release profiles of Codex, fd and ripgrep unwind (only ripgrep's
  Debian profile aborts); with unwinding, Tokio in Codex would see a task's panic as a
  `JoinError` rather than the end of the program. That is one line in `cargo_config` and a
  rebuild of the Rust images, for the owner to weigh against the size.

### Verified in the images (2026-11-04, `f8e8533a1` and after)

- `rust-build` builds in 35 min (`hugebuild`); the standard library takes 56 s with libtest,
  and the second generation's 25 rlibs equal the first's byte for byte. Procedural macros built
  to unwind load into rustc as `dso@0` libraries (rustc's own 250 crates and the recipe's
  check); `cbindgen`, `fd`, `naga`, `protox` and `ripgrep` build on it.
- The Rust demo test (`rust-tools`) in Chromium, and its rustc and Cargo fixtures in Firefox:
  `cargo test` of a crate with a passing, a failing and a `#[should_panic]` test prints libtest's
  report and Cargo's `error: test failed, to rerun pass --bin unwinds`, status 101 (a first build
  4.1 s, a second 0.1 s in Chromium; the fixture takes 11 to 13 s in Firefox); a filter that
  keeps the passing test exits 0; `catch_unwind`, a thread's `join` and a panicking `main` see
  the panic and run its drops (status 101); `CARGO_PROFILE_DEV_PANIC=abort` links and aborts at
  the first panic (status 134).
- A library's `cargo test`: its tests pass, then `Doc-tests` fails with "could not execute
  process `rustdoc ...` (never executed)", status 101; `cargo test --lib --tests` exits 0.
- Sizes against the integration round's images: the SDK 334,337,294 to 341,547,381 bytes
  (+2.2%: libtest, getopts and std's landing pads; rustc +0.4%), Cargo +0.86%, ripgrep +1.23%,
  fd +1.52%, protox +0.83%, cbindgen +3.19%, naga +0.75%.

### The cost, measured (2026-11-03)

ripgrep 15.1.0 with the images' profile, compiled natively three ways by the seed build's
rustc 1.98.1 and linked by Dolly's `cc` in `default`; `rg -c` over a 33 MB file of a million
lines, median of five runs (`build/stack-evidence/rg-ab.mjs`, not committed):

| ripgrep | bytes | Chromium: regex, `amet$`, `-i` | Firefox: the same |
| --- | --- | --- | --- |
| program and std abort (before) | 5,318,491 | 79, 114, 119 ms | 118, 204, 208 ms |
| program aborts, std unwinds (the images' programs now) | 5,384,227 (+1.2%) | 76, 113, 115 ms | 114, 207, 221 ms |
| program and std unwind (a user's crate, by default) | 6,255,232 (+17.6%) | 80, 113, 124 ms | 105, 211, 234 ms |

The landing pads cost size, not speed: the times differ less than run to run. The standard
library's rlibs (embedded bitcode, the SDK's flags) are 80,771,308 bytes aborting and
81,286,438 unwinding; the SDK adds libtest and getopts (25 rlibs, 88,271,418 bytes).

Without the wrapper, an aborting program fails to link: "the crate `panic_abort` does not have
the panic strategy `abort`"; with it, ripgrep built to abort links against the unwinding std.

### Found on the way: a C++ `catch` in a shared object does not catch

A C++ library loaded with `dlopen` that throws and catches an `int` itself runs the cleanup and
then fails the process with an uncaught `WebAssembly.Exception` (`default`, Chromium, 2026-11-03).
The library imports `GOT.mem.__wasm_lpad_context`, and the executable exports that thread-local
variable as its offset in the TLS block (88), not its address (`__tls_base + 88`): the landing
pad writes its index and LSDA to address 88 while libc++abi's personality reads the real
variable. Rust is not affected (its pads catch all and call no personality).

## Closed from this list (2026-11-03)

- `libc` for a user's project: crates.io's `libc` has wasm32 layouts for this target, and the
  SDK's patched copy is what a project builds against; `vendor-crates`, the one way a session
  gets crates.io crates, writes that `[patch]`, and the README says so. Nothing in Dolly is left
  to do: the layouts are crates.io's.

## Still open

- **Doc tests**: a library's `cargo test` runs `rustdoc --test` after its unit tests pass, and
  rustdoc is not built. What it takes, read and tried natively (2026-11-03): librustdoc names the
  compiler's crates with `extern crate` (rustc_private), so it builds against the compiler's own
  rlibs on its search path (`-L /tmp/rustc/target/debug/deps` after a generation), not as a Cargo
  dependency; checked that way against the seed build's rlibs, it compiles for this target except
  for `extern crate test`, which the SDK now has. Its workspace member adds 47 crates to the
  seed's lock and changes none (`askama`, `minifier`, `stringdex`, `threadpool`...). It runs each
  doc test by spawning the sysroot's `rustc` and then the test program, which Dolly does. Linked
  statically it carries another rustc_driver and LLVM (the 251 MB `rustc` is mostly that); natively
  the two share `librustc_driver.so`. Not built tonight: its size is the owner's question
  (a `rustdoc` package, or one executable for both), and it needs one more `rust-build` round.
- **Network Cargo**: `cargo search`, `publish` and `login` need `CONNECTTIMEOUT`, `LOW_SPEED_*`
  and `PUT` in Dolly's libcurl. `vendor-crates` covers crates.io. A Git dependency now works
  (2026-11-03, Chromium and Firefox, `demos/rust/test/fixtures/cargo.mjs`): the cargo package
  sets Cargo's `net.git-fetch-with-cli` (`CARGO_NET_GIT_FETCH_WITH_CLI=true`), so `git` fetches
  it through the broker; Cargo's own libgit2 opened a socket ("failed to connect to 127.0.0.1:
  Function not implemented"). A host without CORS on its Git endpoints needs a relay, as for
  `git clone`.
- **Not measured**: that a third rustc equals the second with the recipe's commands (needs LLVM
  in the image; `Dollyfile-rust-build` drops it), and that Cargo's parallel Codex build equals a
  serial one byte for byte.
- **`libdisplay.so` is 1,863,775 bytes** (`default`, 2026-11-03; 1,644,503 on 2026-10-13,
  before kitty graphics and Wuffs), against an LLVM Zig's 1,007,438 then, since Ghostty is
  emitted as C. Measured by its sections and name section (`build/stack-evidence/wasm-sizes.mjs`):
  code 1,486,839 bytes in 1,572 functions, data 301,636, names 60,198. The largest function is
  `__wasm_apply_data_relocs` (57,551: a shared object relocates each pointer in its data in
  code). By Ghostty's modules: the stream parser 146 KB, session snapshots 128 KB, the page
  list 113 KB, kitty graphics 97 KB with Wuffs 49 KB, PNG 20 KB and inflate 15 KB (about the
  219 KB that came with them), `Io.Writer` 71 KB, the formatter 68 KB, stb_truetype 21 KB. The
  uucode modules compiled at `-ODebug` contribute no function of their own (inlined; their
  tables are data). Left: the emitted C is compiled `-O2` where an LLVM Zig's ReleaseSmall
  optimizes for size; `-Oz` is a ghostty-build change that rebuilds every image, not measured.
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
- The panic strategy was settled by reading Cargo and rustc, not by trying flags: Cargo never
  passes `-C panic=unwind`, so the target's own strategy decides what `cargo test` builds, and
  only the target spec could make stable `cargo test` work.
- The seed build's native rustc, the same 1.98.1, cross-compiles for Dolly's target in seconds;
  recording a link's inputs and replaying them with Dolly's `cc` in a page tested the runtime
  half of a change (libtest's report, status 101) and measured its size three ways before a
  two-hour image chain. The compile-time half it does not test: the host is x86 there, so the
  spec-hash failure of the first image build (host and target are one in Dolly) showed only in
  Dolly.
- An experiment meant to de-risk Rust (C++ exceptions across `dlopen`) found a `dso@0` bug Rust
  does not hit; reading the Rust objects' undefined symbols first would have said which parts
  of the C++ machinery Rust uses at all.
- Changing anything in `demos/rust/toolchain/` or `config/` re-keys the rustc archive, whose
  staging reads the seed's prepared tree (`build/rustc-port/{rust,llvm-source,toolchain/lib}`):
  a tree with only the seed's tarball cannot stage it, and copying those 1.6 GB from a tree that
  built the seed was the way.
