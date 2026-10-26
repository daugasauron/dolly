# Rust, Cargo and Zig built inside Dolly: what they left open

- STATUS: OPEN
- PRIORITY: 90
- TAGS: toolchain,rust,zig,bootstrap,0.1.4

## State (2026-10-13)

One list of what the three toolchains built inside Dolly left open. Nothing on it blocks a user
or a build, and nobody is on it; lowered from 160 for that reason. Zig's list joined it on
2026-10-13 (`tasks/20261001-091000-zig-follow-ups`, closed into this task).

In v0.1.1: rustc is built inside Dolly in two generations whose standard libraries are checked
equal, Cargo is built by that rustc, and Patti is gone (`2370dc85`, `78572443`). The seed
compiler stays the documented stage 0. Zig is built inside Dolly since 2026-10-01 and emits
Ghostty as C. The tests of `rust` and of the `zig` and `cargo` packages passed on `main` on
2026-10-13 (`work/rust/build/integrate-evidence/final-demos.log`, `main-amy.log`).

Measured on 2026-10-13 in Chromium, in `default` after `amy install cargo`: **Cargo builds
incrementally.** `CARGO_INCREMENTAL=1 cargo build --offline` of a one-file crate takes 5.3 s,
and 2.3 s again after an edit, with one warning each time ("hard linking files in the
incremental compilation cache failed. copying files instead": the filesystem has no hard
links, `ln a b` answers "Not supported"). So `CARGO_INCREMENTAL=0` is no
longer needed for the locks it was set for; it stays the default until someone decides whether
the warning and the copies are worth the faster rebuild. SQLite's dot-file locking is compiled
into Cargo and needs a `cargo` build to try.

## From the self-built compiler (`tasks/20260930-231100-self-host-rust`, closed 2026-10-09)

- **Stage comparison on demand.** `Dollyfile-rust-build` keeps the second
  generation of rustc and fails unless the standard library that generation
  builds is the first's, byte for byte (since 2026-10-09). That a third
  rustc is the second was measured once, in a session built with debug
  assertions; nothing repeats it with the recipe's commands. A test like
  `demos/llvm/test/stage2-browser.mjs` needs LLVM in the image: the recipe
  drops `/opt/rust-llvm` once the second rustc is linked.
- **`pthread_attr_init`, `_setstacksize`, `_destroy` in the single-threaded
  libc.** Done on `core/process-exec` with the exec seed change: musl's three
  are in `libdolly-runtime.a` (`scripts/build.sh`), and both copies are gone
  (`demos/rust/pthread-attr.c` and its recipe rows, the host objects in
  `demos/rust/toolchain/link.sh`). Checked in `test/fixtures/process-lifecycle.c`;
  the Rust seed relink and the `rust` images of the reconciliation round are
  what prove the Rust side.
- **The seed's bytes depend on its build tree** (recorded in the closed
  task): a tree that imports another's images must take its seed too.
- **Cargo's environment is one for all build scripts.** Oniguruma's two C
  settings reach every C file of the Codex build
  (`demos/codex/config/cargo.toml`).

## From Cargo (`tasks/20260930-231102-cargo-native`, closed 2026-10-12)

- **`cargo run`** works (2026-10-24, `core/page-no-view`, seed `b871765b`, Cargo relinked on
  it): in `default` after `amy install cargo`, `cargo new hello && cd hello && cargo run
  --offline` prints `Hello, world!` and exits 0, in Chromium (5.3 s for both commands) and
  Firefox (7.4 s). The Rust README and `man cargo` say so, and `test/amy-browser.mjs` runs its
  crate with `cargo run` (2026-10-27).
- **`cargo test`** needs the `test` crate in the SDK, and tests on a panic-abort target need
  `-Zpanic-abort-tests`. Measured 2026-10-27 (`default`, `cargo new --lib`, `cargo test
  --offline`): `error[E0463]: can't find crate for 'test'`. The target's `panic` is `abort`;
  the sysroot holds `libpanic_unwind` beside `libpanic_abort`, and C++ has Wasm exceptions
  (`libunwind-ww-wasmexcept`), so unwinding Rust panics is the stable route to weigh against
  the unstable flag. Either rebuilds `rust-build` and what is built with it.
