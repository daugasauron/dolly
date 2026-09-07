#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_dir}"
mkdir -p dist

module_names="$(node "${project_dir}/scripts/list-images.mjs" --modules)"
declare -A selected_module=()
while IFS= read -r module_name; do
  if [[ -n "${module_name}" ]]; then selected_module["${module_name}"]=1; fi
done <<< "${module_names}"
has_module() {
  [[ -n "${selected_module[$1]:-}" ]]
}

if has_module pi && [[ ! -f "${project_dir}/node_modules/@earendil-works/pi-ai/package.json" ]]; then
  echo "dolly: run npm ci before building Pi images" >&2
  exit 1
fi

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
has_module libuv && libuv_dir="$(bash "${project_dir}/scripts/prepare-libuv.sh")"
has_module lua && lua_archive="$(bash "${project_dir}/scripts/fetch-pinned-archive.sh" lua)"
has_module lpeg && lpeg_dir="$(bash "${project_dir}/scripts/fetch-pinned-source.sh" lpeg)"
has_module cmake && cmake_dir="$(bash "${project_dir}/scripts/fetch-pinned-source.sh" cmake)"
if has_module neovim || has_module neovim-parsers; then
  neovim_dir="$(bash "${project_dir}/scripts/prepare-neovim.sh")"
fi
if has_module luv; then
  luv_dir="$(bash "${project_dir}/scripts/fetch-pinned-source.sh" luv)"
  lua_compat53_dir="$(bash "${project_dir}/scripts/fetch-pinned-source.sh" lua_compat53)"
fi
has_module cpp && emscripten_system_dir="$("${project_dir}/scripts/fetch-emscripten-system-libs.sh")"
has_module libffi && libffi_dir="$("${project_dir}/scripts/prepare-libffi.sh")"
has_module cpython && cpython_dir="$("${project_dir}/scripts/prepare-cpython.sh")"
zig_dir="$("${project_dir}/scripts/prepare-zig-native.sh")"
if has_module ghostty; then
  ghostty_checkout="$("${project_dir}/scripts/fetch-ghostty.sh")"
  ghostty_dir="$("${project_dir}/scripts/prepare-ghostty-source.sh" "${ghostty_checkout}")"
  uucode_dir="$("${project_dir}/scripts/fetch-uucode.sh")"
  stb_header="$("${project_dir}/scripts/fetch-stb.sh")"
fi
if has_module gamedev-sdk; then
  raylib_dir="$("${project_dir}/scripts/fetch-raylib.sh")"
  box3d_dir="$("${project_dir}/scripts/fetch-box3d.sh")"
fi
mapfile -t font_paths < <(bash "${project_dir}/scripts/fetch-iosevka.sh")
runtime_font="${font_paths[1]}"

staging="$(mktemp -d "${project_dir}/dist/.image-sources.XXXXXX")"
cleanup() {
  if [[ -d "${staging}/previous" && ! -e "${project_dir}/dist/static" ]]; then
    mv -- "${staging}/previous" "${project_dir}/dist/static"
  fi
  rm -rf -- "${staging}"
}
trap cleanup EXIT
static_dir="${staging}/static"
mkdir -p "${static_dir}/default" "${static_dir}/gamedev" "${static_dir}/python"
if [[ -d "${project_dir}/dist/static" ]]; then
  cp -R -- "${project_dir}/dist/static/." "${static_dir}/"
fi

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
  node scripts/build-source-tar.mjs "${static_dir}/default/libcxx-headers.tar" \
    "${project_dir}/.cache/emscripten/sysroot/include/c++/v1" /usr/include/c++/v1
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
if has_module browser-model-providers; then
  copy_static "${project_dir}/src/pi/browser-model-providers.js" default/pi/browser-model-providers.js
fi
if has_module dollyfile-studio; then
  node scripts/build-source-tar.mjs "${static_dir}/studio/studio.tar" \
    "${project_dir}/src/studio/examples" /usr/share/dollyfile-studio/examples \
    "${project_dir}/src/studio/install.slop" /usr/share/dollyfile-studio/install.slop \
    "${project_dir}/src/studio/lint.mjs" /usr/share/dollyfile-studio/lint.mjs \
    "${project_dir}/src/studio/build.mjs" /usr/share/dollyfile-studio/build.mjs \
    "${project_dir}/src/dollyfile-view.mjs" /usr/share/dollyfile-studio/parser.mjs \
    "${project_dir}/docs/dollyfile.md" /usr/share/dollyfile-studio/dollyfile.md \
    "${project_dir}/docs/image-build-service.md" /usr/share/dollyfile-studio/build-service.md \
    "${project_dir}/src/studio/dollyfile-lint" /usr/bin/dollyfile-lint \
    "${project_dir}/src/studio/dollyfile-build" /usr/bin/dollyfile-build \
    "${project_dir}/src/studio/nvim" /home/dolly/.config/nvim \
    "${project_dir}/src/studio/pi-extension.js" /home/dolly/.pi/agent/extensions/dollyfile-studio.js \
    "${project_dir}/src/studio/prompts" /home/dolly/.pi/agent/prompts \
    "${project_dir}/src/pi/skills/dollyfiles" /home/dolly/.pi/agent/skills/dollyfiles
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
  copy_static "${project_dir}/build/process-tools/zig.wasm" default/zig.wasm
