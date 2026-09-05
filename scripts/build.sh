#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
image="${DOLLY_EMSDK_IMAGE}"

node "${project_dir}/scripts/lint-dollyfiles.mjs"

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

toolchain_key="$("${project_dir}/scripts/toolchain-cache-key.sh")"
toolchain_stamp="${project_dir}/.cache/llvm-wasm/.dolly-toolchain-key"
installed_toolchain_key="$(cat "${toolchain_stamp}" 2>/dev/null || true)"
if [[ ! -f "${project_dir}/.cache/llvm-wasm/lib/libclangFrontend.a" ||
      ! -f "${project_dir}/.cache/llvm-wasm/lib/liblldWasm.a" ||
      "${installed_toolchain_key}" != "${toolchain_key}" ]]; then
  echo "dolly: run ./scripts/build-toolchain.sh before building" >&2
  if [[ -n "${installed_toolchain_key}" ]]; then
    echo "dolly: cached wasm64 Clang/LLD provider is stale" >&2
  fi
  exit 1
fi

mapfile -t image_rows < <(node "${project_dir}/scripts/list-images.mjs")
mapfile -t selected_modules < <(node "${project_dir}/scripts/list-images.mjs" --modules)
declare -A selected_module=()
for module_name in "${selected_modules[@]}"; do
  selected_module["${module_name}"]=1
done
has_module() {
  [[ -n "${selected_module[$1]:-}" ]]
}

has_module sbase && sbase_dir="$("${project_dir}/scripts/fetch-sbase.sh")"
if has_module awk; then
  awk_dir="$("${project_dir}/scripts/fetch-awk.sh")"
  awk_generated_dir="$("${project_dir}/scripts/generate-awk.sh")"
fi
has_module quickjs && quickjs_dir="$("${project_dir}/scripts/fetch-quickjs.sh")"
has_module pi && pi_source_dir="$("${project_dir}/scripts/fetch-pi-source.sh")"
has_module typescript && typescript_archive="$("${project_dir}/scripts/fetch-typescript.sh")"
has_module curl && curl_dir="$("${project_dir}/scripts/fetch-curl.sh")"
has_module zlib && zlib_dir="$("${project_dir}/scripts/prepare-zlib.sh")"
has_module git && git_dir="$("${project_dir}/scripts/prepare-git.sh")"
has_module make && make_dir="$("${project_dir}/scripts/prepare-make.sh")"
has_module ninja && samurai_dir="$("${project_dir}/scripts/prepare-samurai.sh")"
has_module cpp && emscripten_system_dir="$("${project_dir}/scripts/fetch-emscripten-system-libs.sh")"
has_module libffi && libffi_dir="$("${project_dir}/scripts/prepare-libffi.sh")"
has_module cpython && cpython_dir="$("${project_dir}/scripts/prepare-cpython.sh")"
zig_dir="$("${project_dir}/scripts/prepare-zig-native.sh")"
zig_container_dir="/src/${zig_dir#"${project_dir}/"}"
if has_module ghostty; then
  ghostty_checkout="$("${project_dir}/scripts/fetch-ghostty.sh")"
  ghostty_dir="$("${project_dir}/scripts/prepare-ghostty-source.sh" "${ghostty_checkout}")"
  uucode_dir="$("${project_dir}/scripts/fetch-uucode.sh")"
  stb_header="$("${project_dir}/scripts/fetch-stb.sh")"
fi
if has_module gamedev; then
  raylib_dir="$("${project_dir}/scripts/fetch-raylib.sh")"
  box3d_dir="$("${project_dir}/scripts/fetch-box3d.sh")"
