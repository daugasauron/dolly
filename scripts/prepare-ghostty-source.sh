#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source_dir="${1:-}"
manifest="${project_dir}/config/ghostty-source-manifest.txt"
patch_file="${project_dir}/config/ghostty-dolly.patch"

if [[ ! -f "${source_dir}/src/lib_vt.zig" || ! -f "${source_dir}/include/ghostty/vt.h" ]]; then
  echo "dolly: prepare-ghostty-source requires the pinned Ghostty checkout" >&2
  exit 64
fi

actual="$(git -C "${source_dir}" rev-parse HEAD)"
if [[ "${actual}" != "${DOLLY_GHOSTTY_COMMIT}" ]]; then
  echo "dolly: expected Ghostty ${DOLLY_GHOSTTY_COMMIT}, found ${actual}" >&2
  exit 1
fi
if [[ -n "$(git -C "${source_dir}" status --porcelain)" ]]; then
  echo "dolly: pinned Ghostty checkout has local source changes" >&2
  exit 1
fi

recipe_hash="$(sha256sum "${manifest}" "${patch_file}" | sha256sum | cut -d' ' -f1)"
output_dir="${project_dir}/.cache/ghostty-dolly-${DOLLY_GHOSTTY_COMMIT}-${recipe_hash:0:16}"
if [[ -f "${output_dir}/.dolly-source" ]]; then
  printf '%s\n' "${output_dir}"
  exit 0
fi
if [[ -e "${output_dir}" ]]; then
  echo "dolly: incomplete prepared Ghostty tree at ${output_dir}" >&2
  exit 1
fi

temporary="$(mktemp -d "${project_dir}/.cache/ghostty-dolly-prepare.XXXXXX")"
trap 'rm -rf -- "${temporary}"' EXIT

while IFS= read -r relative; do
  [[ -n "${relative}" ]] || continue
  if [[ ! -f "${source_dir}/${relative}" ]]; then
    echo "dolly: Ghostty source manifest entry is missing: ${relative}" >&2
    exit 1
  fi
  mkdir -p "${temporary}/$(dirname -- "${relative}")"
  cp -- "${source_dir}/${relative}" "${temporary}/${relative}"
done < "${manifest}"

cp -a -- "${source_dir}/include" "${temporary}/include"
cp -- "${source_dir}/LICENSE" "${temporary}/LICENSE"
patch --quiet --directory "${temporary}" --strip=1 < "${patch_file}"
printf '%s\n%s\n' "${DOLLY_GHOSTTY_COMMIT}" "${recipe_hash}" > "${temporary}/.dolly-source"

mv -- "${temporary}" "${output_dir}"
trap - EXIT
printf '%s\n' "${output_dir}"
