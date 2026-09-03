#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source_dir="$("${project_dir}/scripts/fetch-samurai.sh")"
recipe_hash="$(sha256sum "${project_dir}/config/samurai-dolly.patch" | cut -d' ' -f1)"
output_dir="${project_dir}/build/generated/samurai-source-${DOLLY_SAMURAI_COMMIT}-${recipe_hash:0:16}"
temporary=""

if [[ -d "${output_dir}" ]]; then
  printf '%s\n' "${output_dir}"
  exit 0
fi
if [[ -e "${output_dir}" ]]; then
  echo "dolly: prepared Samurai output is not a directory: ${output_dir}" >&2
  exit 1
fi

cleanup() {
  if [[ -n "${temporary}" ]]; then
    rm -rf -- "${temporary}"
  fi
}
trap cleanup EXIT

mkdir -p "${project_dir}/build/generated"
temporary="$(mktemp -d "${project_dir}/build/generated/.samurai-source.XXXXXX")"
git -C "${source_dir}" archive --format=tar "${DOLLY_SAMURAI_COMMIT}" |
  tar -xf - -C "${temporary}"
# Preserve the compact public top-level-files-only build input. Repository CI
# and editor metadata are pinned by the commit but are not compiler inputs.
rm -rf -- "${temporary}/.builds" "${temporary}/.github"
rm -f -- "${temporary}/.clang-format" "${temporary}/.gitignore"

# Keep Samurai's Ninja parser, graph, depfile handling, and build log intact.
# The only target-specific change replaces its POSIX process scheduler with
# Dolly's deliberately serial /bin/slop lifecycle adapter.
patch --silent --no-backup-if-mismatch -d "${temporary}" -p1 \
  < "${project_dir}/config/samurai-dolly.patch"

# The input-addressed destination never replaces a previous result. Renaming
# the fully patched sibling publishes it as one filesystem operation.
mv -T -- "${temporary}" "${output_dir}"
temporary=""
printf '%s\n' "${output_dir}"
