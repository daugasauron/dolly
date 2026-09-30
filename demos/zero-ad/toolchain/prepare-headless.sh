#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/../../.."
source config/source-pins.sh
archive=".cache/0ad/0ad-$DOLLY_0AD_VERSION-unix-data.tar.xz"
bash scripts/fetch-verified-file.sh "$DOLLY_0AD_DATA_URL" "$DOLLY_0AD_DATA_SHA256" "$archive" >/dev/null
root=".cache/0ad/0ad-$DOLLY_0AD_VERSION"
if [[ ! -f "$root/binaries/data/mods/public/public.zip" ]]; then
  tar -xf "$archive" -C .cache/0ad
fi
python3 demos/zero-ad/toolchain/package-headless.py "$root"
