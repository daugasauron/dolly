#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source_dir="$("${project_dir}/scripts/fetch-samurai.sh")"
output_dir="${project_dir}/build/generated/samurai-source"
temporary="$(mktemp -d "${project_dir}/build/generated/samurai-source.XXXXXX")"
trap 'rm -rf -- "${temporary}"' EXIT

git -C "${source_dir}" archive --format=tar "${DOLLY_SAMURAI_COMMIT}" |
  tar -xf - -C "${temporary}"
# Preserve the established source bundle's public top-level-files-only shape.
# CI/editor metadata is pinned but is not an input to the in-Wasm build.
rm -rf -- "${temporary}/.builds" "${temporary}/.github"
rm -f -- "${temporary}/.clang-format" "${temporary}/.gitignore"

# Keep Samurai's Ninja parser, graph, depfile handling, and build log intact.
# The only target-specific change replaces its POSIX process scheduler with
# Dolly's deliberately serial /bin/slop lifecycle adapter.
patch --silent --no-backup-if-mismatch -d "${temporary}" -p1 \
  < "${project_dir}/config/samurai-dolly.patch"

# Never expose a partially copied or partially patched source tree. The
# generated directory is published by one rename only after every input and
# patch operation has succeeded; the EXIT trap owns interrupted staging state.
rm -rf -- "${output_dir}"
mv -- "${temporary}" "${output_dir}"
trap - EXIT
printf '%s\n' "${output_dir}"
