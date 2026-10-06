# Replace Patti with real Cargo over Dolly's libcurl

- STATUS: OPEN
- PRIORITY: 210
- TAGS: rust,cargo,toolchain,network

Owner question (2026-10-01): can real Cargo run inside Dolly by patching
sockets or HTTP, instead of the Patti wrapper?

## Findings (2026-10-01, by reading)

- Patti (`demos/rust/patti.c`, 1,413 lines of C) builds locked Cargo projects:
  exact crates from `static.crates.io` through the broker, features, build
  scripts and procedural macros. Limits: serial, panic-abort, no resolver, no
  incremental builds, file locks, application threads, tests or benchmarks;
  git dependencies need `--patch`.
- Sockets are the wrong layer. Cargo's network traffic goes through libcurl
  (the `curl` crate): the sparse registry index, crate downloads, and git over
  HTTP through `git2-curl`. Dolly already ships a libcurl-compatible library
  over the HTTP broker (`src/libcurl-fetch.c`, `modules/curl.dm`), so linking
  `curl-sys` against it would give Cargo the broker without socket emulation
  or TLS in Wasm.
- Hard prerequisite: threads. Cargo spawns threads for its job queue, the
  jobserver helper and downloads, so it needs
  `20260930-230009-rust-threads` first.
- Gaps to close:
  - `libcurl-fetch.c` implements the easy interface and part of the multi
    interface (`curl_multi_add_handle`, `perform`, `info_read`, `fdset`,
    `timeout`); Cargo also uses `curl_multi_wait` and `curl_multi_setopt`
    (pipelining, host connection limits). HTTP/2 multiplexing can be switched
    off (`CARGO_HTTP_MULTIPLEXING=false`); the browser negotiates HTTP/2 anyway.
  - Build Cargo's C dependencies without OpenSSL, libssh2 or nghttp2: link the
    system libcurl, give libgit2 no HTTPS backend (git2-curl carries HTTP),
    bundle SQLite. Verify each crate's features and build script.
  - File locks: Dolly returns `ENOTSUP` for `F_SETLK`; check that Cargo treats
    that as an unsupported file system, as it does on NFS.
  - The page policy must allow `index.crates.io` and `static.crates.io`.
- Building Cargo itself: Patti builds it once from Cargo's own `Cargo.lock`
  (as it builds Codex); after that Cargo rebuilds itself.

## Takeover (2026-10-06): what is known

Branch `work/cargo-native`. Verified today unless marked "read".

- Pin: Cargo 0.99.0, commit `797e8a9bca276c1c9f9f738d2a20f484fa4eea9d`
  (`codeload.github.com/rust-lang/cargo/tar.gz/797e8a9b…`, SHA-256
  `572bdd90…9b74e`). It is the Cargo of the seed's Rust: the 1.98.1 host
  `cargo --version --verbose` prints that commit, libgit2 1.9.4 and libcurl
  8.21.0, the version of Dolly's curl headers. Its lock holds 550 packages;
  about 330 are in the closure of the `cargo` binary for this target, none of
  them tokio or mio.
- The Rust `curl` crate (0.4.50, `src/easy/handler.rs`, `default_configure`)
  calls `.expect()` on `ERRORBUFFER`, the header, write, read and debug
  callbacks, and on `SEEKFUNCTION`/`SEEKDATA`, `PROGRESSFUNCTION`/`PROGRESSDATA`
  and `OPENSOCKETFUNCTION`/`OPENSOCKETDATA` for every handle. Dolly's libcurl
  answers `NOT_BUILT_IN` or `UNKNOWN_OPTION` for the last three pairs, so any
  Rust program that creates a handle panics.
- Cargo 0.99 sends every registry request through one client
  (`src/cargo/util/network/http_async.rs`): a worker thread with a `Multi`.
  Beyond the easy options Dolly has, it needs `NOPROGRESS`, `HTTP_VERSION`
  and `PIPEWAIT` (fatal when refused), `PRIVATE` with `CURLINFO_PRIVATE`
  (`.expect`), `curl_multi_wait`, and `curl_multi_setopt` as a symbol (its
  errors are only logged). The blocking path (`cargo search`, `publish`,
  `login`) also sets `CONNECTTIMEOUT_MS`, `LOW_SPEED_LIMIT` and
  `LOW_SPEED_TIME`, fatally.
