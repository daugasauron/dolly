# The seed compiler for the exec contract: llvm-cc built under it and pinned, no restamped compiler left

- STATUS: OPEN
- PRIORITY: 200
- TAGS: toolchain,bootstrap,process,0.1.4

For the v0.1.4 reconciliation round. `core/process-exec` changed `include/dolly/process.h`
(operation 61, `tasks/20261006-214244-process-exec`), so the pinned seed compiler, which
carries the old contract's digest, no longer passes `scripts/build.sh`. Its bootstrap is
`scripts/restamp-seed-compiler.mjs`: the old compiler with the new digest written into the
two places it holds it, its own libc the old one (`docs/sources.md`, "The seed's compiler").
That compiler built `system`, `default`, OCaml and Emacs on 2026-10-23 and their tests pass.

To do in the round, after every `process.h` change is merged:

1. Run `scripts/restamp-seed-compiler.mjs` on the merged contract: either from the 0.1.3 seed
   or from `core/process-exec`'s archive, in the root checkout's
   `.cache/dolly-seed-compiler-14571deb664109ea99883a76e721b50555388e9046818d72c9519fc879be7ec2.tar`.
2. Rebuild the Rust compiler seed, `demos/rust/build-rust-toolchain.sh`: its key holds
   `process.h` and the process sysroot, and the kernel refuses the old one ("wrong
   dolly.process stamp" at `rust-sdk`'s `rustc --version`, seen in `work/x11fix` on
   2026-10-23). The Go seed likewise (`demos/go/build-go-toolchain.sh`).
3. Build the catalog with it, `llvm-tablegen`, `llvm-build` and `llvm-cc` among it, then
   `node demos/llvm/pin-seed-compiler.mjs`: the compiler `llvm-cc` links under the new
   contract, with its libc, becomes the seed, and its archive goes with the release.
4. That is a new seed, so every image rebuilds once more, unless the round accepts the
   restamped compiler for v0.1.4 and leaves this step for the next contract change.

Done when: the pinned seed compiler was linked by Dolly under the current process contract,
and `node demos/llvm/test/stage2-browser.mjs` or a second `llvm-cc` gives its bytes again.
