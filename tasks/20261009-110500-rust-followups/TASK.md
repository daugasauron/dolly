# Rust toolchain: what the self-built compiler left open

- STATUS: OPEN
- PRIORITY: 180
- TAGS: toolchain,rust,bootstrap

From `tasks/20260930-231100-self-host-rust` (closed 2026-10-09).

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

Done when each is fixed or has its own task.
