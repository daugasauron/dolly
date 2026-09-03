#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source_dir="$("${project_dir}/scripts/fetch-git.sh")"
output_dir="${project_dir}/build/generated/git-source"

rm -rf -- "${output_dir}"
mkdir -p "${output_dir}"

while IFS= read -r path; do
  mkdir -p "${output_dir}/$(dirname -- "${path}")"
  cp -- "${source_dir}/${path}" "${output_dir}/${path}"
done < <(git -C "${source_dir}" ls-files '*.c' '*.h')

patch --silent --no-backup-if-mismatch -d "${output_dir}" -p1 \
  < "${project_dir}/config/git-dolly.patch"

cp -- "${source_dir}/COPYING" "${output_dir}/COPYING"
cp -R -- "${source_dir}/templates" "${output_dir}/templates"

"${source_dir}/tools/generate-cmdlist.sh" "${source_dir}" \
  "${output_dir}/command-list.h"
"${source_dir}/tools/generate-hooklist.sh" "${source_dir}" \
  "${output_dir}/hook-list.h"
"${source_dir}/tools/generate-configlist.sh" "${source_dir}" \
  "${output_dir}/config-list.h"
GIT_VERSION="${DOLLY_GIT_VERSION}" \
GIT_BUILT_FROM_COMMIT="${DOLLY_GIT_COMMIT}" \
GIT_USER_AGENT="git/${DOLLY_GIT_VERSION}-dolly" \
  "${source_dir}/GIT-VERSION-GEN" "${source_dir}" \
  "${source_dir}/version-def.h.in" "${output_dir}/version-def.h"

node "${project_dir}/scripts/generate-git-sources.mjs" \
  "${source_dir}/meson.build" "${output_dir}/dolly-sources.txt"

printf '%s\n' "${output_dir}"
