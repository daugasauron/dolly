#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
image="${DOLLY_EMSDK_IMAGE}"

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

if [[ ! -f "${project_dir}/.cache/llvm-wasm/lib/libclangFrontend.a" ||
      ! -f "${project_dir}/.cache/llvm-wasm/lib/liblldWasm.a" ]]; then
  echo "dolly: run ./scripts/build-toolchain.sh before building" >&2
  exit 1
fi

sbase_dir="$("${project_dir}/scripts/fetch-sbase.sh")"
awk_dir="$("${project_dir}/scripts/fetch-awk.sh")"
awk_generated_dir="$("${project_dir}/scripts/generate-awk.sh")"
quickjs_dir="$("${project_dir}/scripts/fetch-quickjs.sh")"
curl_dir="$("${project_dir}/scripts/fetch-curl.sh")"
zlib_dir="$("${project_dir}/scripts/prepare-zlib.sh")"
git_dir="$("${project_dir}/scripts/prepare-git.sh")"
make_dir="$("${project_dir}/scripts/prepare-make.sh")"
cpython_dir="$("${project_dir}/scripts/prepare-cpython.sh")"
zig_dir="$("${project_dir}/scripts/prepare-zig-native.sh")"
zig_container_dir="/src/${zig_dir#"${project_dir}/"}"
ghostty_checkout="$("${project_dir}/scripts/fetch-ghostty.sh")"
ghostty_dir="$("${project_dir}/scripts/prepare-ghostty-source.sh" "${ghostty_checkout}")"
uucode_dir="$("${project_dir}/scripts/fetch-uucode.sh")"
stb_header="$("${project_dir}/scripts/fetch-stb.sh")"
mapfile -t font_paths < <(bash "${project_dir}/scripts/fetch-iosevka.sh")
web_font="${font_paths[0]}"
runtime_font="${font_paths[1]}"

DOLLY_PI_VERSION="${DOLLY_PI_VERSION}" \
DOLLY_ESBUILD_VERSION="${DOLLY_ESBUILD_VERSION}" \
  node "${project_dir}/scripts/build-pi.mjs"
mapfile -t image_rows < <(node "${project_dir}/scripts/list-images.mjs")
image_outputs=()
for row in "${image_rows[@]}"; do
  IFS=$'\t' read -r image_name _ <<<"${row}"
  image_outputs+=(
    "${project_dir}/dist/dolly-${image_name}-system.snapshot"
    "${project_dir}/dist/dolly-${image_name}-system-snapshot.mjs"
  )
done

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
  "${project_dir}/dist/dolly-display-0.wasm" \
  "${project_dir}/dist/dolly-download-0.wasm" \
  "${project_dir}/dist/dolly-terminal-0.wasm" \
  "${project_dir}/dist/dolly-snapshot-0.wasm" \
  "${project_dir}/dist/dolly-build-id.mjs" \
  "${image_outputs[@]}" \
  "${project_dir}/dist/IosevkaTerm-SemiBold.woff2" \
  "${project_dir}/dist/ghostty-web.js" \
  "${project_dir}/dist/program-inspector.wasm" \
  "${project_dir}/dist/program-reader.wasm" \
  "${project_dir}/dist/program-writer.wasm"

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-0.wat \
  --enable-memory64 \
  --enable-reference-types \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-0.wasm

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-display-0.wat \
  --enable-memory64 \
  --enable-reference-types \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-display-0.wasm

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-http-0.wat \
  --enable-memory64 \
  --enable-reference-types \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-http-0.wasm

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-download-0.wat \
  --enable-memory64 \
  --enable-reference-types \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-download-0.wasm

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-snapshot-0.wat \
  --enable-memory64 \
  --enable-reference-types \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-snapshot-0.wasm

native_zig="$("${project_dir}/scripts/build-native-zig.sh")"

./bin/dolly-cc src/program-writer.c -o build/program-writer.wasm
./bin/dolly-cc src/program-reader.c -o build/program-reader.wasm
./bin/dolly-cc src/program-inspector.c -o build/program-inspector.wasm

