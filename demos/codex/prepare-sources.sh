# Sourced by scripts/prepare-image-sources.sh.
if has_image codex-build; then
  python3 demos/codex/prepare-codex-sources.py
  for part in build/codex-source-parts/*.part; do
    copy_static "${part}" "codex/$(basename "${part}")"
  done
  copy_static demos/codex/config/no-js.c codex/no-js.c
  copy_static demos/codex/config/patti.toml codex/patti.toml
fi
if has_image codex-cli; then
  copy_static demos/codex/launch.c codex/launch.c
  copy_static demos/codex/config.toml codex/config.toml
fi
