#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="$("${project_dir}/scripts/fetch-libffi.sh")"
recipe_hash="$({
  printf '%s\n' \
    "libffi=${DOLLY_LIBFFI_SHA256}" \
    "emsdk=${DOLLY_EMSDK_IMAGE}"
  sha256sum "${BASH_SOURCE[0]}" | awk '{print $1}'
} | sha256sum | awk '{print $1}')"
output_dir="${project_dir}/build/generated/libffi-source-${DOLLY_LIBFFI_VERSION}-${recipe_hash:0:16}"

if [[ -d "${output_dir}" ]]; then
  printf '%s\n' "${output_dir}"
  exit 0
fi
if [[ -e "${output_dir}" ]]; then
  echo "dolly: prepared libffi output is not a directory: ${output_dir}" >&2
  exit 1
fi

mkdir -p "${project_dir}/build/generated"
temporary=""
staging=""
cleanup() {
  [[ -z "${temporary}" ]] || rm -rf -- "${temporary}"
  [[ -z "${staging}" ]] || rm -rf -- "${staging}"
}
trap cleanup EXIT
temporary="$(mktemp -d "${project_dir}/build/generated/libffi-config.XXXXXX")"
staging="$(mktemp -d "${project_dir}/build/generated/.libffi-source.XXXXXX")"
tar -xzf "${archive}" -C "${temporary}" --strip-components=1

if command -v podman >/dev/null 2>&1; then
  container=(podman run --rm --userns=keep-id \
    -v "${project_dir}:/src" \
    -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache" \
    -w "/src/${temporary#"${project_dir}/"}" "${DOLLY_EMSDK_IMAGE}")
elif command -v docker >/dev/null 2>&1; then
  container=(docker run --rm -u "$(id -u):$(id -g)" \
    -v "${project_dir}:/src" \
    -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache" \
    -w "/src/${temporary#"${project_dir}/"}" "${DOLLY_EMSDK_IMAGE}")
else
  echo "dolly: podman or docker is required to configure libffi" >&2
  exit 1
fi

"${container[@]}" /usr/bin/env \
  CHOST=wasm64-unknown-linux \
  CFLAGS='-m64 -O2 -fPIC' \
  CXXFLAGS='-m64 -O2 -fPIC' \
  /emsdk/upstream/emscripten/emconfigure ./configure \
    --host=wasm64-unknown-linux \
    --build=x86_64-pc-linux-gnu \
    --prefix=/usr \
    --enable-static \
    --disable-shared \
    --disable-dependency-tracking \
    --disable-builddir \
    --disable-multi-os-directory \
    --disable-raw-api \
    --disable-docs >/dev/null

mkdir -p "${staging}/include" "${staging}/src/wasm"
cp -- "${temporary}/include/ffi.h" "${staging}/include/ffi.h"
cp -- "${temporary}/src/wasm/ffitarget.h" "${staging}/include/ffitarget.h"
cp -- "${temporary}/fficonfig.h" "${staging}/fficonfig.h"
for source in prep_cif.c types.c raw_api.c java_raw_api.c closures.c tramp.c; do
  cp -- "${temporary}/src/${source}" "${staging}/src/${source}"
done
cp -- "${temporary}/include/ffi_common.h" "${staging}/include/ffi_common.h"
cp -- "${temporary}/include/tramp.h" "${staging}/include/tramp.h"
cp -- "${temporary}/LICENSE" "${staging}/LICENSE"

mv -T -- "${staging}" "${output_dir}"
staging=""
rm -rf -- "${temporary}"
temporary=""
trap - EXIT
printf '%s\n' "${output_dir}"
