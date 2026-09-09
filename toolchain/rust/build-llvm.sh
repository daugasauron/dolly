#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
cd "${project_dir}"
port_dir="${project_dir}/build/rustc-port"
llvm_revision=52ed14fcd56afc30f9cccd8ca8ce237c2eef7e04
if [[ ! -f "${port_dir}/llvm-source/llvm/CMakeLists.txt" ]]; then
  if [[ ! -f "${port_dir}/llvm-source.tar.gz" ]]; then
    curl --retry 2 -fL "https://github.com/rust-lang/llvm-project/archive/${llvm_revision}.tar.gz" \
      -o "${port_dir}/llvm-source.tar.gz"
  fi
  printf '%s  %s\n' \
    27f31a6639023d90cd754c1de42d8f9d77cc0c3deff37896f88c1346c6c3f396 \
    "${port_dir}/llvm-source.tar.gz" | sha256sum -c -
  mkdir -p "${port_dir}/llvm-source"
  tar -xzf "${port_dir}/llvm-source.tar.gz" --strip-components=1 \
    -C "${port_dir}/llvm-source" \
    "llvm-project-${llvm_revision}/llvm" \
    "llvm-project-${llvm_revision}/cmake" \
    "llvm-project-${llvm_revision}/third-party"
fi
container=(podman run --rm --userns=keep-id -v "${project_dir}:/src" -w /src "${DOLLY_EMSDK_IMAGE}")
common=(
  -G 'Unix Makefiles' -DCMAKE_BUILD_TYPE=Release -DLLVM_TARGETS_TO_BUILD=WebAssembly
  -DLLVM_INCLUDE_TESTS=OFF -DLLVM_INCLUDE_EXAMPLES=OFF
  -DLLVM_INCLUDE_BENCHMARKS=OFF -DLLVM_INCLUDE_DOCS=OFF
  -DLLVM_ENABLE_TERMINFO=OFF -DLLVM_ENABLE_ZLIB=OFF -DLLVM_ENABLE_ZSTD=OFF
  -DLLVM_ENABLE_LIBXML2=OFF -DLLVM_ENABLE_BINDINGS=OFF -DLLVM_ENABLE_CURL=OFF
)
"${container[@]}" cmake -S build/rustc-port/llvm-source/llvm \
  -B build/rustc-port/llvm-native "${common[@]}"
"${container[@]}" cmake --build build/rustc-port/llvm-native \
  --target llvm-tblgen llvm-config --parallel 4
"${container[@]}" /emsdk/upstream/emscripten/emcmake cmake \
  -S build/rustc-port/llvm-source/llvm -B build/rustc-port/llvm-wasm "${common[@]}" \
  -DCMAKE_C_FLAGS='-m64 -O2 -fPIC -matomics -mbulk-memory -fwasm-exceptions -sSUPPORT_LONGJMP=wasm -sWASM_LEGACY_EXCEPTIONS=0' \
  -DCMAKE_CXX_FLAGS='-m64 -O2 -fPIC -matomics -mbulk-memory -fwasm-exceptions -sSUPPORT_LONGJMP=wasm -sWASM_LEGACY_EXCEPTIONS=0' \
  -DCMAKE_POSITION_INDEPENDENT_CODE=ON -DLLVM_ENABLE_THREADS=OFF \
  -DLLVM_HOST_TRIPLE=wasm64-unknown-emscripten \
  -DLLVM_DEFAULT_TARGET_TRIPLE=wasm64-unknown-emscripten \
  -DLLVM_TABLEGEN=/src/build/rustc-port/llvm-native/bin/llvm-tblgen \
  -DLLVM_BUILD_LLVM_DYLIB=OFF -DLLVM_LINK_LLVM_DYLIB=OFF
"${container[@]}" cmake --build build/rustc-port/llvm-wasm --parallel 4 \
  --target LLVMipo LLVMBitReader LLVMBitWriter LLVMLinker LLVMAsmParser \
  LLVMLTO LLVMCoverage LLVMInstrumentation LLVMWebAssemblyCodeGen \
  LLVMWebAssemblyAsmParser LLVMWebAssemblyDisassembler
"${container[@]}" c++ -std=c++17 -O2 \
  -Ibuild/rustc-port/llvm-wasm/tools/llvm-config \
  -Ibuild/rustc-port/llvm-native/include -Ibuild/rustc-port/llvm-source/llvm/include \
  build/rustc-port/llvm-source/llvm/tools/llvm-config/llvm-config.cpp \
  build/rustc-port/llvm-native/lib/libLLVMTargetParser.a \
  build/rustc-port/llvm-native/lib/libLLVMSupport.a \
  build/rustc-port/llvm-native/lib/libLLVMDemangle.a \
  -lrt -ldl -lm -o build/rustc-port/llvm-wasm/bin/llvm-config-host
