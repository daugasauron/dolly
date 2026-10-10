#!/usr/bin/env bash
# Builds the pinned gperf for the host (as build-flex.sh does flex) and prints its path.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
install_dir="${project_dir}/.cache/gperf-${DOLLY_GPERF_VERSION}-host"
if [[ ! -x "${install_dir}/bin/gperf" ]]; then
  archive="$("${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_GPERF_URL}" "${DOLLY_GPERF_SHA256}" \
    "${project_dir}/.cache/gperf-${DOLLY_GPERF_VERSION}.tar.gz")"
  build_dir="$(mktemp -d "${project_dir}/.cache/gperf-build.XXXXXX")"
  trap 'rm -rf -- "${build_dir}"' EXIT
  tar -xzf "${archive}" --strip-components=1 -C "${build_dir}"
  (
    cd "${build_dir}"
    # gperf 3.1 uses the register keyword, which C++17 removed.
    ./configure --prefix="${install_dir}.partial" CXXFLAGS='-O1 -std=gnu++11' > configure.log 2>&1
    make -j"${DOLLY_BUILD_JOBS:-2}" > make.log 2>&1
    make install > install.log 2>&1
  )
  mv -T -- "${install_dir}.partial" "${install_dir}"
fi
actual="$("${install_dir}/bin/gperf" --version | head -n 1)"
if [[ "${actual}" != "GNU gperf ${DOLLY_GPERF_VERSION}" ]]; then
  echo "dolly: ${install_dir}/bin/gperf is ${actual}, not GNU gperf ${DOLLY_GPERF_VERSION}" >&2
  exit 1
fi
printf '%s\n' "${install_dir}/bin/gperf"
