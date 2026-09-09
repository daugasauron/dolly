#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
exec podman run --rm --userns=keep-id \
  -v "${project_dir}:${project_dir}" -w "$PWD" \
  "${DOLLY_EMSDK_IMAGE}" /emsdk/upstream/emscripten/em++ \
  -m64 -fPIC -matomics -mbulk-memory -fwasm-exceptions \
  -sSUPPORT_LONGJMP=wasm -sWASM_LEGACY_EXCEPTIONS=0 "$@"
