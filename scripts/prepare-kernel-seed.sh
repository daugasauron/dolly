#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "${project_dir}/dist"
staging="$(mktemp -d "${project_dir}/dist/.kernel-seed.XXXXXX")"
trap 'rm -rf -- "${staging}"' EXIT
cd -- "${staging}"
python3 /emsdk/upstream/emscripten/tools/file_packager.py dolly.data \
  --js-output=dolly-seed.mjs --export-es6 --no-node --quiet \
  --preload "$@" --exclude '*/c++/v1/*'
mv -- dolly.data dolly-seed.mjs "${project_dir}/dist/"