static_dir="${project_dir}/dist/static"
rm -rf -- "${static_dir}"
mkdir -p "${static_dir}/bootstrap" "${static_dir}/default" \
  "${static_dir}/gamedev" "${static_dir}/python"

copy_static() {
  local source="$1"
  local destination="$2"
  mkdir -p "$(dirname -- "${static_dir}/${destination}")"
  cp -- "${source}" "${static_dir}/${destination}"
}

copy_static "${project_dir}/src/commands/tar.c" bootstrap/tar.c
copy_static "${project_dir}/src/startup.mk" default/startup.mk
for command in help pwd cd cat echo touch clear ls stat file test bracket mv cp download curl qjs janis pi; do
  copy_static "${project_dir}/src/commands/${command}.c" "default/commands/${command}.c"
done
copy_static "${project_dir}/src/libcurl-fetch.c" default/libcurl-fetch.c
copy_static "${project_dir}/src/runtimes/quickjs-main.c" default/runtimes/quickjs-main.c
copy_static "${project_dir}/src/runtimes/quickjs-runner.h" default/runtimes/quickjs-runner.h
copy_static "${project_dir}/src/runtimes/dolly-node.js" default/runtimes/dolly-node.js
copy_static "${project_dir}/src/runtimes/janis.js" default/runtimes/janis.js
copy_static "${project_dir}/src/pi/dolly-tools.js" default/pi/dolly-tools.js
copy_static "${project_dir}/src/pi/SYSTEM.md" default/pi/SYSTEM.md
copy_static "${project_dir}/src/pi/settings.json" default/pi/settings.json
copy_static "${project_dir}/src/pi/dolly-theme.json" default/pi/dolly-theme.json
copy_static "${project_dir}/src/zig/answer.zig" default/zig/answer.zig
copy_static "${project_dir}/src/zig/check.c" default/zig/check.c
copy_static "${project_dir}/src/zig/object-check.c" default/zig/object-check.c
copy_static "${project_dir}/src/ghostty/check.c" default/ghostty/check.c
copy_static "${project_dir}/src/ghostty/display.c" default/ghostty/display.c
copy_static "${project_dir}/src/program-cpp.cpp" default/cpp-check.cpp
copy_static "${project_dir}/src/program-demo.c" default/demo.c
copy_static "${stb_header}" default/stb_truetype.h
copy_static "${runtime_font}" default/IosevkaTerm-SemiBold.ttf
copy_static "${native_zig}" default/zig.wasm
copy_static "${project_dir}/build/program-writer.wasm" default/writer.wasm
copy_static "${project_dir}/build/program-reader.wasm" default/reader.wasm
copy_static "${project_dir}/build/program-inspector.wasm" default/inspector.wasm
copy_static "${project_dir}/src/gamedev.mk" gamedev/gamedev.mk
copy_static "${project_dir}/src/commands/graphics-demo.c" gamedev/graphics-demo.c
copy_static "${project_dir}/src/runtimes/cpython-platform.c" python/cpython-platform.c
copy_static "${project_dir}/src/runtimes/cpython-main.c" python/cpython-main.c

node scripts/build-source-tar.mjs dist/static/default/make-4.4.1.tar \
  "${make_dir}" /usr/src/make
node scripts/build-source-tar.mjs dist/static/default/zlib.tar \
  "${zlib_dir}" /usr/src/zlib \
  "${zlib_dir}/zlib.h" /usr/include/zlib.h \
  "${zlib_dir}/zconf.h" /usr/include/zconf.h \
  "${zlib_dir}/LICENSE" /usr/share/licenses/zlib/LICENSE
node scripts/build-source-tar.mjs dist/static/default/git.tar \
  "${git_dir}" /usr/src/git \
  "${git_dir}/templates" /usr/share/git-core/templates \
  "${git_dir}/COPYING" /usr/share/licenses/git/COPYING
node scripts/build-source-tar.mjs dist/static/default/curl-headers.tar \
  "${curl_dir}/include/curl" /usr/include/curl \
  "${curl_dir}/COPYING" /usr/share/licenses/curl/COPYING
