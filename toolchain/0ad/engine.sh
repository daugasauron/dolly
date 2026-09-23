#!/usr/bin/env bash
set -euo pipefail
cd /src
source config/source-pins.sh
export PATH="/src/.cache/0ad/bin:$PATH"
export CC='emcc -m64' CXX=em++ PKG_CONFIG=/src/.cache/0ad/bin/pkg-config
export CFLAGS='-isystem /src/.cache/0ad/sysroot/include'
export CXXFLAGS="$CFLAGS"
root="/src/.cache/0ad/0ad-$DOLLY_0AD_VERSION"
prefix=/src/.cache/0ad/sysroot
sm="$root/libraries/source/spidermonkey/mozjs-128.13.0/obj-dolly"
sdk=/emsdk/upstream/emscripten/cache/sysroot
curl_source="/src/$(cat .cache/0ad/curl-source.path)"
write_pc() {
  cat > "$prefix/lib/pkgconfig/$1.pc" <<PC
Name: $1
Description: Dolly wasm64 $1
Version: $2
Cflags: $3
Libs: $4
PC
}
write_pc libenet 1.3.18 "-I$prefix/include" "-L$prefix/lib/static -lenet"
write_pc icu-uc 68.2 '-DU_STATIC_IMPLEMENTATION' "-L$sdk/lib/wasm64-emscripten -licu_common-mt -licu_stubdata-mt"
write_pc icu-i18n 68.2 '-DU_STATIC_IMPLEMENTATION' "-L$sdk/lib/wasm64-emscripten -licu_i18n-mt -licu_common-mt -licu_stubdata-mt"
write_pc mozjs-128 128.13.0 "-I$sm/dist/include" "-L$sm/js/src/build -ljs_static -L$sm/wasm64-emscripten-probe/release -ljsrust"
write_pc libcurl "$DOLLY_CURL_VERSION" "-I$curl_source/include" "-L$prefix/lib -lcurl"
emcc -m64 -O1 -matomics -mbulk-memory -Iinclude -I"$curl_source/include" \
  -c src/libcurl-fetch.c -o .cache/0ad/libcurl-fetch.o
emar crs "$prefix/lib/libcurl.a" .cache/0ad/libcurl-fetch.o
cd "$root/build/premake"
/src/.cache/0ad/premake-core-5.0.0-beta7/bin/release/premake5 --os=emscripten \
  --without-atlas --without-audio --without-nvtt --without-lobby --without-miniupnpc \
  --without-pch --without-tests --without-dap-interface --with-system-mozjs \
  --minimal-flags --outpath=../workspaces/dolly gmake
cd ../workspaces/dolly
make config=release -j2 mocks_real network rlinterface tinygettext lobby simulation2 \
  scriptinterface engine graphics atlas gui lowlevel gladwrapper mongoose
make -f pyrogenesis.make config=release -j2 obj/pyrogenesis_Release/main.o
