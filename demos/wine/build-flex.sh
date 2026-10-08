#!/usr/bin/env bash
# Builds the pinned flex for the host (as scripts/build-bison.sh does Bison) and prints its path.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
install_dir="${project_dir}/.cache/flex-${DOLLY_FLEX_VERSION}-host"
if [[ ! -x "${install_dir}/bin/flex" ]]; then
  archive="$("${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_FLEX_URL}" "${DOLLY_FLEX_SHA256}" \
    "${project_dir}/.cache/flex-${DOLLY_FLEX_VERSION}.tar.gz")"
  build_dir="$(mktemp -d "${project_dir}/.cache/flex-build.XXXXXX")"
  trap 'rm -rf -- "${build_dir}"' EXIT
  tar -xzf "${archive}" --strip-components=1 -C "${build_dir}"
  (
    cd "${build_dir}"
    # _GNU_SOURCE: flex 2.6.4 calls reallocarray without declaring it on a current glibc.
    ./configure --prefix="${install_dir}.partial" --disable-nls --disable-shared CFLAGS='-O1 -D_GNU_SOURCE' > configure.log 2>&1
    make -j"${DOLLY_BUILD_JOBS:-2}" > make.log 2>&1
    make install > install.log 2>&1
  )
  mv -T -- "${install_dir}.partial" "${install_dir}"
fi
actual="$("${install_dir}/bin/flex" --version)"
if [[ "${actual}" != "flex ${DOLLY_FLEX_VERSION}" ]]; then
  echo "dolly: ${install_dir}/bin/flex is ${actual}, not flex ${DOLLY_FLEX_VERSION}" >&2
  exit 1
fi
printf '%s\n' "${install_dir}/bin/flex"