fi

if has_module make; then
  node scripts/build-source-tar.mjs "${static_dir}/default/make-4.4.1.tar" \
    "${make_dir}" /usr/src/make \
    "${make_dir}/COPYING" /usr/share/licenses/make/COPYING
fi
if has_module libuv; then
  node scripts/build-source-tar.mjs "${static_dir}/neovim/libuv.tar" \
    "${libuv_dir}/include" /tmp/libuv/source/include \
    "${libuv_dir}/src" /tmp/libuv/source/src \
    "${libuv_dir}/LICENSE" /usr/share/licenses/libuv/LICENSE \
    "${project_dir}/src/libuv" /tmp/libuv/dolly \
    "${project_dir}/config/libuv-dolly.mk" /tmp/libuv/Makefile
fi
if has_module lua; then
  copy_static "${lua_archive}" neovim/lua-5.1.5.tar.gz
fi
if has_module lpeg; then
  node scripts/build-source-tar.mjs "${static_dir}/neovim/lpeg.tar" \
    "${lpeg_dir}" /tmp/lpeg/source \
    "${lpeg_dir}/lpeg.html" /usr/share/licenses/lpeg/lpeg.html
fi
if has_module cmake; then
  node scripts/build-source-tar.mjs "${static_dir}/neovim/cmake.tar" \
    "${cmake_dir}" /tmp/cmake/source \
    "${project_dir}/config/cmake/Dolly.cmake" /tmp/cmake/source/Modules/Platform/Dolly.cmake \
    "${cmake_dir}/LICENSE.rst" /usr/share/licenses/cmake/LICENSE.rst
fi
if has_module luv; then
  node scripts/build-source-tar.mjs "${static_dir}/neovim/luv.tar" \
    "${luv_dir}" /tmp/luv/source \
    "${lua_compat53_dir}" /tmp/luv/source/deps/lua-compat-5.3 \
    "${luv_dir}/LICENSE.txt" /usr/share/licenses/luv/LICENSE.txt \
    "${lua_compat53_dir}/LICENSE" /usr/share/licenses/lua-compat53/LICENSE
fi
if has_module neovim; then
  node scripts/build-source-tar.mjs "${static_dir}/neovim/neovim.tar" \
    "${neovim_dir}" /tmp/neovim/source \
    "${neovim_dir}/LICENSE.txt" /usr/share/licenses/neovim/LICENSE.txt \
    "${neovim_dir}/src/mpack/LICENSE-MIT" /usr/share/licenses/neovim/mpack \
    "${neovim_dir}/src/nvim/vterm/LICENSE" /usr/share/licenses/neovim/vterm
fi
if has_module neovim-parsers; then
  parser_inputs=()
  for language in c lua vim vimdoc query markdown; do
    parser_dir="$(bash "${project_dir}/scripts/fetch-pinned-source.sh" "treesitter_${language}")"
    parser_target="/tmp/neovim-parsers/${language}"
    parser_license=LICENSE
    if [[ "${language}" == lua ]]; then parser_license=LICENSE.md; fi
    parser_inputs+=("${parser_dir}/${parser_license}" "/usr/share/licenses/neovim-parsers/${language}")
    parser_cmake=TreesitterParserCMakeLists.txt
    if [[ "${language}" == markdown ]]; then
      parser_cmake=MarkdownParserCMakeLists.txt
      for grammar in tree-sitter-markdown tree-sitter-markdown-inline; do
        parser_inputs+=("${parser_dir}/${grammar}/src" "${parser_target}/${grammar}/src")
      done
    else
      parser_inputs+=("${parser_dir}/src" "${parser_target}/src")
    fi
    parser_inputs+=("${neovim_dir}/cmake.deps/cmake/${parser_cmake}" "${parser_target}/CMakeLists.txt")
  done
  node scripts/build-source-tar.mjs "${static_dir}/neovim/parsers.tar" "${parser_inputs[@]}" \
    "${neovim_dir}/LICENSE.txt" /usr/share/licenses/neovim-parsers/build-recipes
fi
for dependency in utf8proc treesitter; do
  if has_module "${dependency}"; then
    dependency_dir="$(bash scripts/fetch-pinned-source.sh "${dependency}")"
    dependency_license=LICENSE
    if [[ "${dependency}" == utf8proc ]]; then dependency_license=LICENSE.md; fi
    node scripts/build-source-tar.mjs "${static_dir}/neovim/${dependency}.tar" \
      "${dependency_dir}" "/tmp/${dependency}/source" \
      "${dependency_dir}/${dependency_license}" "/usr/share/licenses/${dependency}/LICENSE"
  fi
done
if has_module ninja; then
  node scripts/build-source-tar.mjs "${static_dir}/default/samurai.tar" \
    "${samurai_dir}" /tmp/ninja/source \
    "${samurai_dir}/LICENSE" /usr/share/licenses/samurai/LICENSE
