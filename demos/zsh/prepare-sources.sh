# Sourced by scripts/prepare-image-sources.sh.
if has_image zsh; then
  # Configured and patched outside (prepare-zsh.sh); Dolly compiles it.
  zsh_dir="$(bash demos/zsh/prepare-zsh.sh)"
  node scripts/build-source-tar.mjs "${static_dir}/zsh/zsh.tar.gz" "${zsh_dir}" /tmp/zsh
fi
