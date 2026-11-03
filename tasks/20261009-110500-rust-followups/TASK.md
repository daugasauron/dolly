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

### Verified in the images (2026-11-04)

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
- Sizes against the integration round's images: the SDK 334,337,294 to 359,282,590 bytes
  (+7.5%: libtest, getopts and std's landing pads 6.2 MB, rustdoc in rustc 17.7 MB; rustc
  266,902,572), Cargo +0.86%, ripgrep +1.23%, fd +1.52%, protox +0.83%, cbindgen +3.19%,
  naga +0.75%.
- Codex builds on the final chain (`hugebuild`, Cargo 36 min 20 s); its executable is
  199,534,503 bytes against the integration round's 199,077,281 (+0.23%). Not run: its demo
  test, nor the other 24 images built on `rust-sdk` (the next catalog round's).
- Doc tests (2026-11-04, the final images, Chromium and Firefox): a library's `cargo test` runs
  its doc tests; an edition 2024 failure reports as natively with status 101, and an edition
  2021 doc test that passes runs as a program of its own.

### Doc tests: rustc and rustdoc are one executable (2026-11-04)

A library's `cargo test` ran its tests and then failed at `Doc-tests`: "could not execute
process `rustdoc ...` (never executed)", status 101. Natively rustc and rustdoc are small
executables over one `librustc_driver.so` (upstream's x86 build: `rustdoc` 12.8 MB, the
library 150.8 MB); Dolly has no dynamic Rust libraries, and a second static executable would
carry another rustc_driver and LLVM (about 270 MB). So `rust-build` links one executable for
both: a five-line main (`dolly-rustc`, in the recipe) calls rustdoc when it runs as
`rustdoc-real`, a symlink to `rustc-real`, and rustc otherwise; `rustc.sh` runs
`${0##*/}-real`, so `/opt/rust-sdk/bin/rustdoc` is a symlink to the launcher.

- librustdoc names the compiler's crates itself (`extern crate`, rustc_private), so it builds
  against the libraries the second generation leaves in `/tmp/rustc/target/debug/deps`
  (`-L`), in a workspace of its own whose crates Cargo resolves offline from the vendored ones;
  rustdoc as a member of the compiler's workspace adds 44 crates to the seed's lock and changes
  none (`config/rustdoc.lock`, resolved natively once).
- Built to abort, the combined executable was 266,902,411 bytes against rustc's 249,167,527
  (+17,734,884, +7.1%), linked in 2 min 47 s after the compiler; the standard library it builds
  equals the first generation's, byte for byte.
- rustdoc builds its sessions with `..Options::default()`, whose `Sysroot::new(None)` asks for
  the default sysroot, which the static compiler has none of ("Failed finding sysroot: the
  static Dolly compiler requires --sysroot", status 134, though the launcher passed
  `--sysroot`). Upstream finds it from a symlinked `argv[0]`, but checks `lib/rustlib` against
  the working directory instead of the sysroot it derived (`filesearch.rs`), so that path never
  succeeds; `config/patches/rustc-sysroot.patch` joins the two, and `rust-build` applies it
  (with git's `patch`) until the seed's `rust.patch` carries it.
- rustdoc passes `--sysroot` to the rustc it runs for a doc test, and the launcher added its
  own ("Option 'sysroot' given more than once"); `rustc.sh` adds one only when none is given,
  as it does for `--target`.
- rustdoc reports a failed standalone doc test by `panic::resume_unwind` (`doctest.rs`), and
  the compiler, rustdoc with it, aborts: a failing doc test of a crate before edition 2024
  (each doc test a program of its own) ends rustdoc at that test, its report lost: Cargo
  prints the test's name and "doctest failed ... exited abnormally" and exits with rustdoc's
  status, 134 (Dolly reports an abort as that status, not a signal). Edition 2024 merges a
  crate's doc tests into one program, whose libtest reports them as natively (the assertion,
  `test result: FAILED`, status 101), and rustdoc exits with its status.
  Measured once the other way (2026-11-04): with the second generation built to unwind
  (`CARGO_PROFILE_DEV_PANIC=unwind`; it links the unwinding library), rustc was 287,637,721
  bytes (+20.7 MB) and compiled 1.5 to 3 times slower: cbindgen 1 min 15 s to 2 min 8 s, fd
  57 s to 1 min 53 s, naga 1 min 51 s to 3 min 29 s, protox 59 s to 2 min 56 s, ripgrep 50 s to
  1 min 19 s (three aborting builds agreed within 15%). Not measured: why; ripgrep built to
  unwind ran no slower. So the compiler aborts.

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

- A third rustc equals the second with the recipe's commands (2026-11-04): a scratch recipe on
  this branch's `rust-build`, with `rust-llvm`'s libraries and the same `cargo rustc` line, built
  rustc with the kept rustc in 9 min 29 s, and `cmp` found it equal to `/opt/rust-sdk/bin/rustc-real`
  (249,167,527 bytes), before rustdoc and the sysroot patch joined it. The recipe still checks
  the library, not the compiler, on every build.

- `libc` for a user's project: crates.io's `libc` has wasm32 layouts for this target, and the
  SDK's patched copy is what a project builds against; `vendor-crates`, the one way a session
  gets crates.io crates, writes that `[patch]`, and the README says so. Nothing in Dolly is left
  to do: the layouts are crates.io's.

## Still open

- **A failing doc test before edition 2024 ends rustdoc** (status 134, its report lost), since
  rustdoc reports one by unwinding and the compiler aborts. A compiler built to unwind fixes it
  and compiled 1.5 to 3 times slower (above); why landing pads slow rustc in the browsers while
  ripgrep's cost nothing is not measured (a profile of one crate's build in Chrome would say).

