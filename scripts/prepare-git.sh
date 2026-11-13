#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source "${project_dir}/scripts/prepared-source.sh"
source_dir="$("${project_dir}/scripts/fetch-pinned-checkout.sh" git)"
prepared_source git "${DOLLY_GIT_COMMIT}" "" "${BASH_SOURCE[0]}" \
  "${project_dir}/config/git-dolly.patch" "${project_dir}/scripts/generate-git-sources.mjs"

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

publish_prepared_source