- File locks, Cargo itself: std's `File::try_lock` has no implementation for
  `target_os = "emscripten"` and returns `ErrorKind::Unsupported` without a
  system call (read: `library/std/src/sys/fs/unix.rs`); Cargo's
  `flock.rs::error_unsupported` takes that as a file system without locks.
- `flock()` lies: Emscripten's stub returns 0 for a conflicting lock and for
  descriptor -1 (Chrome). Making it fail breaks Zig, whose compilation cache
  needs locks (`ghostty-build` failed, `build/cargo-evidence/image-1.log`), so
  the change was withdrawn. `tasks/20261006-093856-flock-stub` has the
  measurement; kernel advisory locks are being done on the seed round's base
  by another agent, and this branch does not touch `flock`.
- rustc's incremental sessions take `fcntl` locks, so `cargo build` in the dev
  profile needs `CARGO_INCREMENTAL=0` (or kernel locks).
- Compile errors of the closure for this target, from a host type-check
  (`build/cargo-port/host-check.sh`, 1.98.1 host Cargo, the Dolly target JSON):
  `socket2` 0.6.4 (no `IovLen`), `jobserver` 0.1.34 (`pthread_kill`; Dolly
  has no directed signals), `zlib-rs` 0.6.4 (`simd_wasm64` is unstable),
  `is_executable` 1.0.6 (its `unix` and `wasm` implementations both apply).
  With the patches below the whole closure, `cargo` included, type-checks
  (`build/cargo-evidence/host-check-5.log`).
- What the linked program needs, from a host link of the Rust objects alone
  with every C symbol left an import (`build/cargo-port/fake-emcc.sh`, list in
  `build/cargo-port/host-link/imports.txt`): 22 libcurl symbols, of which
  Dolly lacked `curl_multi_wait`, `curl_multi_setopt`, `curl_easy_reset` and
  `curl_formfree`; and `emscripten_run_script_string`, which `jiff` 0.2.31
  calls to ask JavaScript for the time zone (gone with `jiff-timezone.patch`).
- The Rust `cc` crate archives with `ar cq` and `ar s`; Dolly's `ar` knew only
  `r`. It selects `emcc` and `emar` for an Emscripten target unless `CC` and
  `AR` are set, which the images do.
- CORS, by `curl` from the host with an `Origin` header (2026-10-06):
  `static.crates.io/crates/NAME/VERSION/download` answers
  `access-control-allow-origin: *`. `index.crates.io` answers the preflight
  for Cargo's `cargo-protocol` header, and a cache miss carries
  `access-control-allow-origin: *` and `vary: Origin`; but a file cached from
  a request without `Origin` (every native Cargo) is served to everyone
  without either header (`/se/rd/serde`, `/it/oa/itoa`, `/config.json`:
  `x-cache: HIT`, no CORS header; an unknown name fetched first without and
  then with `Origin`: `MISS`, then `HIT` without it). A browser can therefore
  read the index only for files no native Cargo fetched in the last ten
  minutes at that cache node: it needs a relay (`docs/http.md`) or a mirror.

### Decisions

- TLS, SSH and HTTP/2 stay out of Wasm: `curl` without `ssl` and `http2`,
  `git2` without `https` and `ssh`. Cargo's workspace manifest hard-codes
  those features, so this is a manifest patch (`cargo-features.patch`, four
  lines; `git2-curl.patch`, one line for the same default). Linking the
  `-sys` crates against stubs instead would leave `openssl_sys::init()` calls
  without a library.
- `curl-sys` and `libz-sys` link the image's `libcurl.a` and `libz.a` through
  Cargo's own `[target.TRIPLE.LINKS]` build-script override, which Patti now
  reads from `--config` (18 lines); `curl-sys`'s script would otherwise build
  its bundled curl with sockets.
- `jobserver` uses its in-process implementation, the patch the Rust seed
  already carries (`toolchain/jobserver.patch`). The Unix one cannot work
  here, by reading `jobserver-0.1.34/src/unix.rs`: `configure` (line 361)
  clears `FD_CLOEXEC` in the child through `Command::pre_exec`, which makes
  std fork and exec instead of `posix_spawn`, and the helper thread is stopped
  with `pthread_kill` (line 450). Dolly has neither `fork` nor directed
  signals, by design (`docs/process-model.md`), so this is no gap to close in
  a lower layer. Cargo then needs no pipe for job tokens, with `-j1` or
  without; `-j` bounds the processes it starts.
