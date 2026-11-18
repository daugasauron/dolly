#!/usr/bin/env bash
# Rust's identity as its own build states it, which prepare-rustc-sources.py ends rust-build's
# [env] table with (CFG_*, RUSTC_INSTALL_BINDIR), and the upstream release prepare.sh locks
# the compiler's crates with.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
port_dir="${project_dir}/build/rustc-port"
export CARGO_HOME="${port_dir}/cargo-home"
export RUSTC="${port_dir}/toolchain/bin/rustc"
export RUSTC_BOOTSTRAP=1
export CFG_RELEASE=1.98.1
export CFG_RELEASE_CHANNEL=dev
export CFG_VERSION='1.98.1 (48a229cea 2026-09-01)'
export CFG_VER_HASH=48a229ceaefd4985c50990b14116b6d856af0985
export CFG_VER_DATE=2026-09-01
export CFG_COMPILER_HOST_TRIPLE=wasm64-emscripten-probe
export CFG_DEFAULT_CODEGEN_BACKEND=llvm
export CFG_LIBDIR_RELATIVE=lib
export RUSTC_INSTALL_BINDIR=bin
