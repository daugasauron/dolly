#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/../.."
source config/source-pins.sh
mkdir -p .cache/0ad
bash toolchain/0ad/prepare.sh > .cache/0ad/prepare.log 2>&1
podman run --rm --pull=never --network=none --memory=4g --memory-swap=4g \
  --userns=keep-id -v "$PWD:/src" -v "$PWD/.cache/emscripten:/emsdk/upstream/emscripten/cache" \
  -w /src "$DOLLY_EMSDK_IMAGE" bash toolchain/0ad/spidermonkey.sh > .cache/0ad/build-sm.log 2>&1
sm=".cache/0ad/0ad-$DOLLY_0AD_VERSION/libraries/source/spidermonkey/mozjs-128.13.0/obj-dolly"
bash toolchain/0ad/link.sh build/0ad/spidermonkey-check.wasm \
  .cache/0ad/spidermonkey-check.o "$sm/js/src/build/libjs_static.a" \
  "$sm/wasm64-emscripten-probe/release/libjsrust.a" .cache/0ad/sysroot/lib/libz.a
