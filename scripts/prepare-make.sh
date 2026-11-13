#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source "${project_dir}/scripts/prepared-source.sh"
archive="${project_dir}/.cache/make-${DOLLY_MAKE_VERSION}.tar.gz"
prepared_source make "${DOLLY_MAKE_VERSION}" "make=${DOLLY_MAKE_SHA256} emsdk=${DOLLY_EMSDK_IMAGE}" \
  "${BASH_SOURCE[0]}" "${project_dir}/config/make-dolly.patch" "${project_dir}/config/make-sources.txt"
# Configure runs in a tree of its own; the prepared one holds what it generated.
configured="$(mktemp -d "${project_dir}/build/generated/make-config.XXXXXX")"
trap 'rm -rf -- "${temporary}" "${configured}"' EXIT

"${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_MAKE_URL}" "${DOLLY_MAKE_SHA256}" "${archive}" >/dev/null
mkdir -p "${temporary}/src" "${temporary}/lib"
tar -xzf "${archive}" -C "${configured}" --strip-components=1
patch --silent -d "${configured}" -p1 < "${project_dir}/config/make-dolly.patch"

if command -v podman >/dev/null 2>&1; then
  container=(podman run --rm --userns=keep-id \
    -v "${project_dir}:/src" \
    -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache" \
    -w "/src/${configured#"${project_dir}/"}" "${DOLLY_EMSDK_IMAGE}")
elif command -v docker >/dev/null 2>&1; then
  container=(docker run --rm -u "$(id -u):$(id -g)" \
    -v "${project_dir}:/src" \
    -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache" \
    -w "/src/${configured#"${project_dir}/"}" "${DOLLY_EMSDK_IMAGE}")
else
  echo "dolly: podman or docker is required to configure GNU Make" >&2
  exit 1
fi

"${container[@]}" /usr/bin/env \
  ac_cv_func_eaccess=no \
  ac_cv_func_getrlimit=no \
  ac_cv_func_mkfifo=no \
  ac_cv_func_setrlimit=no \
  ac_cv_func_ttyname=no \
  /emsdk/upstream/emscripten/emconfigure ./configure \
    --host=wasm64-unknown-emscripten \
    --build=x86_64-pc-linux-gnu \
    --prefix=/usr \
    --disable-dependency-tracking \
    --disable-load \
    --disable-nls \
    --without-guile \
    CFLAGS="-m64 -O2" \
    LDFLAGS="-m64" >/dev/null

# Configure determines the target feature set. These three generated headers
# are pure text transformations; all executable objects are compiled later by
# Dolly's in-Wasm compiler.
{
  printf '%s\n' '/* DO NOT EDIT! GENERATED AUTOMATICALLY! */'
  sed 's/@HAVE_ALLOCA_H@/1/g' "${configured}/lib/alloca.in.h"
} > "${configured}/lib/alloca.h"
for header in fnmatch glob; do
  {
    printf '%s\n' '/* DO NOT EDIT! GENERATED AUTOMATICALLY! */'
    sed -n '1,$p' "${configured}/lib/${header}.in.h"
  } > "${configured}/lib/${header}.h"
done

while IFS= read -r path; do
  mkdir -p "${temporary}/$(dirname -- "${path}")"
  cp -- "${configured}/${path}" "${temporary}/${path}"
done < "${project_dir}/config/make-sources.txt"
cp -- "${configured}"/src/*.h "${temporary}/src/"
cp -- "${configured}"/lib/*.h "${temporary}/lib/"
cp -- "${configured}/COPYING" "${temporary}/COPYING"
cp -- "${project_dir}/config/make-sources.txt" \
  "${temporary}/dolly-sources.txt"

rm -rf -- "${configured}"
publish_prepared_source
