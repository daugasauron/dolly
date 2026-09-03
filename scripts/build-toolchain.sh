#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
llvm_commit="${DOLLY_LLVM_COMMIT}"
image="${DOLLY_EMSDK_IMAGE}"
source_dir="${project_dir}/.cache/llvm-project"
host_dir="${project_dir}/.cache/llvm-host"
wasm_dir="${project_dir}/.cache/llvm-wasm"
toolchain_key="$("${project_dir}/scripts/toolchain-cache-key.sh")"
toolchain_stamp="${wasm_dir}/.dolly-toolchain-key"

jobs="${DOLLY_BUILD_JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)}"
if ((jobs > 12)); then jobs=12; fi

mkdir -p "${project_dir}/.cache" "${project_dir}/.cache/emscripten"

if command -v podman >/dev/null 2>&1; then
  container=(podman run --rm --userns=keep-id
    -v "${project_dir}:/src"
    -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache"
    -w /src "${image}")
elif command -v docker >/dev/null 2>&1; then
  container=(docker run --rm -u "$(id -u):$(id -g)"
    -v "${project_dir}:/src"
    -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache"
    -w /src "${image}")
else
  echo "dolly: podman or docker is required to build the seed toolchain" >&2
  exit 1
fi

if [[ ! -d "${source_dir}/.git" ]]; then
  git init "${source_dir}"
  git -C "${source_dir}" remote add origin "${DOLLY_LLVM_URL}"
  git -C "${source_dir}" sparse-checkout init --cone
  git -C "${source_dir}" sparse-checkout set llvm clang lld cmake third-party
  git -C "${source_dir}" fetch --depth=1 origin "${llvm_commit}"
  git -C "${source_dir}" checkout --detach FETCH_HEAD
fi

actual_commit="$(git -C "${source_dir}" rev-parse HEAD)"
if [[ "${actual_commit}" != "${llvm_commit}" ]]; then
  echo "dolly: ${source_dir} is at ${actual_commit}, expected ${llvm_commit}" >&2
  echo "dolly: move that cache aside and run this script again" >&2
  exit 1
fi

lld_patch="${project_dir}/config/lld-dolly.patch"
if patch --batch --forward --fuzz=0 --dry-run -d "${source_dir}" -p1 \
    < "${lld_patch}" >/dev/null 2>&1; then
  patch --batch --forward --fuzz=0 -d "${source_dir}" -p1 \
    < "${lld_patch}" >/dev/null
elif ! patch --batch --reverse --fuzz=0 --dry-run -d "${source_dir}" -p1 \
    < "${lld_patch}" >/dev/null 2>&1; then
  echo "dolly: LLVM source does not match the pinned LLD target patch" >&2
  exit 1
fi

if [[ ! -x "${host_dir}/bin/llvm-tblgen" ||
      ! -x "${host_dir}/bin/clang-tblgen" ]]; then
  "${container[@]}" cmake \
    -S .cache/llvm-project/llvm \
    -B .cache/llvm-host \
    -DCMAKE_BUILD_TYPE=Release \
    -DLLVM_ENABLE_PROJECTS=clang \
    -DLLVM_TARGETS_TO_BUILD=WebAssembly \
    -DLLVM_INCLUDE_TESTS=OFF \
    -DLLVM_INCLUDE_EXAMPLES=OFF \
    -DLLVM_INCLUDE_BENCHMARKS=OFF \
    -DLLVM_INCLUDE_DOCS=OFF \
    -DLLVM_ENABLE_TERMINFO=OFF \
    -DLLVM_ENABLE_ZLIB=OFF \
    -DLLVM_ENABLE_ZSTD=OFF \
    -DLLVM_ENABLE_LIBXML2=OFF \
    -DLLVM_ENABLE_BINDINGS=OFF
  "${container[@]}" cmake --build .cache/llvm-host \
    --target llvm-tblgen clang-tblgen --parallel "${jobs}"
fi

"${container[@]}" /emsdk/upstream/emscripten/emcmake cmake \
  -S .cache/llvm-project/llvm \
  -B .cache/llvm-wasm \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_FLAGS="-m64 -O2 -fPIC -matomics -mbulk-memory" \
  -DCMAKE_CXX_FLAGS="-m64 -O2 -fPIC -matomics -mbulk-memory" \
  -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
  -DLLVM_ENABLE_PROJECTS="clang;lld" \
  -DLLVM_TARGETS_TO_BUILD=WebAssembly \
  -DLLVM_HOST_TRIPLE=wasm64-unknown-emscripten \
  -DLLVM_DEFAULT_TARGET_TRIPLE=wasm64-unknown-emscripten \
  -DLLVM_TABLEGEN=/src/.cache/llvm-host/bin/llvm-tblgen \
  -DCLANG_TABLEGEN=/src/.cache/llvm-host/bin/clang-tblgen \
  -DLLVM_ENABLE_THREADS=OFF \
  -DLLVM_INCLUDE_TESTS=OFF \
  -DLLVM_INCLUDE_EXAMPLES=OFF \
  -DLLVM_INCLUDE_BENCHMARKS=OFF \
  -DLLVM_INCLUDE_DOCS=OFF \
  -DLLVM_ENABLE_TERMINFO=OFF \
  -DLLVM_ENABLE_LIBEDIT=OFF \
  -DLLVM_ENABLE_LIBPFM=OFF \
  -DLLVM_ENABLE_ZLIB=OFF \
  -DLLVM_ENABLE_ZSTD=OFF \
  -DLLVM_ENABLE_LIBXML2=OFF \
  -DLLVM_ENABLE_CURL=OFF \
  -DLLVM_ENABLE_BINDINGS=OFF \
  -DLLVM_BUILD_LLVM_DYLIB=OFF \
  -DLLVM_LINK_LLVM_DYLIB=OFF

"${container[@]}" cmake --build .cache/llvm-wasm \
  --target clangFrontendTool clangCodeGen lldWasm LLVMWebAssemblyCodeGen \
  --parallel "${jobs}"

temporary_stamp="$(mktemp "${wasm_dir}/.dolly-toolchain-key.XXXXXX")"
cleanup_stamp() {
  rm -f -- "${temporary_stamp}"
}
trap cleanup_stamp EXIT
printf '%s\n' "${toolchain_key}" > "${temporary_stamp}"
mv -T -- "${temporary_stamp}" "${toolchain_stamp}"
trap - EXIT

echo "dolly: current wasm64 Clang/LLD seed toolchain is ready"
