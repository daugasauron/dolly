#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/../.."
source config/source-pins.sh
cache="$PWD/.cache/0ad"
name="naga-cli-$DOLLY_0AD_NAGA_VERSION"
bash scripts/fetch-verified-file.sh "https://static.crates.io/crates/naga-cli/$name.crate" \
  "$DOLLY_0AD_NAGA_SHA256" "$cache/downloads/$name.crate" >/dev/null
if [[ ! -d "$cache/$name" ]]; then tar -xf "$cache/downloads/$name.crate" -C "$cache"; fi
if [[ ! -f "$cache/host-tools/.naga-source" || "$(cat "$cache/host-tools/.naga-source")" != "$DOLLY_0AD_NAGA_SHA256" ]]; then
  systemd-run --user --scope --quiet -p MemoryMax=4G -p MemorySwapMax=0 \
    env CARGO_HOME="$cache/cargo-home" RUSTC="$cache/toolchain/bin/rustc" CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1 \
    "$cache/toolchain/bin/cargo" install --path "$cache/$name" --locked --force --root "$cache/host-tools" -j2
  printf '%s\n' "$DOLLY_0AD_NAGA_SHA256" > "$cache/host-tools/.naga-source"
fi
python3 toolchain/0ad/convert-shaders.py "$cache/0ad-$DOLLY_0AD_VERSION" "$cache/host-tools/bin/naga" build/0ad/shaders
