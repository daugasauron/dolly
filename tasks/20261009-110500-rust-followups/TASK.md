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
  Firefox (7.4 s). The Rust README says so; `man cargo` (`Dollyfile-cargo`) still says it
  fails, left for the next change to that recipe, which rebuilds every image using `cargo`.
  `test/amy-browser.mjs` still builds its own crate and runs the binary, not `cargo run`.
- **`cargo test`** needs the `test` crate in the SDK, and tests on a panic-abort target need
  `-Zpanic-abort-tests`.
- **A git dependency over HTTPS** needs a relay and libgit2's curl transport, which Cargo
  registers only with a non-default `[http]` configuration. `cargo search`, `publish` and
  `login` need `CONNECTTIMEOUT`, `LOW_SPEED_*` and `PUT` in Dolly's libcurl.
- **Two stopgaps from before the kernel had file locks** are still in place, though it has had
  `flock` and `fcntl` byte ranges since `85a01262` (2026-10-06): SQLite's dot-file locking
  (`demos/rust/config/cargo.toml`, whose comment still says Dolly has no such locks; not tried
  without, it needs a `cargo` build) and `CARGO_INCREMENTAL=0` (`Dollyfile-rust-sdk`,
  `Dollyfile-cargo`; tried without on 2026-10-13, see "State": it works, with a warning about
  hard links).
  Not started (2026-10-24, the wrap-up for a checkpoint): the SQLite one, a three-line deletion
  in `demos/rust/config/cargo.toml`, needs Cargo rebuilt in `rust-build` (hugebuild); the
  `CARGO_INCREMENTAL` exports rebuild `rust-build` (`rust-sdk`'s) or every image using `cargo`.
- **`libc` for a user's project.** crates.io's copy has wasm32 layouts for this target, so a
  project needs `[patch.crates-io] libc = { path = "/opt/rust-sdk/src/libc" }`
  (`demos/rust/README.md`); a system-wide patch would harm every other project.
- **`--frozen`** failed half the runs with this Cargo and SpiderMonkey's lock (2026-10-07). Not
  explained; mozbuild does not pass it to a standalone JS build, so the catalog does not meet it.
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
- **WAMR is compiled with `-DBUILD_TARGET_X86_64`** (`Dollyfile-zig-build`). The guest never
  observes it and the recipe says so at the line; an honest form needs a WAMR source change or
  an upstream generic target (the closed task's "WAMR target").
  Checked 2026-10-24: upstream offers none. The pinned `68b8ed38` and `main` (`core/config.h`,
  last changed 2026-10-22) accept only the sixteen CPU targets and `#error "Build target isn't
  set"` otherwise; `build-scripts/config_common.cmake` fails the same way. The target also
  decides which `wasm_runtime_invoke_native` exists (`wasm_runtime_common.c`: one per ABI family,
  none for an unknown one), which the fast interpreter links for every non-raw native; zig1 binds
  only raw natives (`src/zig/zig1.c`), and no native-ABI call can be right on Wasm, where an
  indirect call must match its type exactly. What an honest build takes: a patch to WAMR (or
  upstream) that admits a target with no native ABI, `__wasm__` in `config.h`, and gives it a
  `wasm_runtime_invoke_native` that fails with an exception ("only raw natives"), so
  `invokeNative_general.c` leaves the source list; about 15 lines. Not done: it is a source
  change to WAMR, which the coordinator decides.

Settled there on 2026-10-13: `test/amy-browser.mjs` runs Zig as a user would (a Zig function
called from C, and a program on the standard library, through `-ofmt=c` and `cc`); and what
the commands this Zig lacks print is measured and written in `man zig`.

## Done when

Each is fixed or has its own task.
