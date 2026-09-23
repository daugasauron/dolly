#!/usr/bin/env bash
set -euo pipefail
cd /src
export PATH="/src/.cache/0ad/bin:$PATH"
export EMCC_CORES=2
printf 'int dolly_ports;\n' > .cache/0ad/ports.c
emcc -m64 -pthread -fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=0 -sSUPPORT_LONGJMP=wasm \
  -sUSE_ICU=1 -sUSE_BOOST_HEADERS=1 -sUSE_FREETYPE=1 -sUSE_LIBPNG=1 \
  -sUSE_OGG=1 -sUSE_VORBIS=1 -c .cache/0ad/ports.c -o .cache/0ad/ports.o

common=(-DCMAKE_TOOLCHAIN_FILE=/src/toolchain/0ad/wasm64.cmake -DCMAKE_INSTALL_PREFIX=/src/.cache/0ad/sysroot -DCMAKE_INSTALL_LIBDIR=lib -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_FLAGS_RELEASE=-O1 -DCMAKE_CXX_FLAGS_RELEASE=-O1 -DBUILD_SHARED_LIBS=OFF)
cmake -S .cache/0ad/fmt-7.1.3 -B .cache/0ad/build-fmt "${common[@]}" -DFMT_TEST=OFF -DFMT_DOC=OFF
cmake --build .cache/0ad/build-fmt -j2
cmake --install .cache/0ad/build-fmt
cmake -S .cache/0ad/libxml2-2.13.5 -B .cache/0ad/build-xml2 "${common[@]}" -DLIBXML2_WITH_PYTHON=OFF -DLIBXML2_WITH_TESTS=OFF -DLIBXML2_WITH_PROGRAMS=OFF -DLIBXML2_WITH_THREADS=OFF -DLIBXML2_WITH_LZMA=OFF -DLIBXML2_WITH_HTTP=OFF -DLIBXML2_WITH_ZLIB=ON -DZLIB_INCLUDE_DIR=/src/.cache/0ad/sysroot/include -DZLIB_LIBRARY=/src/.cache/0ad/sysroot/lib/libz.a
cmake --build .cache/0ad/build-xml2 -j2
cmake --install .cache/0ad/build-xml2
cmake -S .cache/0ad/enet-1.3.18 -B .cache/0ad/build-enet "${common[@]}"
cmake --build .cache/0ad/build-enet -j2
cmake --install .cache/0ad/build-enet
sdl_source="/src/$(cat .cache/0ad/sdl2-source.path)"
cmake -S "$sdl_source" -B .cache/0ad/build-sdl2 "${common[@]}" '-DCMAKE_C_FLAGS=-m64 -matomics -mbulk-memory -DDOLLY -U__EMSCRIPTEN__ -I/src/include' -DSDL_SHARED=OFF -DSDL_STATIC=ON -DSDL_TEST=OFF -DSDL_TESTS=OFF -DSDL_AUDIO=OFF -DSDL_JOYSTICK=OFF -DSDL_HAPTIC=OFF -DSDL_SENSOR=OFF -DSDL_THREADS=OFF -DSDL_LOADSO=OFF -DSDL_POWER=OFF -DSDL_HIDAPI=OFF -DSDL_ASSEMBLY=OFF -DSDL_GCC_ATOMICS=ON -DSDL_SYSTEM_ICONV=OFF -DSDL_OPENGL=OFF -DSDL_OPENGLES=OFF -DSDL_VULKAN=OFF -DSDL_RENDER_METAL=OFF
cmake --build .cache/0ad/build-sdl2 -j2
cmake --install .cache/0ad/build-sdl2

# Rebuild setjmp users: SDK port archives contain legacy Wasm EH.
cmake -S .cache/emscripten/ports/libpng/libpng-1.6.58 -B .cache/0ad/build-png "${common[@]}" -DPNG_SHARED=OFF -DPNG_TESTS=OFF -DPNG_TOOLS=OFF -DPNG_EXECUTABLES=OFF
cmake --build .cache/0ad/build-png -j2
cmake --install .cache/0ad/build-png
cmake -S .cache/emscripten/ports/freetype/freetype-VER-2-14-3 -B .cache/0ad/build-freetype "${common[@]}" -DFT_DISABLE_BZIP2=ON -DFT_DISABLE_HARFBUZZ=ON -DFT_DISABLE_BROTLI=ON -DFT_REQUIRE_ZLIB=ON -DFT_REQUIRE_PNG=ON -DPNG_PNG_INCLUDE_DIR=/src/.cache/0ad/sysroot/include -DPNG_LIBRARY_RELEASE=/src/.cache/0ad/sysroot/lib/libpng16.a
cmake --build .cache/0ad/build-freetype -j2
cmake --install .cache/0ad/build-freetype

unset EMSCRIPTEN
cd /src/.cache/0ad/libsodium-1.0.20
export CC=emcc AR=emar RANLIB=emranlib
export CFLAGS='-m64 -O1 -matomics -mbulk-memory -fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=0 -sSUPPORT_LONGJMP=wasm -DDOLLY -DHAVE_LINUX_COMPATIBLE_GETRANDOM'
./configure --host=wasm64-unknown-emscripten --prefix=/src/.cache/0ad/sysroot --disable-shared --enable-static --disable-asm --disable-pie --disable-ssp --without-pthreads --disable-blocking-random
make -j2
make install
