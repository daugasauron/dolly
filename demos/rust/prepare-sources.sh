# Sourced by scripts/prepare-image-sources.sh.
if has_module rust-sdk; then
  node demos/rust/prepare-rust-seed.mjs "${static_dir}/rust/rust-sdk.tar.gz"
  copy_static demos/rust/rustc.sh rust/rustc.sh
  copy_static demos/rust/rust-linker.c rust/rust-linker.c
fi
if has_module patti; then
  copy_static demos/rust/patti.c patti/patti.c
  copy_static src/sha256.h patti/sha256.h
  for name in tomlc17.c tomlc17.h LICENSE; do
    copy_static "demos/rust/tomlc17/${name}" "patti/${name}"
  done
fi
for program in ripgrep protox fd; do
  if has_module "${program}"; then
    python3 demos/rust/prepare-rust-sources.py "${program}"
    copy_static "build/rust-sources/${program}.tar" "rust/${program}.tar"
  fi
done
