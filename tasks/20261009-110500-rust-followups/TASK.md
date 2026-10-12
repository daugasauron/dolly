# Rust and Cargo built inside Dolly: what they left open

- STATUS: OPEN
- PRIORITY: 160
- TAGS: toolchain,rust,bootstrap

## State (2026-10-12)

In v0.1.1: rustc is built inside Dolly in two generations whose standard libraries are checked
equal, Cargo is built by that rustc, and Patti is gone (`2370dc85`, `78572443`). The seed
compiler stays the documented stage 0. This task is the list both pieces of work left; nothing
on it has been done since. Lowered from 180 and merged with Cargo's list.

## From the self-built compiler (`tasks/20260930-231100-self-host-rust`, closed 2026-10-09)

- **Stage comparison on demand.** `Dollyfile-rust-build` keeps the second
  generation of rustc and fails unless the standard library that generation
  builds is the first's, byte for byte (since 2026-10-09). That a third
  rustc is the second was measured once, in a session built with debug
  assertions; nothing repeats it with the recipe's commands. A test like
  `demos/llvm/test/stage2-browser.mjs` needs LLVM in the image: the recipe
  drops `/opt/rust-llvm` once the second rustc is linked.
- **`pthread_attr_init`, `_setstacksize`, `_destroy` in the single-threaded
  libc.** Rust's std references them; the seed links musl's from host
  objects (`demos/rust/toolchain/link.sh`) and Dolly links a stand-in
  (`demos/rust/pthread-attr.c`). Adding musl's to the process libc changes
  the image inputs, so it goes with the next seed change; both copies then
  go.
- **The seed's bytes depend on its build tree** (recorded in the closed
  task): a tree that imports another's images must take its seed too.
- **Cargo's environment is one for all build scripts.** Oniguruma's two C
  settings reach every C file of the Codex build
  (`demos/codex/config/cargo.toml`).

## From Cargo (`tasks/20260930-231102-cargo-native`, closed 2026-10-12)

- **`cargo run`** builds and then fails: Cargo `exec`s the program, and Dolly has no `exec`
  (`tasks/20261006-214244-process-exec`).
- **`cargo test`** needs the `test` crate in the SDK, and tests on a panic-abort target need
  `-Zpanic-abort-tests`.
- **A git dependency over HTTPS** needs a relay and libgit2's curl transport, which Cargo
  registers only with a non-default `[http]` configuration. `cargo search`, `publish` and
  `login` need `CONNECTTIMEOUT`, `LOW_SPEED_*` and `PUT` in Dolly's libcurl.
- **Two stopgaps from before the kernel had file locks** are still in place, though it has had
  `flock` and `fcntl` byte ranges since `85a01262` (2026-10-06): SQLite's dot-file locking
  (`demos/rust/config/cargo.toml`, whose comment still says Dolly has no such locks) and
  `CARGO_INCREMENTAL=0` (`Dollyfile-rust-sdk`, `Dollyfile-cargo`). Not tried: Cargo without
  them.
- **`libc` for a user's project.** crates.io's copy has wasm32 layouts for this target, so a
  project needs `[patch.crates-io] libc = { path = "/opt/rust-sdk/src/libc" }`
  (`demos/rust/README.md`); a system-wide patch would harm every other project.
- **`--frozen`** failed half the runs with this Cargo and SpiderMonkey's lock (2026-10-07). Not
  explained; mozbuild does not pass it to a standalone JS build, so the catalog does not meet it.
- The `cargo` image build needs 5 to 6 GB (`tasks/20261006-145958-builder-artifact-copies`).
- Not measured: that Cargo's parallel build of Codex equals a serial one byte for byte (from
  `tasks/20260930-231102-parallel-rust`, where Patti's ripgrep, fd and protox did).

## Done when

Each is fixed or has its own task.
