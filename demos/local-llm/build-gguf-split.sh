#!/usr/bin/env bash
# Prints the path of llama.cpp's own gguf-split, built for the host from the pinned source.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
build="${project_dir}/build/gguf-split-${DOLLY_LLAMACPP_COMMIT}"
if [[ ! -x "${build}/bin/llama-gguf-split" ]]; then
  archive="$(bash "${project_dir}/scripts/fetch-pinned-archive.sh" llamacpp)"
  mkdir -p "${build}/source"
  tar -xzf "${archive}" --strip-components=1 -C "${build}/source"
  cmake -S "${build}/source" -B "${build}" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF \
    -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=OFF -DLLAMA_OPENSSL=OFF >&2
  cmake --build "${build}" --target llama-gguf-split -j 4 >&2
fi
printf '%s\n' "${build}/bin/llama-gguf-split"
