#!/usr/bin/env bash
set -euo pipefail
cd /src
export EMCC_CORES=2
cmake --fresh -S "$(cat .cache/0ad/openal-source.path)" -B .cache/0ad/build-openal \
 -DCMAKE_TOOLCHAIN_FILE=/src/demos/zero-ad/toolchain/wasm64.cmake \
 -DCMAKE_INSTALL_PREFIX=/src/.cache/0ad/sysroot -DCMAKE_INSTALL_LIBDIR=lib \
 -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_FLAGS_RELEASE=-O1 '-DCMAKE_CXX_FLAGS_RELEASE=-O1 -DDOLLY -D__STDC_NO_THREADS__=1 -include cstdlib' \
 -DLIBTYPE=STATIC -DALSOFT_UTILS=OFF -DALSOFT_EXAMPLES=OFF -DALSOFT_TESTS=OFF \
 -DALSOFT_DLOPEN=OFF -DALSOFT_EAX=OFF -DALSOFT_BACKEND_PIPEWIRE=OFF \
 -DALSOFT_BACKEND_PULSEAUDIO=OFF -DALSOFT_BACKEND_ALSA=OFF -DALSOFT_BACKEND_OSS=OFF \
 -DALSOFT_BACKEND_SOLARIS=OFF -DALSOFT_BACKEND_SNDIO=OFF -DALSOFT_BACKEND_JACK=OFF \
 -DALSOFT_BACKEND_PORTAUDIO=OFF -DALSOFT_BACKEND_SDL2=OFF -DALSOFT_BACKEND_SDL3=OFF \
 -DALSOFT_BACKEND_WAVE=OFF -DALSOFT_INSTALL_HRTF_DATA=OFF -DALSOFT_INSTALL_AMBDEC_PRESETS=OFF \
 -DALSOFT_UPDATE_BUILD_VERSION=OFF
cmake --build .cache/0ad/build-openal -j2
cmake --install .cache/0ad/build-openal
em++ -m64 -O1 -matomics -mbulk-memory -fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=0 \
  -sSUPPORT_LONGJMP=wasm -I.cache/0ad/sysroot/include \
  -c demos/zero-ad/test/fixtures/0ad-openal.cpp -o .cache/0ad/openal-check.o
