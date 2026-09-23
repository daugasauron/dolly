#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/../.."
source config/source-pins.sh
cache="$PWD/.cache/0ad"
source_dir="$cache/0ad-$DOLLY_0AD_VERSION"
mkdir -p "$cache/cmake/Platform"
cp config/cmake/Dolly.cmake "$cache/cmake/Platform/Dolly.cmake"
while read -r name url checksum; do
  bash scripts/fetch-verified-file.sh "$url" "$checksum" "$cache/downloads/$name" >/dev/null
  directory="${name%.tar.*}"
  if [[ ! -d "$cache/$directory" ]]; then
    tar -xf "$cache/downloads/$name" -C "$cache"
  fi
done < toolchain/0ad/dependencies.tsv
apply_patch() {
  local directory="$1" patch_file="$2" key
  key="$(sha256sum "$patch_file" | cut -d' ' -f1)"
  if [[ ! -f "$directory/.dolly-engine-patch" || "$(cat "$directory/.dolly-engine-patch")" != "$key" ]]; then
    if patch --reverse --dry-run --batch --fuzz=0 -d "$directory" -p1 < "$patch_file" >/dev/null 2>&1; then
      : # Adopt an already patched development checkout after verifying every hunk.
    elif [[ -f "$directory/.dolly-engine-patch" ]]; then
      echo "Patch changed; prepare a fresh $directory directory." >&2
      exit 1
    else
      patch --batch --fuzz=0 -d "$directory" -p1 < "$patch_file"
    fi
  fi
  printf '%s\n' "$key" > "$directory/.dolly-engine-patch"
}
apply_patch "$source_dir" toolchain/0ad/engine.patch
apply_patch "$cache/libsodium-1.0.20" toolchain/0ad/sodium.patch
apply_patch "$cache/openal-soft-1.24.3" toolchain/0ad/openal.patch
premake="$cache/premake-core-5.0.0-beta7"
if [[ ! -d "$premake" ]]; then
  tar -xf "$source_dir/libraries/source/premake/premake-core-5.0.0-beta7.tar.gz" -C "$cache"
fi
if [[ ! -x "$premake/bin/release/premake5" ]]; then
  systemd-run --user --scope --quiet -p MemoryMax=2G -p MemorySwapMax=0 \
    make -C "$premake" -f Bootstrap.mak PREMAKE_OPTS='--curl-src=none --zlib-src=none' linux -j2
fi
curl_source="$(bash scripts/fetch-pinned-checkout.sh curl)"
sdl_source="$(bash scripts/prepare-sdl2.sh)"
printf '%s\n' "${curl_source#"$PWD/"}" > "$cache/curl-source.path"
printf '%s\n' "${sdl_source#"$PWD/"}" > "$cache/sdl2-source.path"
