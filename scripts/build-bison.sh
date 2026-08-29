#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
version="${DOLLY_BISON_VERSION}"
sha256="${DOLLY_BISON_SHA256}"
archive="${project_dir}/.cache/bison-${version}.tar.xz"
source_dir="${project_dir}/.cache/bison-${version}-source"
build_dir="${project_dir}/.cache/bison-${version}-build"
install_dir="${project_dir}/.cache/bison-${version}-host"
url="${DOLLY_BISON_URL}"
jobs="${DOLLY_BUILD_JOBS:-2}"
if ((jobs > 12)); then
  jobs=12
fi

mkdir -p "${project_dir}/.cache"
if [[ ! -f "${archive}" ]]; then
  curl --fail --location --output "${archive}" "${url}"
fi
printf '%s  %s\n' "${sha256}" "${archive}" | sha256sum --check --status

if [[ ! -d "${source_dir}" ]]; then
  mkdir "${source_dir}"
  tar -xJf "${archive}" --strip-components=1 -C "${source_dir}"
fi

if [[ ! -x "${install_dir}/bin/bison" ]]; then
  mkdir -p "${build_dir}"
  (
    cd "${build_dir}"
    "${source_dir}/configure" --prefix="${install_dir}" --disable-nls
    make -j"${jobs}"
    make install
  )
fi

actual="$("${install_dir}/bin/bison" --version | sed -n '1s/.* //p')"
if [[ "${actual}" != "${version}" ]]; then
  echo "dolly: expected Bison ${version}, found ${actual}" >&2
  exit 1
fi

printf '%s\n' "${install_dir}/bin/bison"
