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

## Done when

- Inside Dolly, in a real browser: Cargo built from pinned sources resolves
  and builds ripgrep, fd, protox and Codex from their manifests; `cargo test`
  runs a small crate's tests; a git dependency over HTTPS resolves.
- Patti, its recipes and tests are deleted; the Rust images use Cargo.
