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

These are the two commands SpiderMonkey's configure runs first. Nothing
further of its Cargo steps has been tried.

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

### Two failures seen at run time

- Every Cargo command printed, before its result:

      warning: failed to save last-use data
      This may prevent cargo from accurately tracking what is being used in its global cache. This information is used for automatically removing unused data in the cache.

      disk I/O error

      Caused by:
        Error code 3850: disk I/O error

  3850 is `SQLITE_IOERR_LOCK`: the global cache tracker opens
  `$CARGO_HOME/.global-cache` (`global_cache_tracker.rs:357`) and SQLite's
  default VFS takes `fcntl` byte-range locks, which answer `ENOTSUP`.
  Whole-file `flock` will not satisfy it. By reading: Cargo has no key or
  variable that skips the tracker (`cache.auto-clean-frequency = "never"`
  only stops the cleaning; only "cannot open" and "read-only" errors are
  silent). A supported way without a patch, not built yet: SQLite's
  dot-file locks as the default VFS, through the build script's
  `LIBSQLITE3_FLAGS` (`libsqlite3-sys` `build.rs:294`, `sqlite3.c:48722`):

      [package.libsqlite3-sys.env]
      LIBSQLITE3_FLAGS = '-DSQLITE_DEFAULT_UNIX_VFS="unix-dotfile"'

  in `demos/rust/config/cargo-patti.toml`. Codex already selects that VFS
  (`demos/codex/config/sqlite-options.patch`).
- `cargo build --offline` in `/tmp/hello` exited 126 before its first rustc:

      Compiling hello v0.1.0 (/tmp/hello)
      thread '<unnamed>' (4) panicked at /tmp/cargo/jobserver-0.1.34/src/wasm.rs:67:9:
      On this platform there is no cross process jobserver support,
                   so Client::configure is not supported.
      dolly: process 14673 failed: unreachable

  Cargo calls `Client::configure` for every rustc and build script
  (`compiler/mod.rs:805`, `custom_build.rs:386`) and has no switch for it.
  `jobserver-configure.patch` (commit `ff412ee0`, six lines) makes it return
  at once on this target. It applies and type-checks on the host; the rebuild
  that would have run it was interrupted, so it is unverified. It goes away
  when the crate's fallback back end makes `configure` a no-op.

### Not shown yet

- `curl_multi_setopt`: Cargo only logs the refusal and continues
  (`http_async.rs:232-237`, by reading). No Cargo network request has run in
  Dolly, so nothing of the new libcurl is proved by Cargo itself yet.
- `demos/rust/Dollyfile-cargo` and `demos/rust/test/fixtures/cargo.mjs`
  (commit `3540fe1d`) have not run. The fixture's registry was checked with
  the host Cargo only.

### Next steps

1. Rebuild as above with `ff412ee0`, add the SQLite setting, and run
   `CARGO_INCREMENTAL=0 cargo build --offline` in `/tmp/hello` (sources in
   `build/cargo-evidence/serve/hello`). Expect: rustc's incremental sessions
   want `fcntl` locks unless `CARGO_INCREMENTAL=0` or `[build] incremental =
   false`; Cargo reads rustc's output with `poll` on two non-blocking pipes;
   the binary is named `hello.js`, the target's `exe-suffix`.
2. Milestone 3 with `fixtures/cargo.mjs`, then crates.io itself. Rows to try,
   unverified, with the index through a relay because of its cache (above):

       globalThis.DOLLY_HTTP_POLICY = { maxRequests: 1024, rules: [
         { origin: "https://index.crates.io", pathPrefix: "/", methods: ["GET"] },
         { origin: "https://static.crates.io", pathPrefix: "/crates/", methods: ["GET"] },
       ] };
       globalThis.DOLLY_HTTP_RELAYS = [{ origin: "https://index.crates.io", through: "https://RELAY/" }];

   Cargo asks to follow redirects; under explicit rules a redirect fails.
   Crates that depend on `libc` need the SDK's patched copy, which Cargo can
   take from a `[patch.crates-io]` table in a configuration file.
3. Milestone 4: build the recipe once, then wire the fixture into a browser
   test on an image with both `cargo` and `rust`.

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
