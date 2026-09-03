#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"

# This is the identity of the generated wasm64 Clang/LLD provider. Hash only
# values and content digests so the key does not depend on the checkout path.
{
  printf '%s\0' \
    'dolly-llvm-toolchain-v1' \
    "${DOLLY_LLVM_COMMIT}" \
    "${DOLLY_EMSDK_IMAGE}"
  sha256sum \
    "${project_dir}/config/lld-dolly.patch" \
    "${project_dir}/scripts/build-toolchain.sh" \
    | cut -d' ' -f1
} | sha256sum | cut -d' ' -f1