node scripts/build-source-tar.mjs dist/static/default/sbase.tar \
  "${sbase_dir}/grep.c" /usr/src/sbase/grep.c \
  "${sbase_dir}/head.c" /usr/src/sbase/head.c \
  "${sbase_dir}/printf.c" /usr/src/sbase/printf.c \
  "${sbase_dir}/sed.c" /usr/src/sbase/sed.c \
  "${sbase_dir}/wc.c" /usr/src/sbase/wc.c \
  "${sbase_dir}/queue.h" /usr/src/sbase/queue.h \
  "${sbase_dir}/util.h" /usr/src/sbase/util.h \
  "${sbase_dir}/utf.h" /usr/src/sbase/utf.h \
  "${sbase_dir}/arg.h" /usr/src/sbase/arg.h \
  "${sbase_dir}/compat.h" /usr/src/sbase/compat.h \
  "${sbase_dir}/libutil" /usr/src/sbase/libutil \
  "${sbase_dir}/libutf" /usr/src/sbase/libutf \
  "${sbase_dir}/LICENSE" /usr/share/licenses/sbase/LICENSE
node scripts/build-source-tar.mjs dist/static/default/awk.tar \
  "${awk_dir}/awk.h" /usr/src/awk/awk.h \
  "${awk_dir}/awkgram.y" /usr/src/awk/awkgram.y \
  "${awk_dir}/b.c" /usr/src/awk/b.c \
  "${awk_dir}/lex.c" /usr/src/awk/lex.c \
  "${awk_dir}/lib.c" /usr/src/awk/lib.c \
  "${awk_dir}/main.c" /usr/src/awk/main.c \
  "${awk_dir}/maketab.c" /usr/src/awk/maketab.c \
  "${awk_dir}/parse.c" /usr/src/awk/parse.c \
  "${awk_dir}/proto.h" /usr/src/awk/proto.h \
  "${awk_dir}/run.c" /usr/src/awk/run.c \
  "${awk_dir}/tran.c" /usr/src/awk/tran.c \
  "${awk_generated_dir}" /usr/src/awk \
  "${awk_dir}/LICENSE" /usr/share/licenses/awk/LICENSE
node scripts/build-source-tar.mjs dist/static/default/quickjs.tar \
  "${quickjs_dir}/builtin-array-fromasync.h" /usr/src/quickjs/builtin-array-fromasync.h \
  "${quickjs_dir}/builtin-iterator-zip-keyed.h" /usr/src/quickjs/builtin-iterator-zip-keyed.h \
  "${quickjs_dir}/builtin-iterator-zip.h" /usr/src/quickjs/builtin-iterator-zip.h \
  "${quickjs_dir}/cutils.h" /usr/src/quickjs/cutils.h \
  "${quickjs_dir}/dtoa.c" /usr/src/quickjs/dtoa.c \
  "${quickjs_dir}/dtoa.h" /usr/src/quickjs/dtoa.h \
  "${quickjs_dir}/libregexp-opcode.h" /usr/src/quickjs/libregexp-opcode.h \
  "${quickjs_dir}/libregexp.c" /usr/src/quickjs/libregexp.c \
  "${quickjs_dir}/libregexp.h" /usr/src/quickjs/libregexp.h \
  "${quickjs_dir}/libunicode-table.h" /usr/src/quickjs/libunicode-table.h \
  "${quickjs_dir}/libunicode.c" /usr/src/quickjs/libunicode.c \
  "${quickjs_dir}/libunicode.h" /usr/src/quickjs/libunicode.h \
  "${quickjs_dir}/list.h" /usr/src/quickjs/list.h \
  "${quickjs_dir}/quickjs-atom.h" /usr/src/quickjs/quickjs-atom.h \
  "${quickjs_dir}/quickjs-c-atomics.h" /usr/src/quickjs/quickjs-c-atomics.h \
  "${quickjs_dir}/quickjs-opcode.h" /usr/src/quickjs/quickjs-opcode.h \
  "${quickjs_dir}/quickjs.c" /usr/src/quickjs/quickjs.c \
  "${quickjs_dir}/quickjs.h" /usr/src/quickjs/quickjs.h \
  "${quickjs_dir}/LICENSE" /usr/share/licenses/quickjs-ng/LICENSE
