#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/../../.."
source config/source-pins.sh
bash demos/zero-ad/toolchain/build-spidermonkey.sh
bash demos/zero-ad/toolchain/prepare-engine.sh > .cache/0ad/prepare-engine.log 2>&1
container=(podman run --rm --pull=never --memory=4g --memory-swap=4g --userns=keep-id
  -v "$PWD:/src" -v "$PWD/.cache/emscripten:/emsdk/upstream/emscripten/cache" -w /src)
# SDK ports fetch archives verified by the pinned Emscripten port recipes.
"${container[@]}" "$DOLLY_EMSDK_IMAGE" bash demos/zero-ad/toolchain/dependencies.sh > .cache/0ad/dependencies.log 2>&1
"${container[@]}" --network=none "$DOLLY_EMSDK_IMAGE" bash demos/zero-ad/toolchain/engine.sh > .cache/0ad/engine-build.log 2>&1
bash demos/zero-ad/toolchain/link-engine.sh > .cache/0ad/engine-link.log 2>&1