- **Network Cargo**: `cargo search`, `publish` and `login` need `CONNECTTIMEOUT`, `LOW_SPEED_*`
  and `PUT` in Dolly's libcurl. `vendor-crates` covers crates.io. A Git dependency now works
  (2026-11-03, Chromium and Firefox, `demos/rust/test/fixtures/cargo.mjs`): the cargo package
  sets Cargo's `net.git-fetch-with-cli` (`CARGO_NET_GIT_FETCH_WITH_CLI=true`), so `git` fetches
  it through the broker; Cargo's own libgit2 opened a socket ("failed to connect to 127.0.0.1:
  Function not implemented"). A host without CORS on its Git endpoints needs a relay, as for
  `git clone`.
- **Not measured**: that Cargo's parallel Codex build equals a serial one byte for byte.
- **`libdisplay.so` is 1,863,775 bytes** (`default`, 2026-11-03; 1,644,503 on 2026-10-13,
  before kitty graphics and Wuffs), against an LLVM Zig's 1,007,438 then, since Ghostty is
  emitted as C. Measured by its sections and name section (`build/stack-evidence/wasm-sizes.mjs`):
  code 1,486,839 bytes in 1,572 functions, data 301,636, names 60,198. The largest function is
  `__wasm_apply_data_relocs` (57,551: a shared object relocates each pointer in its data in
  code). By Ghostty's modules: the stream parser 146 KB, session snapshots 128 KB, the page
  list 113 KB, kitty graphics 97 KB with Wuffs 49 KB, PNG 20 KB and inflate 15 KB (about the
  219 KB that came with them), `Io.Writer` 71 KB, the formatter 68 KB, stb_truetype 21 KB. The
  uucode modules compiled at `-ODebug` contribute no function of their own (inlined; their
  tables are data). The emitted C is compiled `-O2` where an LLVM Zig's ReleaseSmall optimizes
  for size: a scratch ghostty-build at `-Oz` (its three `-O2`, 2026-11-04) made it 1,501,870
  bytes (−19.4%; code 1,107,496, −25.5%); rebuilt at `-O2`, it is byte for byte the shipped one.
  Not measured: the terminal's speed at `-Oz`, and how many copies of the display package a
  browser holds (each saves about 360 KB); the change rebuilds every image.
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
  passes `-C panic=unwind`, so the target's own strategy decides what `cargo test` builds.
- The seed build's native rustc 1.98.1 cross-compiles for Dolly's target in seconds; replaying
  a recorded link with Dolly's `cc` in a page tested the runtime half of a change and measured
  its size three ways before any image chain. It cannot test the compile-time half: there the
  host is x86, and both failures of the night's image builds (std's build scripts after the
  spec changed, rustdoc's default sysroot) exist only where host and target are one.
- Measure the program a change touches, not a proxy: ripgrep built to unwind ran no slower,
  but rustc built to unwind compiled 1.5 to 3 times slower; and upstream's native layout
  (`rustdoc` 12.8 MB over a 150.8 MB `librustc_driver.so`) predicted the cost of one executable
  for both, 17.7 MB, within 20%.
- rustdoc builds sessions with `..Options::default()`, which evaluates a default sysroot rustc
  never asks for, and upstream's argv[0] lookup of it had been broken all along (a relative
  path checked against the working directory), hidden natively by the library-path fallback.
- Changing anything in `demos/rust/toolchain/` or `config/` re-keys the rustc archive, whose
  staging reads the seed's prepared tree (`build/rustc-port`): a tree with only the seed's
  tarball cannot stage it.
