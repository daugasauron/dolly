#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/../../.."
source config/source-pins.sh
root=".cache/0ad/0ad-$DOLLY_0AD_VERSION"
sm="$root/libraries/source/spidermonkey/mozjs-128.13.0/obj-dolly"
libs=()
for name in mocks_real network rlinterface tinygettext lobby simulation2 scriptinterface engine graphics atlas gui lowlevel gladwrapper mongoose; do
  libs+=("$root/binaries/system/lib$name.a")
done
bash demos/zero-ad/toolchain/link.sh build/0ad/pyrogenesis.wasm \
  "$root/build/workspaces/dolly/obj/pyrogenesis_Release/main.o" "${libs[@]}" \
  -L.cache/0ad/sysroot/lib -L.cache/0ad/sysroot/lib/static \
  -L/emsdk/upstream/emscripten/cache/sysroot/lib/wasm64-emscripten \
  "$sm/js/src/build/libjs_static.a" "$sm/wasm64-emscripten-probe/release/libjsrust.a" \
  -ldollygpu -ldollyaudio -lopenal -lvorbis -logg -lSDL2 -lpng16 -lxml2 -lz -lenet -lcurl \
  -licu_i18n-mt -licu_common-mt -licu_stubdata-mt -lsodium -lfmt -lfreetype
