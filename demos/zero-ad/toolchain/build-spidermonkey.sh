#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/../../.."
source config/source-pins.sh
mkdir -p .cache/0ad
bash demos/zero-ad/toolchain/prepare.sh > .cache/0ad/prepare.log 2>&1
podman run --rm --pull=never --network=none --memory=4g --memory-swap=4g \
  --userns=keep-id -v "$PWD:/src" -v "$PWD/.cache/emscripten:/emsdk/upstream/emscripten/cache" \
  -w /src "$DOLLY_EMSDK_IMAGE" bash demos/zero-ad/toolchain/spidermonkey.sh > .cache/0ad/build-sm.log 2>&1
