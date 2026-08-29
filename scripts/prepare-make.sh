#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="${project_dir}/.cache/make-${DOLLY_MAKE_VERSION}.tar.gz"
output_dir="${project_dir}/build/generated/make-source"
temporary="$(mktemp -d "${project_dir}/build/generated/make-config.XXXXXX")"
trap 'rm -rf -- "${temporary}"' EXIT

"${project_dir}/scripts/fetch-make.sh" >/dev/null
rm -rf -- "${output_dir}"
mkdir -p "${output_dir}/src" "${output_dir}/lib"
tar -xzf "${archive}" -C "${temporary}" --strip-components=1
patch --silent -d "${temporary}" -p1 < "${project_dir}/config/make-dolly.patch"
cp -- "${project_dir}/src/runtimes/make-dolly.c" \
  "${temporary}/src/remote-stub.c"

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
  echo "dolly: podman or docker is required to configure GNU Make" >&2
  exit 1
fi

"${container[@]}" /usr/bin/env \
  ac_cv_func_eaccess=no \
  ac_cv_func_getrlimit=no \
  ac_cv_func_mkfifo=no \
  ac_cv_func_pselect=no \
  ac_cv_func_setrlimit=no \
  ac_cv_func_ttyname=no \
  /emsdk/upstream/emscripten/emconfigure ./configure \
    --host=wasm64-unknown-emscripten \
    --build=x86_64-pc-linux-gnu \
    --prefix=/usr \
    --disable-dependency-tracking \
    --disable-load \
    --disable-nls \
    --disable-posix-spawn \
    --without-guile \
    CFLAGS="-m64 -O2 -DDOLLY" \
    LDFLAGS="-m64" >/dev/null

# Configure determines the target feature set. These three generated headers
# are pure text transformations; all executable objects are compiled later by
# Dolly's in-Wasm compiler.
{
  printf '%s\n' '/* DO NOT EDIT! GENERATED AUTOMATICALLY! */'
  sed 's/@HAVE_ALLOCA_H@/1/g' "${temporary}/lib/alloca.in.h"
} > "${temporary}/lib/alloca.h"
for header in fnmatch glob; do
  {
    printf '%s\n' '/* DO NOT EDIT! GENERATED AUTOMATICALLY! */'
    sed -n '1,$p' "${temporary}/lib/${header}.in.h"
  } > "${temporary}/lib/${header}.h"
done

while IFS= read -r path; do
  mkdir -p "${output_dir}/$(dirname -- "${path}")"
  cp -- "${temporary}/${path}" "${output_dir}/${path}"
done < "${project_dir}/config/make-sources.txt"
cp -- "${temporary}"/src/*.h "${output_dir}/src/"
cp -- "${temporary}"/lib/*.h "${output_dir}/lib/"
cp -- "${temporary}/COPYING" "${output_dir}/COPYING"
cp -- "${project_dir}/config/make-sources.txt" \
  "${output_dir}/dolly-sources.txt"

printf '%s\n' "${output_dir}"
