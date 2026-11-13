#!/usr/bin/env bash
# WAMR's core at its pin with config/wamr-dolly.patch, which adds WebAssembly
# as a build target: WAMR knows only real CPUs, and a host that names one of
# them claims an ABI it does not have. Prints the prepared directory.
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source "${project_dir}/scripts/prepared-source.sh"
source_dir="$("${project_dir}/scripts/fetch-pinned-checkout.sh" wamr)"
prepared_source wamr "${DOLLY_WAMR_COMMIT}" "" "${BASH_SOURCE[0]}" "${project_dir}/config/wamr-dolly.patch"
git -C "${source_dir}" archive --format=tar "${DOLLY_WAMR_COMMIT}" core LICENSE | tar -xf - -C "${temporary}"
patch --silent -d "${temporary}" -p1 < "${project_dir}/config/wamr-dolly.patch"
publish_prepared_source