- Reused target patches: `socket2`, `zlib-rs`, `jiff-timezone` (they apply
  to Cargo's locked versions unchanged). New: `is_executable.patch` (one
  `cfg`: the crate does not expect a target that is both `unix` and `wasm`).
- No `cc` patch: `ar` learns `q` and `s` instead (`src/compiler.cpp`), since
  under Cargo every crate with C sources brings an unpatched `cc`. Verified:
  unpatched `cc` 1.2.65, with its `parallel` feature, compiled libgit2 and
  SQLite in the build below.
- libcurl gains what the list above names. `CONNECTTIMEOUT`, `LOW_SPEED_*`
  and `PUT` stay refused, so `cargo search`, `publish` and `login` fail with
  "not built in" for now.

## Milestone 1, reached 2026-10-06 19:26 JST

Verified in headless Chrome, in a `rust-build` image built on this branch
(runtime `9b20f1e7…`, image inputs `8607337b…`), driven by
`build/cargo-evidence/drive.mjs` (evidence, not committed). The machine was
rebooted at 19:54: that session and the binary are gone. What remains is this
record, `build/cargo-evidence/drive-3.log` (commands, statuses, times) and
`patti-cargo-1.out` (the last screen of the build).

    cd /tmp && curl -fsS $ORIGIN/fixture/f/cargo.tar -o /tmp/cargo.tar && tar -xf /tmp/cargo.tar -C / && rm /tmp/cargo.tar
    curl -fsS $ORIGIN/fixture/f/cargo-patti.toml -o /tmp/cargo-patti.toml
    patti build -j 4 --offline --resume --manifest-path /tmp/cargo/source/Cargo.toml --bin cargo \
      --config /tmp/cargo-patti.toml --cache /tmp/cargo/cache --target-dir /tmp/cargo/build \
      --patch libc=/opt/rust-sdk/src/libc --patch socket2=/tmp/cargo/socket2-0.6.4 \
      --patch zlib-rs=/tmp/cargo/zlib-rs-0.6.4 --patch jiff=/tmp/cargo/jiff-0.2.31 \
      --patch jobserver=/tmp/cargo/jobserver-0.1.34 --patch is_executable=/tmp/cargo/is_executable-1.0.6 \
      --patch git2-curl=/tmp/cargo/git2-curl-0.22.0

- `patti: resolved 337 packages from Cargo.lock` … `patti: built
  /tmp/cargo/build/cargo`, status 0 after 966.8 s. The binary was 29,480,563
  bytes; the session's renderer held 1.9 GB afterwards.
- `/tmp/cargo/build/cargo --version`: `cargo 1.98.1 (797e8a9bc 2026-08-05)`,
  status 0, 0.3 s. With `--verbose`:

      release: 1.98.1
      commit-hash: 797e8a9bca276c1c9f9f738d2a20f484fa4eea9d
      commit-date: 2026-08-05
      host: wasm64-emscripten-probe
      libgit2: 1.9.4 (sys:0.21.0 vendored)
      libcurl: 8.21.0-DEV (Dolly Fetch) (sys:0.4.90+curl-8.21.0 system ssl:browser Fetch)
      os: Emscripten [unknown bitness]

- `cargo metadata --format-version 1` in `/tmp/hello` (a `Cargo.toml` with
  name, version and edition 2024, and `src/main.rs`): status 0 in 1.7 s, one
  JSON object: `{"packages":[{"name":"hello","version":"0.1.0","id":
  "path+file:///tmp/hello#0.1.0",…,"targets":[{"kind":["bin"],…,"src_path":
  "/tmp/hello/src/main.rs","edition":"2024",…}],…,"manifest_path":
  "/tmp/hello/Cargo.toml",…}],"workspace_members":["path+file:///tmp/hello#0.1.0"],
  …,"resolve":{…,"root":"path+file:///tmp/hello#0.1.0"},"target_directory":
  "/tmp/hello/target",…}`.

These are the two commands SpiderMonkey's configure runs first. Its build
then needs build scripts, which do not run yet (below).

### To rebuild it