fi
if has_module zlib; then
  node scripts/build-source-tar.mjs "${static_dir}/default/zlib.tar" \
    "${zlib_dir}" /usr/src/zlib \
    "${zlib_dir}/zlib.h" /usr/include/zlib.h \
    "${zlib_dir}/zconf.h" /usr/include/zconf.h \
    "${zlib_dir}/LICENSE" /usr/share/licenses/zlib/LICENSE
fi
if has_module git; then
  node scripts/build-source-tar.mjs "${static_dir}/default/git.tar" \
    "${git_dir}" /usr/src/git \
    "${git_dir}/templates" /usr/share/git-core/templates \
    "${git_dir}/COPYING" /usr/share/licenses/git/COPYING
fi
if has_module curl; then
  node scripts/build-source-tar.mjs "${static_dir}/default/curl-headers.tar" \
    "${curl_dir}/include/curl" /usr/include/curl \
    "${curl_dir}/COPYING" /usr/share/licenses/curl/COPYING
fi
if has_module sbase; then
node scripts/build-source-tar.mjs "${static_dir}/default/sbase.tar" \
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
node scripts/build-source-tar.mjs "${static_dir}/default/awk.tar" \
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
node scripts/build-source-tar.mjs "${static_dir}/default/quickjs.tar" \
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
if has_module gamedev-sdk; then
node scripts/build-source-tar.mjs "${static_dir}/gamedev/raylib.tar" \
  "${raylib_dir}/src" /usr/src/raylib/src \
  "${raylib_dir}/LICENSE" /usr/share/licenses/raylib/LICENSE \
  "${raylib_dir}/README.md" /usr/src/raylib/README.md
node scripts/build-source-tar.mjs "${static_dir}/gamedev/box3d.tar" \
  "${box3d_dir}/src" /usr/src/box3d/src \
  "${box3d_dir}/include" /usr/src/box3d/include \
  "${box3d_dir}/LICENSE" /usr/share/licenses/box3d/LICENSE \
  "${box3d_dir}/README.md" /usr/src/box3d/README.md
fi
if has_module cpython; then
node scripts/build-source-tar.mjs "${static_dir}/python/cpython.tar" \
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
node scripts/build-source-tar.mjs "${static_dir}/python/libffi.tar" \
  "${libffi_dir}" /usr/src/libffi \
  "${libffi_dir}/include/ffi.h" /usr/include/ffi.h \
  "${libffi_dir}/include/ffitarget.h" /usr/include/ffitarget.h \
  "${libffi_dir}/LICENSE" /usr/share/licenses/libffi/LICENSE
fi
if has_module pi; then
  node scripts/build-source-tar.mjs "${static_dir}/default/pi-source.tar" \
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
  node scripts/build-source-tar.mjs "${static_dir}/default/pi-generated-model-data.tar" \
    "${project_dir}/node_modules/@earendil-works/pi-ai/dist/providers/data" \
    /usr/src/pi-source/packages/ai/src/providers/data
  node scripts/build-pi-runtime-packages.mjs "${static_dir}/default/pi-runtime-packages.tar"
fi
if has_module zig; then
  zig_sdk_inputs=()
  while IFS= read -r entry; do
    [[ -z "${entry}" || "${entry}" == \#* ]] && continue
    zig_sdk_inputs+=("${zig_dir}/lib/${entry}" "/usr/lib/zig/${entry}")
  done < config/zig-sdk-files.txt
  node scripts/build-source-tar.mjs "${static_dir}/default/zig-lib.tar" \
    "${zig_sdk_inputs[@]}" \
    "${zig_dir}/LICENSE" /usr/share/licenses/zig/LICENSE
fi
if has_module ghostty; then
node scripts/build-source-tar.mjs "${static_dir}/default/ghostty.tar" \
  "${ghostty_dir}/src" /usr/src/ghostty/src \
  "${ghostty_dir}/include/ghostty" /usr/include/ghostty \
  "${ghostty_dir}/include/ghostty.h" /usr/include/ghostty.h \
  "${ghostty_dir}/LICENSE" /usr/share/licenses/ghostty/LICENSE \
  "${project_dir}/src/ghostty/generated" /usr/src/ghostty/generated
node scripts/build-source-tar.mjs "${static_dir}/default/uucode.tar" \
  "${uucode_dir}/src" /usr/src/uucode/src \
  "${uucode_dir}/LICENSE.md" /usr/share/licenses/uucode/LICENSE.md
fi

if [[ -d "${project_dir}/dist/static" ]]; then
  mv -- "${project_dir}/dist/static" "${staging}/previous"
fi
if ! mv -- "${static_dir}" "${project_dir}/dist/static"; then
  if [[ -d "${staging}/previous" ]]; then
    mv -- "${staging}/previous" "${project_dir}/dist/static"
  fi
  exit 1
fi
node scripts/update-module-pins.mjs --sources
node scripts/verify-static-sources.mjs
