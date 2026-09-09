#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
podman run --rm --userns=keep-id -v "${project_dir}:/src" \
  "${DOLLY_EMSDK_IMAGE}" /src/build/rustc-port/llvm-wasm/bin/llvm-config-host "$@" \
  | sed "s|/src/|${project_dir}/|g"
