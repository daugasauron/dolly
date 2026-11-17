# Rust and Zig programs are built as Emscripten's: 37 Rust patches add target_os = "emscripten" where C programs see __dolly__; ggml-webgpu too

- STATUS: CLOSED
- PRIORITY: 80
- TAGS: audit,ports,rust,zig,design,0.1.8

## State (2026-11-17)

Decided: Emscripten's name is kept for the three, each named as an exception in its demo's
README (closing section). QuickJS's `-DEMSCRIPTEN=1` is gone (`tasks/20261116-151122-ports-09`).

## What

C and C++ compiled in Dolly see `__dolly__` and no Emscripten macro, and `cc -dumpmachine` says
`wasm64-unknown-dolly` (target-identity, `programs/compiler.cpp`). Go is `GOOS=dolly`, Mojo has
`CompilationTarget.is_dolly()`. These still tell upstream the platform is Emscripten:

- **Rust**: `demos/rust/toolchain/wasm64-emscripten-probe.json` has `"os": "emscripten"`,
  `"linker-flavor": "em-cc"` and Emscripten link arguments (`-sABORTING_MALLOC=0`,
  `-sWASM_BIGINT`), so `std::env::consts::OS` is `"emscripten"` (a program built by the `rust`
  package in `rust-tools` prints `os emscripten family unix arch wasm64`; `rust-probe.json`,
  `rust-probe.log` in `work/audit-1116-evidence/ports/`) and every crate takes its Emscripten
  branch. 37 patches add 178 lines naming `emscripten` to std, `libc` and crates
  (`demos/rust/config/patches` 11 patches/53 lines, `demos/rust/toolchain` 6/40,
  `demos/photocraft` 12/49, `demos/codex/config` 8/36), some to undo branches written for
  Emscripten's JavaScript host (`std.patch`: `reset_sigpipe`; `mio.patch`: its wasm
  `compile_error`). Where std lists the systems that have a call, Emscripten is not among them
  though Dolly has it: `File::lock`, `unlock` and `try_lock` answer `lock() not supported
  (Unsupported)` in `rust-tools` (`rust-lock-probe.json`, `rust-lock-probe.log`) although
  Dolly's `flock` works (a C program's `LOCK_EX` holds, a second descriptor's `LOCK_EX |
  LOCK_NB` fails until `LOCK_UN`; `flock-probe.json`, `flock-probe.log`), and so Codex keeps `installation-id.patch` and `launch.c:61` writes
  its id (`tasks/20261116-140352-ports-02`, item 6). An `"os": "dolly"` std would face the same
  lists; whether to add it to them is part of the choice below.
- **Zig**: `Dollyfile-zig-build:101,116` and `Dollyfile-ghostty-build:59` build with `-target
  wasm64-emscripten`; `config/zig-0.17.0-dolly-native.patch` (14 lines),
  `demos/zig/zig-0.17.0-dolly-llvm.patch` (8), `config/ghostty-dolly.patch` (2) and
  `demos/ghostty-gtk/ghostty-dolly.patch` and `libxev-dolly.patch` (17) add `.emscripten` cases
  ("Emscripten's libc, musl, has Linux's getdents").
- **ggml-webgpu**: `demos/local-llm/CMakeLists.txt:51` compiles `ggml-webgpu.cpp` with
  `__EMSCRIPTEN__=1`.

AGENTS.md, porting rules: "Do not claim Linux or AMD64 to pass detection. Use upstream's
portable paths and explicit unsupported results." Claiming Emscripten is the same kind of
claim: it selects code written for another platform, which patches then correct.

## To confirm before a change

Whether `"os": "dolly"` (unix family) lets crates take their generic Unix paths with fewer
patches: build `ripgrep` and `fd` for such a target JSON with a `libc` module copied from its
Emscripten one, and count the patches that remain. Zig the same with a Dolly OS tag. A count of
the vendored sources as staged (`work/round1113/build/rust-sources/ripgrep/vendor`,
`build/codex-sources/vendor`): of ripgrep's 51 crates two have Emscripten branches (`libc`, 31
`target_os = "emscripten"` lines; `getrandom`, 2) and eleven name operating systems; of Codex's
1,218 crates 48 have Emscripten branches, each of which a Dolly name would leave.

## Done when

The counts are in this task, and the owner has the choice for each: the Dolly name, or
Emscripten's kept and named as an exception in its demo's README.

## Closed (2026-11-17)

The counts are the audit's above: 37 patches add 178 lines naming `emscripten` (std, `libc` and
crates for Rust; 41 lines over five Zig patches); of the staged vendored crates, ripgrep's 51 have
two with Emscripten branches (`libc`, 31 lines; `getrandom`, 2) and Codex's 1,218 have 48. A Dolly
`target_os` would need a port of std and of the `libc` crate, and each of those branches a Dolly
case of its own (not measured: the port is the work this would cost).
Zig's standard library likewise knows no Dolly OS. ggml-webgpu's `__EMSCRIPTEN__` is upstream's
only switch between a browser's WebGPU and Dawn's (its Dawn toggles and native features, which
`gpu@0` does not give), so it selects the right code. Decided: Emscripten's name stays for the
three, as an exception each demo's README names: `demos/rust/README.md` (Limits, with
`File::lock` answering `Unsupported`), `demos/zig/README.md`, `demos/local-llm/README.md` (Key
files). Commit on `ws/ports`.