- **A git dependency over HTTPS** needs a relay and libgit2's curl transport, which Cargo
  registers only with a non-default `[http]` configuration. `cargo search`, `publish` and
  `login` need `CONNECTTIMEOUT`, `LOW_SPEED_*` and `PUT` in Dolly's libcurl.
- **The two stopgaps from before the kernel had file locks: done** (`69d7a5b7`, `cb97afaf`, on
  `main`). Cargo's SQLite keeps its default `fcntl` locks (no `unix-dotfile` VFS), and the
  `cargo` package builds incrementally; `rust-sdk` keeps `CARGO_INCREMENTAL=0` for image
  recipes only, for another reason: a build that runs once would only keep rustc's second copy
  of every object (no hard links), and codex-build ran out of filesystem space at codex-core
  with it on. Measured on the local round's images (`default` after `amy install cargo sqlite`):
  a build, an edit and an incremental rebuild, 3.1 s then 1.9 s in Chromium and 4.1 s then
  2.7 s in Firefox (`-j 1`), with rustc's one warning about copies and no SQLite or lock error;
  Cargo's `.global-cache` passes `pragma integrity_check` in the sqlite package's `sqlite3`,
  with no dot-file lock beside it.
- **`libc` for a user's project.** crates.io's copy has wasm32 layouts for this target, so a
  project needs `[patch.crates-io] libc = { path = "/opt/rust-sdk/src/libc" }`
  (`demos/rust/README.md`); a system-wide patch would harm every other project.
- **`--frozen`** failed half the runs with this Cargo and SpiderMonkey's lock (2026-10-07), before
  the kernel had file locks; mozbuild does not pass it to a standalone JS build, so the catalog
  does not meet it. Not reproduced since: in `default` (Chromium, 2026-10-27), a crate with
  `itoa` vendored by `vendor-crates` and its `Cargo.lock` built with `cargo build --frozen` six
  times from a clean `target`, six passed. SpiderMonkey's own lock was not tried again.
- The `cargo` image build needs 5 to 6 GB (`tasks/20261006-145958-builder-artifact-copies`).
- Not measured: that Cargo's parallel build of Codex equals a serial one byte for byte (from
  `tasks/20260930-231102-parallel-rust`, where Patti's ripgrep, fd and protox did).

## From Zig (`tasks/20261001-091000-zig-follow-ups`, closed into this task on 2026-10-13)

- **`src/ghostty/generated/` is committed output**: 5.4 MB; `uucode-tables.zig` alone is
  233,478 lines, 89% of the lines under `src/` when counted on 2026-10-05. Generate it with the
  upstream Zig generators inside Dolly and drop the checked-in copy: the largest deletion
  available in the core tree.
- **`libdisplay.so` is 1,644,503 bytes** in `default` (2026-10-13), 63% more than the 1,007,438
  an LLVM Zig compiled, because Ghostty is emitted as C. Not measured: where the size comes
  from, and whether `cc` flags recover it.
- **WAMR's target: done** (`69d7a5b7`, `f082a01b`, on `main`). `config/wamr-dolly.patch`
  (applied by `scripts/prepare-wamr.sh`) adds `__wasm__` as `BUILD_TARGET_WASM`, whose
  `wasm_runtime_invoke_native` raises "only raw natives can be called on a WebAssembly host";
  `invokeNative_general.c` leaves the build and the recipe names no CPU. zig-build built in
  382 s, and its 1,441 Zig files, `/usr/bin/zig` among them, are the bytes it built under
  `BUILD_TARGET_X86_64`; the zig-llvm demo passed in Chromium and Firefox in the local round.

Settled there on 2026-10-13: `test/amy-browser.mjs` runs Zig as a user would (a Zig function
called from C, and a program on the standard library, through `-ofmt=c` and `cc`); and what
the commands this Zig lacks print is measured and written in `man zig`.

## Done when

Each is fixed or has its own task.