fi
mapfile -t font_paths < <(bash "${project_dir}/scripts/fetch-iosevka.sh")
web_font="${font_paths[0]}"
runtime_font="${font_paths[1]}"

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
  "${project_dir}/dist/dolly-kernel-plugin-0.wasm" \
  "${project_dir}/dist/dolly-0.wasm" \
  "${project_dir}/dist/dolly-process-0.wasm" \
  "${project_dir}/dist/dolly-process-gate-0.wasm" \
  "${project_dir}/dist/dolly-supervisor-0.wasm" \
  "${project_dir}/dist/dolly-process-abi.mjs" \
  "${project_dir}/dist/dolly-http-0.wasm" \
  "${project_dir}/dist/dolly-display-0.wasm" \
  "${project_dir}/dist/dolly-download-0.wasm" \
  "${project_dir}/dist/dolly-terminal-0.wasm" \
  "${project_dir}/dist/dolly-snapshot-0.wasm" \
  "${project_dir}/dist/dolly-build-id.mjs" \
  "${project_dir}/dist/IosevkaTerm-SemiBold.woff2" \
  "${project_dir}/dist/ghostty-web.js" \
  "${project_dir}/dist/process-check.wasm" \
  "${project_dir}/dist/process-fs-check.wasm" \
  "${project_dir}/dist/process-pipe-check.wasm" \
  "${project_dir}/dist/slop-process.wasm"
rm -f \
  "${project_dir}/dist/program-inspector.wasm" \
  "${project_dir}/dist/program-reader.wasm" \
  "${project_dir}/dist/program-writer.wasm"

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-kernel-plugin-0.wat \
  --enable-memory64 \
  --enable-reference-types \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-kernel-plugin-0.wasm

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-process-0.wat \
  --enable-memory64 \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-process-0.wasm
node scripts/dolly-abi.mjs bind-process-layout \
  build/dolly-process-0.wasm \
  include/dolly/process.h

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-process-gate-0.wat \
  --enable-memory64 \
  --enable-multimemory \
  --enable-bulk-memory \
  --enable-bulk-memory-opt \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-process-gate-0.wasm

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-supervisor-0.wat \
  --enable-memory64 \
  --disable-compact-imports \
  -o build/dolly-supervisor-0.wasm

process_compile_flags=(
  -m64 -O1 -matomics -mbulk-memory -fwasm-exceptions
  -sSUPPORT_LONGJMP=wasm -sWASM_LEGACY_EXCEPTIONS=0
  -I/src/include
)
process_libc_internal_flags=(
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/arch/emscripten
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/arch/generic
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/src/internal
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/src/include
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/include
  -I/emsdk/upstream/emscripten/system/lib/libc
  -I/emsdk/upstream/emscripten/system/lib/pthread
)
process_link_flags=(
  -sSTANDALONE_WASM=1
  -sIMPORTED_MEMORY=1
  -sSHARED_MEMORY=1
  -sSUPPORT_LONGJMP=wasm
  -sWASM_LEGACY_EXCEPTIONS=0
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=16777216
  -sMAXIMUM_MEMORY=8589934592
  -sSTACK_SIZE=8388608
  -Wl,--export=__dolly_dso_allocate,--export=__stack_pointer,--export-table,--growable-table
)

"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" -c src/process/libc-adapter.c \
  -o build/process-libc-adapter.o
"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" -c src/process/runtime-adapter.c \
  -o build/process-runtime-adapter.o
"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" -c src/process/mmap.c \
  -o build/process-mmap.o
"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" -c src/process/time.c \
  -o build/process-time.o
"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" -c src/process/poll.c \
  -o build/process-poll.o
"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" "${process_libc_internal_flags[@]}" -c \
  /emsdk/upstream/emscripten/system/lib/pthread/pthread_self_stub.c \
  -o build/process-pthread-self.o
"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" "${process_libc_internal_flags[@]}" -c \
  /emsdk/upstream/emscripten/system/lib/libc/musl/src/thread/default_attr.c \
  -o build/process-default-attr.o
"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" "${process_libc_internal_flags[@]}" -c \
  src/process/pthread-stubs.c \
  -o build/process-pthread-stub.o
for source in pthread_mutexattr_init pthread_mutexattr_settype pthread_mutexattr_destroy; do
  "${container[@]}" /emsdk/upstream/emscripten/emcc \
    "${process_compile_flags[@]}" "${process_libc_internal_flags[@]}" -c \
    "/emsdk/upstream/emscripten/system/lib/libc/musl/src/thread/${source}.c" \
    -o "build/process-${source}.o"
