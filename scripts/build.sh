#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
image="${DOLLY_EMSDK_IMAGE}"
lua_artifact="lua-${DOLLY_LUA_VERSION}.wasm"

if command -v podman >/dev/null 2>&1; then
  container=(podman run --rm --userns=keep-id -v "${project_dir}:/src" -w /src "${image}")
elif command -v docker >/dev/null 2>&1; then
  container=(docker run --rm -u "$(id -u):$(id -g)" -v "${project_dir}:/src" -w /src "${image}")
else
  echo "dolly: podman or docker is required to run the pinned Emscripten toolchain" >&2
  exit 1
fi

mkdir -p \
  "${project_dir}/build" \
  "${project_dir}/build/generated" \
  "${project_dir}/dist" \
  "${project_dir}/.cache/emscripten"

if [[ ! -f "${project_dir}/node_modules/ghostty-web/dist/ghostty-web.js" ]]; then
  echo "dolly: run npm install before building" >&2
  exit 1
fi

if [[ ! -f "${project_dir}/.cache/llvm-wasm/lib/libclangFrontend.a" ||
      ! -f "${project_dir}/.cache/llvm-wasm/lib/liblldWasm.a" ]]; then
  echo "dolly: run ./scripts/build-toolchain.sh before building" >&2
  exit 1
fi

sbase_dir="$("${project_dir}/scripts/fetch-sbase.sh")"
sbase_container_dir="/src/${sbase_dir#"${project_dir}/"}"
awk_dir="$("${project_dir}/scripts/fetch-awk.sh")"
awk_container_dir="/src/${awk_dir#"${project_dir}/"}"
awk_generated_dir="$("${project_dir}/scripts/generate-awk.sh")"
awk_generated_container_dir="/src/${awk_generated_dir#"${project_dir}/"}"
quickjs_dir="$("${project_dir}/scripts/fetch-quickjs.sh")"
quickjs_container_dir="/src/${quickjs_dir#"${project_dir}/"}"
curl_dir="$("${project_dir}/scripts/fetch-curl.sh")"
curl_container_dir="/src/${curl_dir#"${project_dir}/"}"
zlib_dir="$("${project_dir}/scripts/prepare-zlib.sh")"
zlib_container_dir="/src/${zlib_dir#"${project_dir}/"}"
git_dir="$("${project_dir}/scripts/prepare-git.sh")"
git_container_dir="/src/${git_dir#"${project_dir}/"}"
make_dir="$("${project_dir}/scripts/prepare-make.sh")"
make_container_dir="/src/${make_dir#"${project_dir}/"}"
zig_dir="$("${project_dir}/scripts/fetch-zig.sh")"
zig_container_dir="/src/${zig_dir#"${project_dir}/"}"
wamr_dir="$("${project_dir}/scripts/fetch-wamr.sh")"
wamr_container_dir="/src/${wamr_dir#"${project_dir}/"}"
ghostty_checkout="$("${project_dir}/scripts/fetch-ghostty.sh")"
ghostty_dir="$("${project_dir}/scripts/prepare-ghostty-source.sh" "${ghostty_checkout}")"
ghostty_container_dir="/src/${ghostty_dir#"${project_dir}/"}"
uucode_dir="$("${project_dir}/scripts/fetch-uucode.sh")"
uucode_container_dir="/src/${uucode_dir#"${project_dir}/"}"

DOLLY_PI_VERSION="${DOLLY_PI_VERSION}" \
DOLLY_ESBUILD_VERSION="${DOLLY_ESBUILD_VERSION}" \
  node "${project_dir}/scripts/build-pi.mjs"

