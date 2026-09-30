#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/env.sh"
export CARGO_TARGET_DIR="${port_dir}/sdk-target"
export RUSTFLAGS='-C relocation-model=pic -C embed-bitcode=yes'
mkdir -p "${port_dir}/sdk-probe/src"
cat > "${port_dir}/sdk-probe/Cargo.toml" <<'EOF'
[package]
name = "dolly-rust-sdk"
version = "0.0.0"
edition = "2024"

[workspace]
EOF
touch "${port_dir}/sdk-probe/src/lib.rs"
cd "${port_dir}/sdk-probe"
exec "${port_dir}/toolchain/bin/cargo" build -j 4 --lib \
  --message-format=json-render-diagnostics "${rust_target_args[@]}" \
  -Z build-std=std,panic_abort,proc_macro