done
"${container[@]}" /emsdk/upstream/emscripten/emar rcs build/libdolly-process.a \
  build/process-libc-adapter.o \
  build/process-runtime-adapter.o \
  build/process-mmap.o \
  build/process-time.o \
  build/process-poll.o \
  build/process-pthread-self.o \
  build/process-default-attr.o \
  build/process-pthread-stub.o \
  build/process-pthread_mutexattr_init.o \
  build/process-pthread_mutexattr_settype.o \
  build/process-pthread_mutexattr_destroy.o

build_process() {
  local output="$1"
  local staged="${output}.wasm"
  shift
  "${container[@]}" /emsdk/upstream/emscripten/emcc \
    "${process_compile_flags[@]}" "${process_link_flags[@]}" "$@" \
    -Wl,--whole-archive build/libdolly-process.a -Wl,--no-whole-archive \
    -o "${staged}"
  mv -- "${staged}" "${output}"
}

build_process_cxx() {
  local output="$1"
  local staged="${output}.wasm"
  shift
  "${container[@]}" /emsdk/upstream/emscripten/em++ \
    "${process_compile_flags[@]}" "${process_link_flags[@]}" "$@" \
    -Wl,--whole-archive build/libdolly-process.a -Wl,--no-whole-archive \
    -o "${staged}"
  mv -- "${staged}" "${output}"
}

rm -rf -- "${project_dir}/build/process-bin"
mkdir -p "${project_dir}/build/process-bin"

build_process build/process-bin/process-check src/process/check.c
build_process_cxx build/process-bin/process-cpp-check src/process/cpp-check.cpp
build_process build/process-bin/process-env-driver src/process/env-driver.c
build_process build/process-bin/process-dso-check src/process/dso-check.c
build_process build/process-bin/process-fs-check src/process/fs-check.c
build_process build/process-bin/process-http-check src/process/http-check.c
build_process build/process-bin/process-pipe-check src/process/pipe-check.c
build_process build/process-bin/process-pipe-driver src/process/pipe-driver.c
build_process build/process-bin/process-poll-check src/process/poll-check.c
build_process build/process-bin/bootstrap src/process/bootstrap.c
build_process build/process-bin/slop src/slop.c
build_process build/process-bin/cc src/process/cc.c
build_process build/process-bin/c++ src/process/cxx.c
build_process build/process-bin/ld src/process/ld.c
build_process build/process-bin/ar src/process/ar.c
for command in \
    command cp dd diff du env find help hostname install ls mkdir mv patch \
    printenv realpath rev rm tail tar tee test time timeout tty uname which xargs; do
  build_process "build/process-bin/${command}" "src/commands/${command}.c"
done

# Building the C++ process probe materializes the exact wasm64/native-EH libc++
# profile. Publish only that closed runtime set for the compiler running inside
# Dolly; no Emscripten driver or JavaScript library enters the process sysroot.
process_sysroot_dir="$("${project_dir}/scripts/prepare-process-sysroot.sh")"
process_sysroot_container_dir="/src/${process_sysroot_dir#"${project_dir}/"}"

