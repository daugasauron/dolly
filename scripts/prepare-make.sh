#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="${project_dir}/.cache/make-${DOLLY_MAKE_VERSION}.tar.gz"
recipe_hash="$({
  printf '%s\n' \
    "make=${DOLLY_MAKE_SHA256}" \
    "emsdk=${DOLLY_EMSDK_IMAGE}"
  sha256sum \
    "${BASH_SOURCE[0]}" \
    "${project_dir}/config/make-dolly.patch" \
    "${project_dir}/config/make-sources.txt" \
    "${project_dir}/src/runtimes/make-dolly.c" | awk '{print $1}'
} | sha256sum | awk '{print $1}')"
output_dir="${project_dir}/build/generated/make-source-${DOLLY_MAKE_VERSION}-${recipe_hash:0:16}"

if [[ -d "${output_dir}" ]]; then
  printf '%s\n' "${output_dir}"
  exit 0
fi
if [[ -e "${output_dir}" ]]; then
  echo "dolly: prepared GNU Make output is not a directory: ${output_dir}" >&2
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
temporary="$(mktemp -d "${project_dir}/build/generated/make-config.XXXXXX")"
staging="$(mktemp -d "${project_dir}/build/generated/.make-source.XXXXXX")"

"${project_dir}/scripts/fetch-make.sh" >/dev/null
mkdir -p "${staging}/src" "${staging}/lib"
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
  mkdir -p "${staging}/$(dirname -- "${path}")"
  cp -- "${temporary}/${path}" "${staging}/${path}"
done < "${project_dir}/config/make-sources.txt"
cp -- "${temporary}"/src/*.h "${staging}/src/"
cp -- "${temporary}"/lib/*.h "${staging}/lib/"
cp -- "${temporary}/COPYING" "${staging}/COPYING"
cp -- "${project_dir}/config/make-sources.txt" \
  "${staging}/dolly-sources.txt"

mv -T -- "${staging}" "${output_dir}"
staging=""
rm -rf -- "${temporary}"
temporary=""
trap - EXIT
printf '%s\n' "${output_dir}"
