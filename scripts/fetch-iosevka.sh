#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
font_dir="${project_dir}/.cache/fonts"
web_font="${font_dir}/IosevkaTerm-SemiBold.woff2"
runtime_font="${font_dir}/IosevkaTerm-SemiBold.ttf"

mkdir -p "${font_dir}"
if [[ ! -f "${web_font}" ]]; then
  temporary="$(mktemp "${font_dir}/iosevka-web.XXXXXX")"
  trap 'rm -f -- "${temporary}"' EXIT
  curl --fail --location --output "${temporary}" "${DOLLY_IOSEVKA_URL}"
  printf '%s  %s\n' "${DOLLY_IOSEVKA_SHA256}" "${temporary}" |
    sha256sum --check --status
  mv -- "${temporary}" "${web_font}"
  trap - EXIT
fi
if [[ ! -f "${runtime_font}" ]]; then
  temporary="$(mktemp "${font_dir}/iosevka-runtime.XXXXXX")"
  trap 'rm -f -- "${temporary}"' EXIT
  curl --fail --location --output "${temporary}" "${DOLLY_IOSEVKA_TTF_URL}"
  printf '%s  %s\n' "${DOLLY_IOSEVKA_TTF_SHA256}" "${temporary}" |
    sha256sum --check --status
  mv -- "${temporary}" "${runtime_font}"
  trap - EXIT
fi
printf '%s  %s\n' "${DOLLY_IOSEVKA_SHA256}" "${web_font}" | sha256sum --check --status
printf '%s  %s\n' "${DOLLY_IOSEVKA_TTF_SHA256}" "${runtime_font}" | sha256sum --check --status
printf '%s\n%s\n' "${web_font}" "${runtime_font}"