node scripts/dolly-abi.mjs stamp-process \
  build/dolly-process-0.wasm \
  build/process-bin/*
node scripts/dolly-abi.mjs validate-process \
  build/dolly-process-0.wasm \
  build/process-bin/*
node scripts/dolly-abi.mjs emit-digest-module \
  build/dolly-process-0.wasm \
  dist/dolly-process-abi.mjs \
  DOLLY_PROCESS_ABI_DIGEST

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

if has_module zig; then
  native_zig_object="$("${project_dir}/scripts/build-native-zig.sh")"
fi

static_dir="${project_dir}/dist/static"
rm -rf -- "${static_dir}"
mkdir -p "${static_dir}/default" "${static_dir}/gamedev" "${static_dir}/python"

copy_static() {
  local source="$1"
  local destination="$2"
  mkdir -p "$(dirname -- "${static_dir}/${destination}")"
  cp -- "${source}" "${static_dir}/${destination}"
}

if has_module curl; then
  copy_static "${project_dir}/src/commands/curl.c" default/commands/curl.c
  copy_static "${project_dir}/src/libcurl-fetch.c" default/libcurl-fetch.c
fi
if has_module quickjs; then
  for command in qjs janis; do
    copy_static "${project_dir}/src/commands/${command}.c" "default/commands/${command}.c"
  done
  copy_static "${project_dir}/src/runtimes/quickjs-main.c" default/runtimes/quickjs-main.c
  copy_static "${project_dir}/src/runtimes/quickjs-runner.h" default/runtimes/quickjs-runner.h
  copy_static "${project_dir}/src/runtimes/dolly-node.js" default/runtimes/dolly-node.js
  copy_static "${project_dir}/src/runtimes/janis.js" default/runtimes/janis.js
fi
if has_module cpp; then
  node scripts/build-source-tar.mjs dist/static/default/libcxx-headers.tar \
    "${project_dir}/.cache/emscripten/sysroot/include/c++/v1" /usr/include/c++/v1
  copy_static "${project_dir}/src/runtimes/libcxx-hash-dolly.c" default/runtimes/libcxx-hash-dolly.c
  copy_static "${project_dir}/src/runtimes/libcxx-misc-dolly.c" default/runtimes/libcxx-misc-dolly.c
  copy_static "${project_dir}/src/runtimes/libcxx-new-dolly.c" default/runtimes/libcxx-new-dolly.c
  copy_static "${project_dir}/src/runtimes/libcxx-string-dolly.c" default/runtimes/libcxx-string-dolly.c
  copy_static "${emscripten_system_dir}/system/lib/libcxx/LICENSE.TXT" default/licenses/libcxx
  copy_static "${emscripten_system_dir}/system/lib/libcxxabi/LICENSE.TXT" default/licenses/libcxxabi
fi
if has_module cpython; then
  for source in \
    cpython-platform.c cpython-extension-check.c \
    cpython-socket-stubs.c cpython-termios.c \
    cpython-process.c cpython-subprocess.py; do
    copy_static "${project_dir}/src/runtimes/${source}" "python/runtimes/${source}"
  done
fi
if has_module libffi; then
  copy_static "${project_dir}/src/runtimes/libffi-dolly.c" python/runtimes/libffi-dolly.c
fi
if has_module bonnie; then
  copy_static "${project_dir}/src/commands/bonnie.c" python/commands/bonnie.c
  if [[ -f "${project_dir}/src/runtimes/bonnie.py" ]]; then
    copy_static "${project_dir}/src/runtimes/bonnie.py" python/runtimes/bonnie.py
  fi
fi
if has_module make; then
  copy_static "${project_dir}/src/runtimes/make-amalgamation-dolly.c" default/runtimes/make-amalgamation-dolly.c
fi
if has_module ninja; then
  copy_static "${project_dir}/src/runtimes/samurai-unit-dolly.c" default/runtimes/samurai-unit-dolly.c
fi
if has_module pi; then
  copy_static "${project_dir}/src/commands/pi.c" default/commands/pi.c
  copy_static "${project_dir}/config/pi-tsconfig.dolly.json" default/pi-tsconfig.dolly.json
  copy_static "${project_dir}/config/pi-quickjs-compat.mjs" default/pi-quickjs-compat.mjs
  copy_static "${project_dir}/src/runtimes/apply-pi-quickjs-compat.mjs" default/runtimes/apply-pi-quickjs-compat.mjs
  copy_static "${project_dir}/src/pi/dolly-tools.js" default/pi/dolly-tools.js
  copy_static "${project_dir}/src/pi/SYSTEM.md" default/pi/SYSTEM.md
  copy_static "${project_dir}/src/pi/settings.json" default/pi/settings.json
  copy_static "${project_dir}/src/pi/dolly-theme.json" default/pi/dolly-theme.json
  copy_static "${project_dir}/src/pi/skills/dolly/SKILL.md" default/pi/dolly-skill.md
fi
if has_module typescript; then
  copy_static "${project_dir}/src/commands/tsc.c" default/commands/tsc.c
  copy_static "${project_dir}/src/runtimes/tsc-dolly.mjs" default/runtimes/tsc-dolly.mjs
  copy_static "${typescript_archive}" default/typescript-5.9.3.tgz
fi
if has_module agent-tools; then
  for command in install which command xargs find tail tee env printenv rev \
      timeout time uname hostname realpath diff patch du dd tty gzip; do
    copy_static "${project_dir}/src/commands/${command}.c" \
      "default/commands/${command}.c"
  done
fi
if has_module ghostty; then
  copy_static "${project_dir}/src/ghostty/display.c" default/ghostty/display.c
  copy_static "${stb_header}" default/stb_truetype.h
  copy_static "${runtime_font}" default/IosevkaTerm-SemiBold.ttf
fi
if has_module zig; then
  copy_static "${project_dir}/src/process/zig.c" default/commands/zig.c
fi

if has_module make; then
  node scripts/build-source-tar.mjs dist/static/default/make-4.4.1.tar \
    "${make_dir}" /usr/src/make \
    "${make_dir}/COPYING" /usr/share/licenses/make/COPYING
fi
if has_module ninja; then
  node scripts/build-source-tar.mjs dist/static/default/samurai.tar \
    "${samurai_dir}" /tmp/ninja/source \
    "${samurai_dir}/LICENSE" /usr/share/licenses/samurai/LICENSE
fi
if has_module zlib; then
  node scripts/build-source-tar.mjs dist/static/default/zlib.tar \
    "${zlib_dir}" /usr/src/zlib \
    "${zlib_dir}/zlib.h" /usr/include/zlib.h \
    "${zlib_dir}/zconf.h" /usr/include/zconf.h \
    "${zlib_dir}/LICENSE" /usr/share/licenses/zlib/LICENSE
fi
if has_module git; then
  node scripts/build-source-tar.mjs dist/static/default/git.tar \
    "${git_dir}" /usr/src/git \
    "${git_dir}/templates" /usr/share/git-core/templates \
    "${git_dir}/COPYING" /usr/share/licenses/git/COPYING
fi
if has_module curl; then
  node scripts/build-source-tar.mjs dist/static/default/curl-headers.tar \
    "${curl_dir}/include/curl" /usr/include/curl \
    "${curl_dir}/COPYING" /usr/share/licenses/curl/COPYING
fi
if has_module sbase; then
node scripts/build-source-tar.mjs dist/static/default/sbase.tar \
  "${sbase_dir}/grep.c" /usr/src/sbase/grep.c \
  "${sbase_dir}/head.c" /usr/src/sbase/head.c \
  "${sbase_dir}/od.c" /usr/src/sbase/od.c \
  "${sbase_dir}/cut.c" /usr/src/sbase/cut.c \
  "${sbase_dir}/basename.c" /usr/src/sbase/basename.c \
  "${sbase_dir}/cksum.c" /usr/src/sbase/cksum.c \
  "${sbase_dir}/cmp.c" /usr/src/sbase/cmp.c \
  "${sbase_dir}/comm.c" /usr/src/sbase/comm.c \
  "${sbase_dir}/date.c" /usr/src/sbase/date.c \
  "${sbase_dir}/dirname.c" /usr/src/sbase/dirname.c \
  "${sbase_dir}/expand.c" /usr/src/sbase/expand.c \
  "${sbase_dir}/expr.c" /usr/src/sbase/expr.c \
  "${sbase_dir}/false.c" /usr/src/sbase/false.c \
  "${sbase_dir}/fold.c" /usr/src/sbase/fold.c \
  "${sbase_dir}/join.c" /usr/src/sbase/join.c \
  "${sbase_dir}/ln.c" /usr/src/sbase/ln.c \
  "${sbase_dir}/nl.c" /usr/src/sbase/nl.c \
  "${sbase_dir}/printf.c" /usr/src/sbase/printf.c \
  "${sbase_dir}/paste.c" /usr/src/sbase/paste.c \
  "${sbase_dir}/pathchk.c" /usr/src/sbase/pathchk.c \
  "${sbase_dir}/readlink.c" /usr/src/sbase/readlink.c \
  "${sbase_dir}/rmdir.c" /usr/src/sbase/rmdir.c \
  "${sbase_dir}/mktemp.c" /usr/src/sbase/mktemp.c \
  "${sbase_dir}/md5sum.c" /usr/src/sbase/md5sum.c \
  "${sbase_dir}/sed.c" /usr/src/sbase/sed.c \
  "${sbase_dir}/seq.c" /usr/src/sbase/seq.c \
  "${sbase_dir}/sort.c" /usr/src/sbase/sort.c \
  "${sbase_dir}/sha256sum.c" /usr/src/sbase/sha256sum.c \
  "${sbase_dir}/sleep.c" /usr/src/sbase/sleep.c \
  "${sbase_dir}/split.c" /usr/src/sbase/split.c \
  "${sbase_dir}/strings.c" /usr/src/sbase/strings.c \
  "${sbase_dir}/tr.c" /usr/src/sbase/tr.c \
  "${sbase_dir}/true.c" /usr/src/sbase/true.c \
  "${sbase_dir}/tsort.c" /usr/src/sbase/tsort.c \
  "${sbase_dir}/unexpand.c" /usr/src/sbase/unexpand.c \
  "${sbase_dir}/uniq.c" /usr/src/sbase/uniq.c \
  "${sbase_dir}/wc.c" /usr/src/sbase/wc.c \
  "${sbase_dir}/queue.h" /usr/src/sbase/queue.h \
  "${sbase_dir}/text.h" /usr/src/sbase/text.h \
  "${sbase_dir}/util.h" /usr/src/sbase/util.h \
  "${sbase_dir}/utf.h" /usr/src/sbase/utf.h \
  "${sbase_dir}/arg.h" /usr/src/sbase/arg.h \
  "${sbase_dir}/compat.h" /usr/src/sbase/compat.h \
  "${sbase_dir}/crypt.h" /usr/src/sbase/crypt.h \
  "${sbase_dir}/md5.h" /usr/src/sbase/md5.h \
  "${sbase_dir}/sha256.h" /usr/src/sbase/sha256.h \
  "${sbase_dir}/libutil" /usr/src/sbase/libutil \
  "${sbase_dir}/libutf" /usr/src/sbase/libutf \
  "${sbase_dir}/LICENSE" /usr/share/licenses/sbase/LICENSE
fi
if has_module awk; then
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
fi
if has_module quickjs; then
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
fi
if has_module gamedev; then
node scripts/build-source-tar.mjs dist/static/gamedev/raylib.tar \
  "${raylib_dir}/src" /usr/src/raylib/src \
  "${raylib_dir}/LICENSE" /usr/share/licenses/raylib/LICENSE \
  "${raylib_dir}/README.md" /usr/src/raylib/README.md
node scripts/build-source-tar.mjs dist/static/gamedev/box3d.tar \
  "${box3d_dir}/src" /usr/src/box3d/src \
  "${box3d_dir}/include" /usr/src/box3d/include \
  "${box3d_dir}/LICENSE" /usr/share/licenses/box3d/LICENSE \
  "${box3d_dir}/README.md" /usr/src/box3d/README.md
fi
if has_module cpython; then
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
fi
if has_module libffi; then
node scripts/build-source-tar.mjs dist/static/python/libffi.tar \
  "${libffi_dir}" /usr/src/libffi \
  "${libffi_dir}/include/ffi.h" /usr/include/ffi.h \
  "${libffi_dir}/include/ffitarget.h" /usr/include/ffitarget.h \
  "${libffi_dir}/LICENSE" /usr/share/licenses/libffi/LICENSE
fi
if has_module pi; then
  node scripts/build-source-tar.mjs dist/static/default/pi-source.tar \
    "${pi_source_dir}/tsconfig.base.json" /usr/src/pi-source/tsconfig.base.json \
    "${pi_source_dir}/LICENSE" /usr/share/licenses/pi-source/LICENSE \
    "${pi_source_dir}/packages/telemetry/package.json" /usr/src/pi-source/packages/telemetry/package.json \
    "${pi_source_dir}/packages/telemetry/tsconfig.build.json" /usr/src/pi-source/packages/telemetry/tsconfig.build.json \
    "${pi_source_dir}/packages/telemetry/src" /usr/src/pi-source/packages/telemetry/src \
    "${pi_source_dir}/packages/ai/package.json" /usr/src/pi-source/packages/ai/package.json \
    "${pi_source_dir}/packages/ai/tsconfig.build.json" /usr/src/pi-source/packages/ai/tsconfig.build.json \
    "${pi_source_dir}/packages/ai/src" /usr/src/pi-source/packages/ai/src \
    "${pi_source_dir}/packages/agent/package.json" /usr/src/pi-source/packages/agent/package.json \
    "${pi_source_dir}/packages/agent/tsconfig.build.json" /usr/src/pi-source/packages/agent/tsconfig.build.json \
    "${pi_source_dir}/packages/agent/src" /usr/src/pi-source/packages/agent/src \
    "${pi_source_dir}/packages/protocol/package.json" /usr/src/pi-source/packages/protocol/package.json \
    "${pi_source_dir}/packages/protocol/tsconfig.build.json" /usr/src/pi-source/packages/protocol/tsconfig.build.json \
    "${pi_source_dir}/packages/protocol/src" /usr/src/pi-source/packages/protocol/src \
    "${pi_source_dir}/packages/client/package.json" /usr/src/pi-source/packages/client/package.json \
    "${pi_source_dir}/packages/client/tsconfig.build.json" /usr/src/pi-source/packages/client/tsconfig.build.json \
    "${pi_source_dir}/packages/client/src" /usr/src/pi-source/packages/client/src \
    "${pi_source_dir}/packages/tui/package.json" /usr/src/pi-source/packages/tui/package.json \
    "${pi_source_dir}/packages/tui/tsconfig.build.json" /usr/src/pi-source/packages/tui/tsconfig.build.json \
    "${pi_source_dir}/packages/tui/src" /usr/src/pi-source/packages/tui/src \
    "${pi_source_dir}/packages/coding-agent/package.json" /usr/src/pi-source/packages/coding-agent/package.json \
    "${pi_source_dir}/packages/coding-agent/tsconfig.build.json" /usr/src/pi-source/packages/coding-agent/tsconfig.build.json \
    "${pi_source_dir}/packages/coding-agent/src" /usr/src/pi-source/packages/coding-agent/src \
    "${pi_source_dir}/packages/coding-agent/README.md" /usr/src/pi-source/packages/coding-agent/README.md \
    "${pi_source_dir}/packages/coding-agent/CHANGELOG.md" /usr/src/pi-source/packages/coding-agent/CHANGELOG.md \
    "${pi_source_dir}/packages/coding-agent/docs" /usr/src/pi-source/packages/coding-agent/docs \
    "${pi_source_dir}/packages/coding-agent/examples" /usr/src/pi-source/packages/coding-agent/examples
  # The pinned Git source omits generated model data. Restore only that exact
  # published artifact before compiling the seven Pi workspaces in Dolly.
  node scripts/build-source-tar.mjs dist/static/default/pi-generated-model-data.tar \
    "${project_dir}/node_modules/@earendil-works/pi-ai/dist/providers/data" \
    /usr/src/pi-source/packages/ai/src/providers/data
  node scripts/build-pi-runtime-packages.mjs
fi
if has_module zig; then
node scripts/build-source-tar.mjs dist/static/default/zig-lib.tar \
  "${zig_dir}/lib" /usr/lib/zig \
  "${zig_dir}/LICENSE" /usr/share/licenses/zig/LICENSE
fi
if has_module ghostty; then
node scripts/build-source-tar.mjs dist/static/default/ghostty.tar \
  "${ghostty_dir}/src" /usr/src/ghostty/src \
  "${ghostty_dir}/include/ghostty" /usr/include/ghostty \
  "${ghostty_dir}/include/ghostty.h" /usr/include/ghostty.h \
  "${ghostty_dir}/LICENSE" /usr/share/licenses/ghostty/LICENSE \
  "${project_dir}/src/ghostty/generated" /usr/src/ghostty/generated
node scripts/build-source-tar.mjs dist/static/default/uucode.tar \
  "${uucode_dir}/src" /usr/src/uucode/src \
  "${uucode_dir}/LICENSE.md" /usr/share/licenses/uucode/LICENSE.md
fi

node scripts/verify-static-sources.mjs
node scripts/generate-routes.mjs

node scripts/dolly-abi.mjs emit-emscripten-exports \
  build/dolly-kernel-plugin-0.wasm \
  build/dolly-display-0.wasm \
  build/dolly-http-0.wasm \
  build/dolly-snapshot-0.wasm \
  build/dolly-supervisor-0.wasm \
  build/runtime-exports.json
node scripts/dolly-abi.mjs emit-digest-header \
  build/dolly-kernel-plugin-0.wasm \
  build/generated/dolly-kernel-plugin-abi-digest.h \
  DOLLY_KERNEL_PLUGIN_ABI_DIGEST
node scripts/dolly-abi.mjs emit-digest-header \
  build/dolly-process-0.wasm \
  build/generated/dolly-process-abi-digest.h \
  DOLLY_PROCESS_ABI_DIGEST
./scripts/prepare-compiler-rt.sh

"${container[@]}" /emsdk/upstream/emscripten/emcmake cmake \
  -S toolchain \
  -B build/runtime \
  -DCMAKE_BUILD_TYPE=Release \
  -DLLVM_DIR=/src/.cache/llvm-wasm/lib/cmake/llvm \
  -DClang_DIR=/src/.cache/llvm-wasm/lib/cmake/clang \
  -DLLD_DIR=/src/.cache/llvm-wasm/lib/cmake/lld \
  -DDOLLY_ZIG_DIR="${zig_container_dir}" \
  -DDOLLY_ZIG_OBJECT="/src/${native_zig_object#"${project_dir}/"}" \
  -DDOLLY_PROCESS_SYSROOT_DIR="${process_sysroot_container_dir}"
"${container[@]}" cmake --build build/runtime --target dolly-process-compiler --parallel
node scripts/dolly-abi.mjs stamp-process \
  build/dolly-process-0.wasm \
  build/process-tools/compiler.wasm
node scripts/dolly-abi.mjs validate-process \
  build/dolly-process-0.wasm \
  build/process-tools/compiler.wasm
cp build/process-tools/compiler.wasm build/process-bin/compiler
"${container[@]}" cmake --build build/runtime --target dolly --parallel

# Keep the pinned Emscripten wasm64 loader fail-closed when WasmFS returns a
# view whose backing-buffer bounds differ from the view itself.
node scripts/patch-emscripten-loader.mjs dist/dolly.mjs

node scripts/dolly-abi.mjs stamp \
  build/dolly-kernel-plugin-0.wasm \
  dist/dolly.wasm
node scripts/dolly-abi.mjs validate-runtime \
  build/dolly-kernel-plugin-0.wasm \
  dist/dolly.wasm

cp build/dolly-kernel-plugin-0.wasm dist/dolly-kernel-plugin-0.wasm
cp build/dolly-process-0.wasm dist/dolly-process-0.wasm
cp build/dolly-process-gate-0.wasm dist/dolly-process-gate-0.wasm
cp build/dolly-supervisor-0.wasm dist/dolly-supervisor-0.wasm
cp build/dolly-display-0.wasm dist/dolly-display-0.wasm
cp build/dolly-download-0.wasm dist/dolly-download-0.wasm
cp build/dolly-http-0.wasm dist/dolly-http-0.wasm
cp build/dolly-snapshot-0.wasm dist/dolly-snapshot-0.wasm
cp build/process-bin/process-check dist/process-check.wasm
cp build/process-bin/process-fs-check dist/process-fs-check.wasm
cp build/process-bin/process-pipe-check dist/process-pipe-check.wasm
cp build/process-bin/slop dist/slop-process.wasm
cp "${web_font}" dist/IosevkaTerm-SemiBold.woff2
node scripts/write-build-id.mjs dist/dolly.wasm dist/dolly.data dist/dolly-build-id.mjs
node scripts/prune-stale-snapshots.mjs
