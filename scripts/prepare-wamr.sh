#!/usr/bin/env bash
# WAMR's core at its pin with config/wamr-dolly.patch, which adds WebAssembly
# as a build target: WAMR knows only real CPUs, and a host that names one of
# them claims an ABI it does not have. Prints the prepared directory.
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source_dir="$("${project_dir}/scripts/fetch-pinned-checkout.sh" wamr)"
recipe_hash="$(sha256sum "${BASH_SOURCE[0]}" "${project_dir}/config/wamr-dolly.patch" | awk '{print $1}' | sha256sum | awk '{print $1}')"
output_dir="${project_dir}/build/generated/wamr-source-${DOLLY_WAMR_COMMIT}-${recipe_hash:0:16}"

if [[ -d "${output_dir}" ]]; then
  printf '%s\n' "${output_dir}"
  exit 0
fi
mkdir -p "${project_dir}/build/generated"
staging="$(mktemp -d "${project_dir}/build/generated/.wamr-source.XXXXXX")"
trap 'rm -rf -- "${staging}"' EXIT
git -C "${source_dir}" archive --format=tar "${DOLLY_WAMR_COMMIT}" core LICENSE | tar -xf - -C "${staging}"
patch --silent -d "${staging}" -p1 < "${project_dir}/config/wamr-dolly.patch"
# The input-addressed destination is published by one rename.
mv -T -- "${staging}" "${output_dir}"
trap - EXIT
printf '%s\n' "${output_dir}"
