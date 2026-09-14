#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="$(bash "${project_dir}/scripts/fetch-pinned-archive.sh" llamacpp)"
headers="$(bash "${project_dir}/scripts/fetch-verified-file.sh" "$DOLLY_DAWN_WEBGPU_URL" "$DOLLY_DAWN_WEBGPU_SHA256" "${project_dir}/.cache/dawn-webgpu-${DOLLY_DAWN_WEBGPU_SHA256}.zip")"
mkdir -p "${project_dir}/build"
temporary="$(mktemp -d "${project_dir}/build/.llama-source.XXXXXX")"
trap 'rm -rf -- "${temporary}"' EXIT
mkdir -p "$temporary/upstream" "$temporary/headers/emscripten"
tar -xzf "$archive" --strip-components=1 -C "$temporary/upstream"
python3 - "$headers" "$temporary" <<'PY'
import sys,zipfile,pathlib
with zipfile.ZipFile(sys.argv[1]) as archive:
    for name in archive.namelist():
        for prefix in ['emdawnwebgpu_pkg/webgpu/include/','emdawnwebgpu_pkg/webgpu_cpp/include/']:
            if name.startswith(prefix) and not name.endswith('/'):
                path=pathlib.Path(sys.argv[2])/'headers'/name[len(prefix):]
                path.parent.mkdir(parents=True,exist_ok=True)
                path.write_bytes(archive.read(name))
    pathlib.Path(sys.argv[2],'DAWN-LICENSE').write_bytes(archive.read('emdawnwebgpu_pkg/webgpu_cpp/LICENSE'))
PY
printf '#pragma once\n' > "$temporary/headers/emscripten/emscripten.h"
inputs=("${project_dir}/src/local-llm/CMakeLists.txt" /tmp/llama/CMakeLists.txt
 "$temporary/headers" /tmp/llama/headers
 "$temporary/DAWN-LICENSE" /usr/share/licenses/dolly-llm/dawn-LICENSE
 "$temporary/upstream/LICENSE" /usr/share/licenses/dolly-llm/llama-LICENSE)
for name in CMakeLists.txt cmake src include ggml vendor; do
 inputs+=("$temporary/upstream/$name" "/tmp/llama/upstream/$name")
done
node "${project_dir}/scripts/build-source-tar.mjs" "${1:-${project_dir}/dist/static/llama/source.tar}" "${inputs[@]}"
