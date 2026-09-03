#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source_dir="$("${project_dir}/scripts/fetch-git.sh")"
recipe_hash="$({
  printf '%s\n' "git=${DOLLY_GIT_COMMIT}"
  sha256sum \
    "${BASH_SOURCE[0]}" \
    "${project_dir}/config/git-dolly.patch" \
    "${project_dir}/scripts/generate-git-sources.mjs" | awk '{print $1}'
} | sha256sum | awk '{print $1}')"
output_dir="${project_dir}/build/generated/git-source-${DOLLY_GIT_COMMIT}-${recipe_hash:0:16}"

if [[ -d "${output_dir}" ]]; then
  printf '%s\n' "${output_dir}"
  exit 0
fi
if [[ -e "${output_dir}" ]]; then
  echo "dolly: prepared Git output is not a directory: ${output_dir}" >&2
  exit 1
fi

mkdir -p "${project_dir}/build/generated"
temporary="$(mktemp -d "${project_dir}/build/generated/.git-source.XXXXXX")"
trap 'rm -rf -- "${temporary}"' EXIT

while IFS= read -r path; do
  mkdir -p "${temporary}/$(dirname -- "${path}")"
  cp -- "${source_dir}/${path}" "${temporary}/${path}"
done < <(git -C "${source_dir}" ls-files '*.c' '*.h')

patch --silent -d "${temporary}" -p1 < "${project_dir}/config/git-dolly.patch"

cp -- "${source_dir}/COPYING" "${temporary}/COPYING"
cp -R -- "${source_dir}/templates" "${temporary}/templates"

"${source_dir}/tools/generate-cmdlist.sh" "${source_dir}" \
  "${temporary}/command-list.h"
"${source_dir}/tools/generate-hooklist.sh" "${source_dir}" \
  "${temporary}/hook-list.h"
"${source_dir}/tools/generate-configlist.sh" "${source_dir}" \
  "${temporary}/config-list.h"
GIT_VERSION="${DOLLY_GIT_VERSION}" \
GIT_BUILT_FROM_COMMIT="${DOLLY_GIT_COMMIT}" \
GIT_USER_AGENT="git/${DOLLY_GIT_VERSION}-dolly" \
  "${source_dir}/GIT-VERSION-GEN" "${source_dir}" \
  "${source_dir}/version-def.h.in" "${temporary}/version-def.h"

node "${project_dir}/scripts/generate-git-sources.mjs" \
  "${source_dir}/meson.build" "${temporary}/dolly-sources.txt"

mv -T -- "${temporary}" "${output_dir}"
trap - EXIT
printf '%s\n' "${output_dir}"
