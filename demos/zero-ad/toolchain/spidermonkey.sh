#!/usr/bin/env bash
set -euo pipefail
cd /src
source config/source-pins.sh
export PATH="/src/.cache/0ad/bin:/src/.cache/0ad/host-tools/bin:/src/.cache/0ad/toolchain/bin:/emsdk/upstream/bin:$PATH"
export MOZCONFIG=/dev/null MOZBUILD_STATE_PATH=/src/.cache/0ad/mozbuild-state
export MACH_BUILD_PYTHON_NATIVE_PACKAGE_SOURCE=none
export RUSTC_BOOTSTRAP=1 RUST_TARGET_PATH=/src/demos/rust/toolchain CRATE_CC_NO_DEFAULTS=1
export CARGO_HOME=/src/.cache/0ad/cargo-home
export CC='/emsdk/upstream/emscripten/emcc -m64 -D__wasi__ -matomics -mbulk-memory -fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=0'
export CXX='/emsdk/upstream/emscripten/em++ -m64 -D__wasi__ -matomics -mbulk-memory -fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=0'
export HOST_CC=/usr/bin/gcc HOST_CXX=/usr/bin/g++
export AR=/emsdk/upstream/bin/llvm-ar RANLIB=/emsdk/upstream/bin/llvm-ranlib
export RUST_TARGET=wasm64-emscripten-probe
export RUSTC=/src/demos/zero-ad/toolchain/rustc.sh CARGO=/src/.cache/0ad/toolchain/bin/cargo

cd /src/.cache/0ad/zlib
./configure --static --prefix=/src/.cache/0ad/sysroot
make -j2
make install

cd "/src/.cache/0ad/0ad-$DOLLY_0AD_VERSION/libraries/source/spidermonkey/mozjs-128.13.0"
mkdir -p obj-dolly
cd obj-dolly
/usr/bin/python3 ../configure.py --enable-project=js --target=wasm64-unknown-wasi \
  --disable-jit --disable-shared-js --without-intl-api --disable-tests \
  --disable-js-shell --disable-jemalloc --disable-debug '--enable-optimize=-O2 -msimd128' \
  --disable-bootstrap --disable-warnings-as-errors
make -j2
