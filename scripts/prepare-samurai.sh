#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source "${project_dir}/scripts/prepared-source.sh"
source_dir="$("${project_dir}/scripts/fetch-pinned-checkout.sh" samurai)"
prepared_source samurai "${DOLLY_SAMURAI_COMMIT}" "" "${BASH_SOURCE[0]}"
git -C "${source_dir}" archive --format=tar "${DOLLY_SAMURAI_COMMIT}" |
  tar -xf - -C "${temporary}"
# Preserve the compact public top-level-files-only build input. Repository CI
# and editor metadata are pinned by the commit but are not compiler inputs.
rm -rf -- "${temporary}/.builds" "${temporary}/.github"
rm -f -- "${temporary}/.clang-format" "${temporary}/.gitignore"
publish_prepared_source