1. The three core commits must be in the images: `faee3872` (`ar` `q` and
   `s`, a seed change: next seed round), `7d71e824` (libcurl: only the `curl`
   package's `SOURCE` pin, so `curl` and what installs it), `dca3ef58` (Patti:
   `rust-build`'s pin, so every Rust image; `demos/rust/patti.c` will conflict
   trivially with the seed round's `__dolly__` edit). Then
   `npm run build:runtime` and the `rust-build` chain, one builder, through
   the slot.
2. `python3 demos/rust/prepare-rust-sources.py cargo` writes
   `build/rust-sources/cargo.tar` (101,614,080 bytes).
3. Either the commands above in a `rust-build` session, or, once
   `scripts/update-recipe-pins.mjs` has filled its pins, the recipe
   `demos/rust/Dollyfile-cargo`, which has never been built.

Both browser suites passed on that seed in Chromium and Firefox:
`node test/core-browser.mjs` (`ar`) and `node test/network-browser.mjs`
(libcurl); logs in `build/cargo-evidence/`.

### Memory of the build (2026-10-06, scope cgroup of one browser session)

- Everything before the last crate peaks at 4.9 GB with `-j 4` (5.5 minutes
  on an idle machine, 2.7 GB 40 s in).
- rustc for the `cargo` crate as one codegen unit needs more than 8 GB on top
  of about 2 GB of files: the caps killed two builds in it, at 6 GB (20:22)
  and at 8 GB (20:32, last sample 7.61 GB). The uncapped 19:26 build therefore
  held that much in one renderer shortly before the machine ran out of memory.
- With `-C codegen-units=16` for that crate (`cargo-patti.toml`, as Codex does
  for its largest crates) the whole build peaks at 5.05 GB and takes 544 s
  with `-j 4`, upload of the binary included; the binary is 30,439,442 bytes
  against 29,480,563 (3 % larger). Speed was not compared: the one-unit
  binary did not survive. Logs: `build/cargo-evidence/memory-{5,6,7}.log`.
- The binary is saved outside the session:
  `build/cargo-evidence/cargo-0.99.0-dolly.wasm` (SHA-256 `3c48e121…5d1c`),
  posted in 4 MiB parts by `serve/upload.c`; a new session loads it in a
  second and runs it.

## Milestones 2 and 3, reached 2026-10-06 20:43–21:03 JST

Headless Chrome, `rust-build` image, the binary above (built with
`jobserver-configure.patch`, the SQLite setting and 16 codegen units), one
session inside the 6 GB slot.

- `cargo --version`: `cargo 1.98.1 (797e8a9bc 2026-08-05)`; `cargo metadata
  --format-version 1 > /tmp/metadata.json`: status 0, 985 bytes, no warning.
- No dependencies, offline (`/tmp/hello`):

      $ CARGO_INCREMENTAL=0 cargo build --offline
         Compiling hello v0.1.0 (/tmp/hello)
          Finished `dev` profile [unoptimized + debuginfo] target(s) in 2.16s
      $ target/debug/hello.js
      hello from cargo 0.1.0

  The program is named `hello.js`: the Rust target's `exe-suffix`.
- Two vendored crates (`cargo vendor` of `itoa` 1.0.18 and `semver` 1.0.28,
  a directory source in `.cargo/config.toml`):
  `CARGO_INCREMENTAL=0 cargo build --offline` compiles three crates in 4.8 s;
  `target/debug/vend.js` prints `CARGO-VENDORED-OK 98 1.98.1`.
- A local procedural macro (`tiny-macro`, `proc-macro = true`): builds and
  `target/debug/bs.js` prints `CARGO-PROC-MACRO-OK 42`. rustc warns that a
  procedural macro built with `panic=abort` may crash the compiler.
- crates.io through the HTTP broker (`/tmp/net`, `itoa = "1"`, `semver =
  "1"`, no lock file, the page without a policy, `index.crates.io` mapped to a
  relay on the test server's origin with `DOLLY_HTTP_RELAYS`):

      $ CARGO_INCREMENTAL=0 cargo build
          Updating crates.io index
         1.066914922s ERROR cargo::util::network::http_async: failed to set max host connections in curl: Unsupported libcurl multi option
         1.067384922s ERROR cargo::util::network::http_async: failed to enable multiplexing/pipelining in curl: Unsupported libcurl multi option
           Locking 2 packages to latest compatible versions
        Downloaded itoa v1.0.18
        Downloaded semver v1.0.28
        Downloaded 2 crates (47.9KiB) in 1.21s
         Compiling itoa v1.0.18
         Compiling semver v1.0.28
         Compiling net v0.1.0 (/tmp/net)
          Finished `dev` profile [unoptimized + debuginfo] target(s) in 6.83s
      $ target/debug/net.js
      CARGO-CRATES-IO-OK 98 1.98.1

  The relay served `config.json`, `it/oa/itoa` and `se/mv/semver`; the two
  crate archives came straight from `static.crates.io`, which sends CORS
  headers. This is Cargo's worker thread, its `Multi`, `curl_multi_wait`,
  `PRIVATE` and the progress callback over Dolly's libcurl.

### What these runs showed

- SQLite: the warning "failed to save last-use data … Error code 3850: disk
  I/O error" (`SQLITE_IOERR_LOCK`: the cache tracker's database takes `fcntl`
  byte-range locks, `ENOTSUP`; whole-file `flock` would not satisfy it) is
  gone with SQLite's dot-file locks as the default VFS, set through the
  crate's own `LIBSQLITE3_FLAGS` in `cargo-patti.toml` (a stopgap until the
  kernel has `fcntl` locks);
  `~/.cargo/.global-cache` is written (57,344 bytes). Cargo has no key or
  variable that skips the tracker.
