#!/usr/bin/env bash
set -euo pipefail
if [[ $# != 3 || ! "${2:-}" =~ ^[a-f0-9]{64}$ ]]; then
  echo 'usage: fetch-verified-file.sh URL SHA256 OUTPUT' >&2
  exit 64
fi
url="$1"
expected="$2"
output="$3"
if [[ -f "${output}" ]]; then
  actual="$(sha256sum < "${output}")"
  if [[ "${actual%% *}" == "${expected}" ]]; then
    printf '%s\n' "${output}"
    exit 0
  fi
  echo "dolly: cached source checksum failed; fetching a verified replacement: ${output}" >&2
elif [[ -e "${output}" ]]; then
  echo "dolly: source cache target is not a file: ${output}" >&2
  exit 1
fi
mkdir -p -- "$(dirname -- "${output}")"
temporary="$(mktemp "$(dirname -- "${output}")/.dolly-download.XXXXXX")"
trap 'rm -f -- "${temporary}"' EXIT
curl --fail --location --silent --show-error --retry 3 --output "${temporary}" -- "${url}"
actual="$(sha256sum < "${temporary}")"
if [[ "${actual%% *}" != "${expected}" ]]; then
  echo "dolly: downloaded source checksum mismatch: ${output}" >&2
  exit 1
fi
mv -T -- "${temporary}" "${output}"
printf '%s\n' "${output}"
