#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source_dir="$("${project_dir}/scripts/fetch-lua.sh")"
sources=()

for source in "${source_dir}"/src/*.c; do
  if [[ "${source}" != */luac.c ]]; then
    sources+=("${source}")
  fi
done

cd "${project_dir}"
./bin/dolly-cc "${sources[@]}" -lm -o "build/lua-${DOLLY_LUA_VERSION}.wasm"
