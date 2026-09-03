#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
version="${DOLLY_BISON_VERSION}"
sha256="${DOLLY_BISON_SHA256}"
archive="${project_dir}/.cache/bison-${version}.tar.xz"
source_dir="${project_dir}/.cache/bison-${version}-source"
install_dir="${project_dir}/.cache/bison-${version}-host"
url="${DOLLY_BISON_URL}"
jobs="${DOLLY_BUILD_JOBS:-2}"
if ((jobs > 12)); then
  jobs=12
fi

mkdir -p "${project_dir}/.cache"
temporary_archive=""
temporary_source=""
temporary_build=""
temporary_install=""
cleanup() {
  [[ -z "${temporary_archive}" ]] || rm -f -- "${temporary_archive}"
  [[ -z "${temporary_source}" ]] || rm -rf -- "${temporary_source}"
  [[ -z "${temporary_build}" ]] || rm -rf -- "${temporary_build}"
  [[ -z "${temporary_install}" ]] || rm -rf -- "${temporary_install}"
}
trap cleanup EXIT

if [[ ! -f "${archive}" ]]; then
  temporary_archive="$(mktemp "${project_dir}/.cache/bison-download.XXXXXX")"
  curl --fail --location --output "${temporary_archive}" "${url}"
  printf '%s  %s\n' "${sha256}" "${temporary_archive}" |
    sha256sum --check --status
  mv -- "${temporary_archive}" "${archive}"
  temporary_archive=""
fi
printf '%s  %s\n' "${sha256}" "${archive}" | sha256sum --check --status

if [[ ! -d "${source_dir}" ]]; then
  temporary_source="$(mktemp -d "${project_dir}/.cache/bison-source.XXXXXX")"
  tar -xJf "${archive}" --strip-components=1 -C "${temporary_source}"
  mv -- "${temporary_source}" "${source_dir}"
  temporary_source=""
fi

if [[ ! -x "${install_dir}/bin/bison" ]]; then
  temporary_build="$(mktemp -d "${project_dir}/.cache/bison-build.XXXXXX")"
  temporary_install="$(mktemp -d "${project_dir}/.cache/bison-install.XXXXXX")"
  (
    cd "${temporary_build}"
    "${source_dir}/configure" --prefix="${install_dir}" --disable-nls
    make -j"${jobs}"
    make DESTDIR="${temporary_install}" install
  )
  staged_install="${temporary_install}${install_dir}"
  if [[ ! -x "${staged_install}/bin/bison" ]]; then
    echo "dolly: staged Bison install did not produce bin/bison" >&2
    exit 1
  fi
  rm -rf -- "${install_dir}"
  mv -- "${staged_install}" "${install_dir}"
fi

actual="$("${install_dir}/bin/bison" --version | sed -n '1s/.* //p')"
if [[ "${actual}" != "${version}" ]]; then
  echo "dolly: expected Bison ${version}, found ${actual}" >&2
  exit 1
fi

printf '%s\n' "${install_dir}/bin/bison"