- `jobserver-configure.patch` works: before it, `cargo build` exited 126 with
  "thread '<unnamed>' panicked at jobserver-0.1.34/src/wasm.rs:67:9: On this
  platform there is no cross process jobserver support, so Client::configure
  is not supported."
- `-j1` does not avoid the jobserver: it hangs. After "Finished", `cargo
  build -j1` of the three-crate project never exits (interrupted after 40 s,
  status 130; a one-crate build with `-j1` exits). The in-process back end's
  helper thread waits in `Client::acquire` for a token that `-j1` never has,
  and `Helper::join` waits for that thread (`wasm.rs`: "TODO: this is not
  correct if the thread is blocked in `client.acquire()`"). The same can
  happen with any `-j` when more tokens were requested than exist at the end.
- Incremental compilation needs locks rustc does not get. Without
  `CARGO_INCREMENTAL=0`:

      error: incremental compilation: could not create session directory lock file: Not supported (os error 138)

  and exit 101. Kernel `fcntl` locks, or `[build] incremental = false` in a
  configuration file the package ships.
- Build scripts could not run (fixed by `14da533a`, below). Cargo compiles `build_script_build-HASH.js`,
  links it as `build-script-build.js` and executes `build-script-build`:

      error: failed to run custom build command for `bs v0.1.0 (/tmp/bs)`
      Caused by:
        could not execute process `/tmp/bs/target/debug/build/bs-dacd8f8769e79316/build-script-build` (never executed)
      Caused by:
        No such file or directory (os error 44)

  Cargo assumes a host's executable suffix is empty or one the system adds
  (`.exe`). The suffix comes from the Rust target file
  (`demos/rust/toolchain/wasm64-emscripten-probe.json`, `"exe-suffix":
  ".js"`), an Emscripten habit that means nothing in Dolly, whose programs
  are plain Wasm files. The fix is `"exe-suffix": ""` there, but rustc ties
  every compiled library to the target file's contents, so the SDK's standard
  library, and with it the Rust seed, must be rebuilt.
- `curl_multi_setopt`: Cargo logs each refusal at ERROR level, visibly, and
  carries on (the two lines above).

## Build scripts, `-j1` and SpiderMonkey, 2026-10-06 21:10–21:45 JST

All in headless Chrome inside the 6 GB browser slot, on `rust-build`.

- `-j1` exits: the in-process jobserver's helper now leaves with its owner
  (`jobserver-in-process.patch`, commit `cab675f9`). Cargo rebuilt by Patti
  with it in 578 s, peak 4.7 GB; `CARGO_INCREMENTAL=0 cargo build --offline
  -j1` of the vendored project exits 0. It was the crate's defect (a wait on
  a condition variable), not a pipe or thread defect in Dolly.
