#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
host_dir="$("${project_dir}/scripts/fetch-zig-host.sh")"
zig_dir="$("${project_dir}/scripts/prepare-zig-native.sh")"
output_dir="${project_dir}/build/native-zig"
object="${output_dir}/zig-native.o"
module="${output_dir}/zig-native.wasm"
stamp="${output_dir}/build-inputs.sha256"
mkdir -p "${output_dir}"

build_digest="$({
  printf '%s\n' \
    'target=wasm64-emscripten' \
    'cpu=generic+atomics' \
    'optimize=ReleaseSmall' \
    'pic=true' \
    'single-threaded=true' \
    'compiler-rt=true' \
    'libc=true'
  sha256sum \
    "${project_dir}/config/source-pins.sh" \
    "${project_dir}/patches/zig-0.16.0-dolly-native.patch" \
    "${project_dir}/scripts/build-native-zig.sh" \
    "${project_dir}/abi/dolly-0.wat" \
    "${project_dir}/src/zig/native-main.zig" \
    "${project_dir}/src/zig/native-build-options.zig" \
    "${project_dir}/bin/dolly-cc"
} | sha256sum | cut -d ' ' -f 1)"

if [[ -f "${object}" && -f "${module}" && -f "${stamp}" &&
      "$(<"${stamp}")" == "${build_digest}" ]] &&
   node "${project_dir}/scripts/dolly-abi.mjs" validate-command \
     "${project_dir}/build/dolly-0.wasm" "${module}" >/dev/null; then
  printf '%s\n' "${module}"
  exit 0
fi

rm -f -- "${stamp}" "${module}"
"${host_dir}/zig" build-obj \
  --zig-lib-dir "${zig_dir}/lib" \
  -target wasm64-emscripten \
  -mcpu=generic+atomics \
  -OReleaseSmall \
  -fPIC \
  -fsingle-threaded \
  -fcompiler-rt \
  -lc \
  --name zig-native \
  -femit-bin="${object}" \
  --dep compiler \
  -Mroot="${project_dir}/src/zig/native-main.zig" \
  --dep build_options --dep aro \
  -Mcompiler="${zig_dir}/src/main.zig" \
  -Mbuild_options="${project_dir}/src/zig/native-build-options.zig" \
  -Maro="${zig_dir}/lib/compiler/aro/aro.zig"

(cd "${project_dir}" && ./bin/dolly-cc "${object}" -o "${module}") >&2
printf '%s\n' "${build_digest}" > "${stamp}"
printf '%s\n' "${module}"
