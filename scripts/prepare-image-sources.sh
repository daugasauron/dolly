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

staging="$(mktemp -d "${project_dir}/dist/.image-sources.XXXXXX")"
cleanup() {
  if [[ -d "${staging}/previous" && ! -e "${project_dir}/dist/static" ]]; then
    mv -- "${staging}/previous" "${project_dir}/dist/static"
  fi
  rm -rf -- "${staging}"
}
trap cleanup EXIT
static_dir="${staging}/static"
mkdir -p "${static_dir}/default"
if [[ -d "${project_dir}/dist/static" ]]; then
  cp -al -- "${project_dir}/dist/static/." "${static_dir}/"
fi

copy_static() {
  local source="$1"
  local destination="$2"
  mkdir -p "$(dirname -- "${static_dir}/${destination}")"
  cp --remove-destination -- "${source}" "${static_dir}/${destination}"
}

# Each demo stages its own inputs in this shell, guarded by has_module.
for demo_sources in "${project_dir}"/demos/*/prepare-sources.sh; do
  source "${demo_sources}"
done

has_module sbase && sbase_dir="$("${project_dir}/scripts/fetch-pinned-checkout.sh" sbase)"
if has_module awk; then
  awk_dir="$("${project_dir}/scripts/fetch-pinned-checkout.sh" awk)"
  awk_generated_dir="$("${project_dir}/scripts/generate-awk.sh")"
fi
has_module curl && curl_dir="$("${project_dir}/scripts/fetch-pinned-checkout.sh" curl)"
has_module zlib && zlib_dir="$("${project_dir}/scripts/prepare-zlib.sh")"
has_module git && git_dir="$("${project_dir}/scripts/prepare-git.sh")"
has_module make && make_dir="$("${project_dir}/scripts/prepare-make.sh")"
has_module ninja && samurai_dir="$("${project_dir}/scripts/prepare-samurai.sh")"
has_module cpp && emscripten_system_dir="$("${project_dir}/scripts/fetch-pinned-checkout.sh" emscripten)"
has_module zig && zig_dir="$("${project_dir}/scripts/prepare-zig-native.sh")"
if has_module ghostty; then
  ghostty_checkout="$("${project_dir}/scripts/fetch-pinned-checkout.sh" ghostty)"
  ghostty_dir="$("${project_dir}/scripts/prepare-ghostty-source.sh" "${ghostty_checkout}")"
  uucode_dir="$("${project_dir}/scripts/fetch-uucode.sh")"
  stb_header="$("${project_dir}/scripts/fetch-stb.sh")"
  mapfile -t font_paths < <(bash "${project_dir}/scripts/fetch-iosevka.sh")
  runtime_font="${font_paths[1]}"
fi
if has_module session-recovery; then
  copy_static src/commands/session-recover.c session-recovery/session-recover.c
  for header in session-records.h fs-record.h; do
    copy_static "src/${header}" "session-recovery/${header}"
  done
fi
if has_module audio; then
  copy_static src/audio/client.c audio/client.c
fi
if has_module gpu; then
  copy_static src/gpu/client.c gpu/client.c
fi
if has_module curl; then
  copy_static "${project_dir}/src/commands/curl.c" default/commands/curl.c
  copy_static "${project_dir}/src/libcurl-fetch.c" default/libcurl-fetch.c
fi
if has_module cpp; then
  node scripts/build-source-tar.mjs "${static_dir}/default/libcxx-headers.tar" \
    "${project_dir}/.cache/emscripten/sysroot/include/c++/v1" /usr/include/c++/v1
  copy_static "${emscripten_system_dir}/system/lib/libcxx/LICENSE.TXT" default/licenses/libcxx
  copy_static "${emscripten_system_dir}/system/lib/libcxxabi/LICENSE.TXT" default/licenses/libcxxabi
fi
if has_module make; then
  copy_static "${project_dir}/src/runtimes/make-amalgamation-dolly.c" default/runtimes/make-amalgamation-dolly.c
fi
if has_module ninja; then
  copy_static "${project_dir}/src/runtimes/samurai-unit-dolly.c" default/runtimes/samurai-unit-dolly.c
fi
if has_module gzip; then
  copy_static src/commands/gzip.c default/commands/gzip.c
fi
if has_module agent-tools; then
  for source in run-program.h install.c tail.c du.c rev.c command.c xargs.c \
      find.c env.c time.c timeout.c realpath.c diff.c patch.c hostname.c tty.c; do
    copy_static "${project_dir}/src/commands/${source}" "default/commands/${source}"
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
  sbase_inputs=()
  for path in "${sbase_dir}"/*.[ch] "${sbase_dir}"/{Makefile,config.mk,libutf,libutil}; do
    sbase_inputs+=("${path}" "/tmp/sbase/${path##*/}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/default/sbase.tar" "${sbase_inputs[@]}" \
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