node scripts/build-source-tar.mjs dist/static/python/cpython.tar \
  "${cpython_dir}/Include" /usr/src/python/Include \
  "${cpython_dir}/Parser" /usr/src/python/Parser \
  "${cpython_dir}/Objects" /usr/src/python/Objects \
  "${cpython_dir}/Python" /usr/src/python/Python \
  "${cpython_dir}/Modules" /usr/src/python/Modules \
  "${cpython_dir}/Programs" /usr/src/python/Programs \
  "${cpython_dir}/Tools/freeze" /usr/src/python/Tools/freeze \
  "${cpython_dir}/Lib" /usr/src/python/Lib \
  "${cpython_dir}/Makefile" /usr/src/python/Makefile \
  "${cpython_dir}/Makefile.pre" /usr/src/python/Makefile.pre \
  "${cpython_dir}/Makefile.pre.in" /usr/src/python/Makefile.pre.in \
  "${cpython_dir}/pyconfig.h" /usr/src/python/pyconfig.h \
  "${cpython_dir}/config.status" /usr/src/python/config.status \
  "${cpython_dir}/configure" /usr/src/python/configure \
  "${cpython_dir}/LICENSE" /usr/share/licenses/cpython/LICENSE
node scripts/build-source-tar.mjs dist/static/default/pi-package.tar \
  "${project_dir}/build/generated/pi-package" /usr/lib/pi
node scripts/build-source-tar.mjs dist/static/default/zig-lib.tar \
  "${zig_dir}/lib" /usr/lib/zig \
  "${zig_dir}/LICENSE" /usr/share/licenses/zig/LICENSE
node scripts/build-source-tar.mjs dist/static/default/ghostty.tar \
  "${ghostty_dir}/src" /usr/src/ghostty/src \
  "${ghostty_dir}/include/ghostty" /usr/include/ghostty \
  "${ghostty_dir}/include/ghostty.h" /usr/include/ghostty.h \
  "${ghostty_dir}/LICENSE" /usr/share/licenses/ghostty/LICENSE \
  "${project_dir}/src/ghostty/generated" /usr/src/ghostty/generated
node scripts/build-source-tar.mjs dist/static/default/uucode.tar \
  "${uucode_dir}/src" /usr/src/uucode/src \
  "${uucode_dir}/LICENSE.md" /usr/share/licenses/uucode/LICENSE.md

node scripts/verify-static-sources.mjs
node scripts/generate-routes.mjs

node scripts/dolly-abi.mjs emit-emscripten-exports \
  build/dolly-0.wasm \
  build/dolly-display-0.wasm \
  build/dolly-snapshot-0.wasm \
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
  -DDOLLY_ZIG_DIR="${zig_container_dir}"
"${container[@]}" cmake --build build/runtime --parallel

node scripts/dolly-abi.mjs stamp \
  build/dolly-0.wasm \
  dist/dolly.wasm
node scripts/dolly-abi.mjs validate-runtime \
  build/dolly-0.wasm \
  dist/dolly.wasm

cp build/dolly-0.wasm dist/dolly-0.wasm
cp build/dolly-display-0.wasm dist/dolly-display-0.wasm
cp build/dolly-download-0.wasm dist/dolly-download-0.wasm
cp build/dolly-http-0.wasm dist/dolly-http-0.wasm
cp build/dolly-snapshot-0.wasm dist/dolly-snapshot-0.wasm
cp build/program-writer.wasm dist/program-writer.wasm
cp build/program-reader.wasm dist/program-reader.wasm
cp build/program-inspector.wasm dist/program-inspector.wasm
cp "${web_font}" dist/IosevkaTerm-SemiBold.woff2
node scripts/write-build-id.mjs dist/dolly.wasm dist/dolly.data dist/dolly-build-id.mjs