- Executable suffix: commit `14da533a` empties `exe-suffix` in the Rust target
  file. The seed must be rebuilt (rustc ties libraries to the file's
  contents): `demos/rust/build-rust-toolchain.sh` recompiled the 277 compiler
  crates in 3 m 20 s and the SDK, about 4 minutes in all with the LLVM build
  in place (`rust-sdk.tar.gz` `071f754d…`). With that seed unpacked over
  `/opt/rust-sdk` in a session: `rustc s.rs` writes `s` and it runs; Patti
  builds ripgrep 15.1.0 with the recipe's command in 130 s; Cargo builds a
  crate with a build script and a procedural macro, and `target/debug/bs`
  prints `CARGO-BUILD-SCRIPT-OK wasm64-emscripten-probe 42`.
- `curl_multi_setopt`: `PIPELINING` and `MAX_HOST_CONNECTIONS` only steer
  connections, which the browser owns, so they are now accepted (working
  tree; its contract test waits for an image build). With that libcurl linked
  into Cargo in a session, the crates.io build prints no ERROR line.
- crates.io `libc` is wrong for this target and Cargo cannot fix it for
  everyone. Unpatched `libc` 0.2.190 compiles, and `libc::stat` of a 30 MB
  file then reports `size=0`: its Emscripten layouts are wasm32's. With
  `[patch.crates-io] libc = { path = "/opt/rust-sdk/src/libc" }` in the
  project's `.cargo/config.toml` the same program prints `size=30439516`.
  That table cannot be shipped system-wide (`/.cargo/config.toml`): every
  project that does not use `libc` then gets a warning and a
  `[[patch.unused]]` entry in its lock file, and `--frozen` builds fail. The
  real fix is upstream `libc` knowing this target.

### What SpiderMonkey asks of Cargo

mozjs-128.13.0 from `.cache/0ad`, its Rust workspace staged with the whole
`third_party/rust` (337 MB) and, from the host build's `obj-dolly`, only what
the build scripts read (`config.status`, `buildconfig.rs`, `js-confdefs.h`,
324 headers); the seed with the empty suffix; the Cargo binary above.

- configure: `cargo +stable` exits 101 ("no such command"), which is how it
  recognises a plain Cargo; `cargo --version --verbose` has the line it
  parses.
- `cargo metadata --format-version 1 --manifest-path js/src/rust/Cargo.toml`
  returns the same 70 packages as the 1.98.1 host Cargo.
- The library:

      $ cd /tmp/mozjs && CXX=c++ CC=cc AR=ar CRATE_CC_NO_DEFAULTS=1 \
          MOZ_TOPOBJDIR=/tmp/mozjs/obj-dolly CARGO_TARGET_DIR=/tmp/mozjs/obj-dolly/rust-target \
          CARGO_INCREMENTAL=0 cargo rustc --release --offline \
          --manifest-path js/src/rust/Cargo.toml --lib --target wasm64-emscripten-probe
          …
          Finished `release` profile [optimized] target(s) in 2m 41s
      $ ls -la obj-dolly/rust-target/wasm64-emscripten-probe/release/libjsrust.a
      -   12414266 …

  59 units, eight build scripts (one compiles C++ through the `cc` crate) and
  six procedural macros; no crate in it depends on `libc`. mozbuild's own
  flags (`-C codegen-units=1`, `-Cembed-bitcode=yes`, features, the linker
  wrapper) were not passed; the host-built library is 24.1 MB.
- `--frozen`, which mozbuild passes, fails about half the runs, on the host
  with the same Cargo as in Dolly (host: 0, 101, 101, 0, 0, 101, 101, 101;
  Dolly: 101, 101, 101, 0): "cannot update the lock file … because --frozen
  was passed". Cargo 1.98 writes the two groups of `[[patch.unused]]` entries
  (`crates-io` and `mozilla/neqo`) in hash-map order. A SpiderMonkey build
  needs that removed from its inputs, or a retry.
- Not tried: `cbindgen` (a Rust program mozbuild runs; its dependencies
  include `libc`), and mozbuild driving these commands itself.

## The package and the integration base, 2026-10-06 21:47–22:25 JST

- `demos/rust/Dollyfile-cargo` built green through the build slot at 21:47
  (`DOLLY_BUILD_IMAGES=cargo`: curl, rust-sdk on the seed with the empty
  suffix, rust-build, rust, cargo; 963 s, the Cargo step about ten minutes).
  The package installs the `rust` package (Cargo is of no use without rustc),
  exports `CARGO_INCREMENTAL=0` and ends its recipe with `cargo build
  --offline` of a crate and a run of it: the log shows `cargo 1.98.1
  (797e8a9bc 2026-08-05)`, `Finished` and `built by cargo`. Snapshot:
  286,547,609 bytes. Licence texts: Cargo's three, libgit2's `COPYING` and
  each crate's files; rows in `config/upstreams.json`.
