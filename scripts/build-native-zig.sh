#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
output_dir="${project_dir}/build/native-zig"
object="${output_dir}/zig-native.o"
module="${output_dir}/zig-native.wasm"
object_stamp="${output_dir}/object-inputs.sha256"
module_stamp="${output_dir}/build-inputs.sha256"
mkdir -p "${output_dir}"

object_digest="$({
  printf '%s\n' \
    'dolly-native-zig-object=1' \
    "zig-version=${DOLLY_ZIG_VERSION}" \
    "zig-source=${DOLLY_ZIG_SHA256}" \
    "zig-host-x86-64=${DOLLY_ZIG_HOST_X86_64_LINUX_SHA256}" \
    "zig-host-aarch64=${DOLLY_ZIG_HOST_AARCH64_LINUX_SHA256}" \
    'target=wasm64-emscripten' \
    'cpu=generic+atomics' \
    'optimize=ReleaseSmall' \
    'pic=true' \
    'single-threaded=true' \
    'compiler-rt=true' \
    'libc=true'
  sha256sum \
    "${project_dir}/patches/zig-0.16.0-dolly-native.patch" \
    "${project_dir}/src/zig/native-main.zig" \
    "${project_dir}/src/zig/native-build-options.zig"
} | sha256sum | cut -d ' ' -f 1)"
module_digest="$({
  printf '%s\n' \
    'dolly-native-zig-module=1' \
    "object=${object_digest}" \
    "emsdk=${DOLLY_EMSDK_IMAGE}"
  sha256sum \
    "${project_dir}/abi/dolly-0.wat" \
    "${project_dir}/bin/dolly-cc"
} | sha256sum | cut -d ' ' -f 1)"

if [[ -f "${module}" && -f "${module_stamp}" &&
      "$(<"${module_stamp}")" == "${module_digest}" ]] &&
   node "${project_dir}/scripts/dolly-abi.mjs" validate-command \
     "${project_dir}/build/dolly-0.wasm" "${module}" >/dev/null; then
  printf '%s\n' "${module}"
  exit 0
fi

temporary_dir="$(mktemp -d "${output_dir}/.native-zig.XXXXXX")"
trap 'rm -rf -- "${temporary_dir}"' EXIT
temporary_object="${temporary_dir}/zig-native.o"
temporary_object_stamp="${temporary_dir}/object-inputs.sha256"
temporary_module="${temporary_dir}/zig-native.wasm"
temporary_module_stamp="${temporary_dir}/build-inputs.sha256"

if [[ ! -f "${object}" || ! -f "${object_stamp}" ||
      "$(<"${object_stamp}")" != "${object_digest}" ]]; then
  host_dir="$("${project_dir}/scripts/fetch-zig-host.sh")"
  zig_dir="$("${project_dir}/scripts/prepare-zig-native.sh")"
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
    -femit-bin="${temporary_object}" \
    --dep compiler \
    -Mroot="${project_dir}/src/zig/native-main.zig" \
    --dep build_options --dep aro \
    -Mcompiler="${zig_dir}/src/main.zig" \
    -Mbuild_options="${project_dir}/src/zig/native-build-options.zig" \
    -Maro="${zig_dir}/lib/compiler/aro/aro.zig"
  printf '%s\n' "${object_digest}" > "${temporary_object_stamp}"
  mv -- "${temporary_object}" "${object}"
  mv -- "${temporary_object_stamp}" "${object_stamp}"
fi

(cd "${project_dir}" && ./bin/dolly-cc "${object}" -o "${temporary_module}") >&2
node "${project_dir}/scripts/dolly-abi.mjs" validate-command \
  "${project_dir}/build/dolly-0.wasm" "${temporary_module}" >/dev/null
printf '%s\n' "${module_digest}" > "${temporary_module_stamp}"

# Each stamp is published after its corresponding validated artifact. An ABI
# change relinks the cached object; it does not rebuild the Zig frontend.
mv -- "${temporary_module}" "${module}"
mv -- "${temporary_module_stamp}" "${module_stamp}"
printf '%s\n' "${module}"