if [[ "${container[0]}" == "podman" ]]; then
  container=(podman run --rm --userns=keep-id \
    -v "${project_dir}:/src" \
    -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache" \
    -w /src "${image}")
else
  container=(docker run --rm -u "$(id -u):$(id -g)" \
    -v "${project_dir}:/src" \
    -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache" \
    -w /src "${image}")
fi

rm -f \
  "${project_dir}/dist/dolly.data" \
  "${project_dir}/dist/dolly.mjs" \
  "${project_dir}/dist/dolly.wasm" \
  "${project_dir}/dist/dolly-0.wasm" \
  "${project_dir}/dist/dolly-http-0.wasm" \
  "${project_dir}/dist/dolly-terminal-0.wasm" \
  "${project_dir}/dist/ghostty-web.js" \
  "${project_dir}/dist/IosevkaTerm-SemiBold.woff2" \
  "${project_dir}/dist/${lua_artifact}" \
  "${project_dir}/dist/program-cpp.wasm" \
  "${project_dir}/dist/program-inspector.wasm" \
  "${project_dir}/dist/program-ls.wasm" \
  "${project_dir}/dist/program-reader.wasm" \
  "${project_dir}/dist/program-writer.wasm"

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-0.wat \
  --enable-memory64 \
  --enable-reference-types \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-0.wasm

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-terminal-0.wat \
  --enable-memory64 \
  --enable-reference-types \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-terminal-0.wasm

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-http-0.wat \
  --enable-memory64 \
  --enable-reference-types \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-http-0.wasm

./bin/dolly-cc src/program-writer.c -o build/program-writer.wasm
./bin/dolly-cc src/program-reader.c -o build/program-reader.wasm
./bin/dolly-cc src/program-inspector.c -o build/program-inspector.wasm
./scripts/build-lua.sh

node scripts/dolly-abi.mjs emit-emscripten-exports \
  build/dolly-0.wasm \
  build/runtime-exports.json
node scripts/dolly-abi.mjs emit-digest-header \
  build/dolly-0.wasm \
  build/generated/dolly-abi-digest.h

"${container[@]}" /emsdk/upstream/emscripten/emcmake cmake \
  -S toolchain \
  -B build/runtime \
  -DCMAKE_BUILD_TYPE=Release \
  -DLLVM_DIR=/src/.cache/llvm-wasm/lib/cmake/llvm \
  -DClang_DIR=/src/.cache/llvm-wasm/lib/cmake/clang \
  -DLLD_DIR=/src/.cache/llvm-wasm/lib/cmake/lld \
  -DDOLLY_SBASE_DIR="${sbase_container_dir}" \
  -DDOLLY_AWK_DIR="${awk_container_dir}" \
  -DDOLLY_AWK_GENERATED_DIR="${awk_generated_container_dir}" \
  -DDOLLY_QUICKJS_DIR="${quickjs_container_dir}" \
  -DDOLLY_CURL_DIR="${curl_container_dir}" \
  -DDOLLY_ZLIB_DIR="${zlib_container_dir}" \
  -DDOLLY_GIT_DIR="${git_container_dir}" \
  -DDOLLY_MAKE_DIR="${make_container_dir}" \
  -DDOLLY_ZIG_DIR="${zig_container_dir}" \
  -DDOLLY_WAMR_DIR="${wamr_container_dir}" \
  -DDOLLY_GHOSTTY_DIR="${ghostty_container_dir}" \
  -DDOLLY_UUCODE_DIR="${uucode_container_dir}" \
  -DDOLLY_LUA_WASM="/src/build/${lua_artifact}"
"${container[@]}" cmake --build build/runtime --parallel

node scripts/dolly-abi.mjs stamp \
  build/dolly-0.wasm \
  dist/dolly.wasm
node scripts/dolly-abi.mjs validate-runtime \
  build/dolly-0.wasm \
  dist/dolly.wasm

cp build/dolly-0.wasm dist/dolly-0.wasm
cp build/dolly-terminal-0.wasm dist/dolly-terminal-0.wasm
cp build/dolly-http-0.wasm dist/dolly-http-0.wasm
cp build/program-writer.wasm dist/program-writer.wasm
cp build/program-reader.wasm dist/program-reader.wasm
cp build/program-inspector.wasm dist/program-inspector.wasm
cp "build/${lua_artifact}" "dist/${lua_artifact}"
cp node_modules/ghostty-web/dist/ghostty-web.js dist/ghostty-web.js
font_path="$(bash scripts/fetch-iosevka.sh)"
cp "${font_path}" dist/IosevkaTerm-SemiBold.woff2