- A package of its own rather than part of `rust`: `rust` is copied from
  `rust-build`, which every Rust image is built on, and should not carry a
  ten-minute, 5 GB build that only Cargo's users need.
- crates.io under an explicit policy (Chrome, 21:50): with

      globalThis.DOLLY_HTTP_POLICY = { maxRequests: 1024, rules: [
        { origin: "https://index.crates.io", pathPrefix: "/", methods: ["GET"] },
        { origin: "https://static.crates.io", pathPrefix: "/crates/", methods: ["GET"] },
      ] };
      globalThis.DOLLY_HTTP_RELAYS = [{ origin: "https://index.crates.io", through: "https://RELAY/" }];

  (plus the test server's own fixture rule) the two-dependency build works and
  `curl https://crates.io/api/v1/crates/itoa` is refused with curl's status 9.
  Cargo asks to follow redirects; none occurs on these two hosts. The public
  sites configure no relay, so there a build with crates.io dependencies
  fails at "Updating crates.io index" unless the index file happens to be
  uncached; a vendored directory, a mirror or an embedding's relay works.
- For the catalog round of 22:40 the package was handed over as
  `check/cargo-on-next` (`a88e3621..f66aca87`, nine commits: this branch's
  Cargo commits and `REQUIRES HOST runtime@0` for that base). On it: 67
  recipes lint, 400 source tests pass, and `node demos/run-browser-tests.mjs
  rust` passed (94.8 s) on a `rust-tools` chain built from that base with a
  Rust seed relinked for it (34 s: with the compiler crates built, a
  `process.h` change only relinks). `rust-tools` does not carry `cargo` in
  that round.
- This branch then merged `a88e3621` (`f7cd28bf`).
- libcurl follow-up (`085f7641`, multi options that only steer connections):
  `node test/network-browser.mjs` passes in Chromium and Firefox on the merged
  base with a rebuilt `default` (22:33). On `integrate/next` it also needs
  `Dollyfile-dolly-docs`'s pin of `docs/http.md` refreshed.
- Under a 5 GB build cap the `cargo` image step was killed about a minute
  into the Patti build (22:31, `oom_kill 1`): `-j 4` needs 4.9 GB before the
  last crate and 5.05 GB at the end, and page cache from earlier images in
  the same chain counts against the cap.

### Next steps

1. On the merged base: rebuild `rust-tools` (now with `cargo`) and run
   `node demos/run-browser-tests.mjs rust` with its Cargo check
   (`fixtures/cargo.mjs`: the two commands SpiderMonkey's configure runs, an
   offline build, a build against a one-crate sparse registry on the test
   server); try `amy install cargo` in `default`. Measure the Patti build
   with `-j 2` and lower the recipe's value if that keeps it under 4 GB.
2. When kernel file locks land (`core/file-locks`): drop the SQLite dot-file
   setting from `cargo-patti.toml` and `CARGO_INCREMENTAL=0` from the
   package. Both are stopgaps.
3. `libc` under Cargo (above) has no good answer yet; `cbindgen` for
   SpiderMonkey needs it.
4. `cargo search`, `publish` and `login` need `CONNECTTIMEOUT`, `LOW_SPEED_*`
   and `PUT` in libcurl; git dependencies over HTTPS need a relay and
   libgit2's curl transport, which Cargo registers only with a non-default
   `[http]` configuration.

### What would retire Patti

- `cargo build` works here for crates with build scripts, procedural macros
  and C sources, in comparable time and memory.
- The target patches Patti takes as `--patch` reach Cargo as `[patch]`
  configuration, and image builds stay offline through a vendored directory
  source instead of Patti's archive cache.
- Something else builds the first Cargo: a Cargo in the externally built Rust
  seed, beside rustc. Until then Patti is the bootstrap.

## Done when

- Inside Dolly, in a real browser: Cargo built from pinned sources resolves
  and builds ripgrep, fd, protox and Codex from their manifests; `cargo test`
  runs a small crate's tests; a git dependency over HTTPS resolves.
- Patti, its recipes and tests are deleted; the Rust images use Cargo.
