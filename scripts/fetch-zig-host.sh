#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"

case "$(uname -s):$(uname -m)" in
  Linux:x86_64)
    platform=x86_64-linux
    url="${DOLLY_ZIG_HOST_X86_64_LINUX_URL}"
    sha256="${DOLLY_ZIG_HOST_X86_64_LINUX_SHA256}"
    ;;
  Linux:aarch64|Linux:arm64)
    platform=aarch64-linux
    url="${DOLLY_ZIG_HOST_AARCH64_LINUX_URL}"
    sha256="${DOLLY_ZIG_HOST_AARCH64_LINUX_SHA256}"
    ;;
  *)
    echo "dolly: native Zig stage zero supports x86_64-linux and aarch64-linux hosts" >&2
    exit 1
    ;;
esac

archive="${project_dir}/.cache/zig-${platform}-${DOLLY_ZIG_VERSION}.tar.xz"
source_dir="${project_dir}/.cache/zig-${platform}-${DOLLY_ZIG_VERSION}"
mkdir -p "${project_dir}/.cache"

if [[ ! -f "${archive}" ]] || ! echo "${sha256}  ${archive}" | sha256sum --check --status; then
  temporary="$(mktemp "${project_dir}/.cache/zig-host.XXXXXX")"
  trap 'rm -f -- "${temporary}"' EXIT
  curl --fail --location --silent --show-error "${url}" --output "${temporary}"
  echo "${sha256}  ${temporary}" | sha256sum --check --status
  mv -- "${temporary}" "${archive}"
  trap - EXIT
fi

if [[ ! -x "${source_dir}/zig" ]]; then
  temporary_dir="$(mktemp -d "${project_dir}/.cache/zig-host-extract.XXXXXX")"
  trap 'rm -rf -- "${temporary_dir}"' EXIT
  tar -xJf "${archive}" -C "${temporary_dir}" --strip-components=1
  mv -- "${temporary_dir}" "${source_dir}"
  trap - EXIT
fi

printf '%s\n' "${source_dir}"
