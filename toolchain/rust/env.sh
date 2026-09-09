#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
port_dir="${project_dir}/build/rustc-port"
export CARGO_HOME="${port_dir}/cargo-home"
export CARGO_TARGET_DIR="${port_dir}/target"
export RUSTC="${port_dir}/toolchain/bin/rustc"
export RUSTC_BOOTSTRAP=1
export CARGO_INCREMENTAL=0
export CFG_RELEASE=1.98.1
export CFG_RELEASE_CHANNEL=dev
export CFG_VERSION='1.98.1 (48a229cea 2026-09-01)'
export CFG_VER_HASH=48a229ceaefd4985c50990b14116b6d856af0985
export CFG_VER_DATE=2026-09-01
export CFG_COMPILER_HOST_TRIPLE=wasm64-emscripten-probe
export CFG_DEFAULT_CODEGEN_BACKEND=llvm
export CFG_LIBDIR_RELATIVE=lib
export RUSTC_INSTALL_BINDIR=bin
export RUSTFLAGS='-C relocation-model=pic'
export LLVM_CONFIG="${project_dir}/toolchain/rust/llvm-config.sh"
unset LLVM_LINK_SHARED
export REAL_LIBRARY_PATH_VAR=LD_LIBRARY_PATH
export REAL_LIBRARY_PATH="${LD_LIBRARY_PATH:-}"
export CXX_wasm64_emscripten_probe="${project_dir}/toolchain/rust/cxx.sh"
export CC_wasm64_emscripten_probe="${project_dir}/toolchain/rust/cxx.sh"
export AR_wasm64_emscripten_probe="${project_dir}/toolchain/rust/ar.sh"
rust_target_args=(
  --target "${port_dir}/wasm64-emscripten-probe.json"
  -Z build-std=std,panic_abort -Z json-target-spec
  --config 'profile.dev.debug=0'
  --config 'profile.dev.opt-level=1'
  --config 'profile.dev.panic="abort"'
  --config "patch.crates-io.libc.path=\"${port_dir}/libc-186\""
  --config 'patch.crates-io.libc-std.package="libc"'
  --config "patch.crates-io.libc-std.path=\"${port_dir}/libc\""
  --config "patch.crates-io.jobserver.path=\"${port_dir}/jobserver\""
)
