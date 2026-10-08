# Sourced by scripts/prepare-image-sources.sh.
if has_image rust-sdk; then
  node demos/rust/prepare-rust-seed.mjs "${static_dir}/rust/rust-sdk.tar.gz"
  copy_static demos/rust/rustc.sh rust/rustc.sh
  copy_static demos/rust/rust-linker.c rust/rust-linker.c
  copy_static demos/rust/toolchain/dlopen.c rust/dlopen.c
  copy_static demos/rust/pthread-attr.c rust/pthread-attr.c
fi
if has_image rust-llvm; then
  python3 demos/rust/prepare-rustc-sources.py
  copy_static build/rust-sources/rust-llvm.tar.gz rust/rust-llvm.tar.gz
  copy_static build/rust-sources/rustc.tar.gz rust/rustc.tar.gz
  copy_static demos/llvm/llvm-host-triple.patch rust/llvm-host-triple.patch
  copy_static demos/rust/config/patches/llvm-main-executable.patch rust/llvm-main-executable.patch
fi
stage_rust_project() {
  python3 demos/rust/prepare-rust-sources.py "$1"
  copy_static "build/rust-sources/$1.tar.gz" "rust/$1.tar.gz"
}
if has_image rust-build; then stage_rust_project cargo; fi
for program in ripgrep protox fd cbindgen; do
  if has_image "${program}"; then stage_rust_project "${program}"; fi
done
