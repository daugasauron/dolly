#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source_dir="$(bash "${project_dir}/demos/cmake/prepare-libuv.sh")"
node "${project_dir}/scripts/build-source-tar.mjs" build/fixtures/libuv-source.tar \
  "${source_dir}/include" /tmp/dolly-libuv/source/include \
  "${source_dir}/src" /tmp/dolly-libuv/source/src \
  "${source_dir}/LICENSE" /tmp/dolly-libuv/LICENSE \
  "${project_dir}/demos/cmake/libuv" /tmp/dolly-libuv/dolly \
  "${project_dir}/demos/cmake/libuv-dolly.mk" /tmp/dolly-libuv/Makefile \
  "${project_dir}/demos/cmake/test/fixtures/libuv.c" /tmp/dolly-libuv/probe.c \
  "${project_dir}/demos/cmake/test/fixtures/libuv-dso.c" /tmp/dolly-libuv/dso.c
DOLLY_IMAGE="${DOLLY_IMAGE:-default}" DOLLY_BROWSER_MODE=libuv \
  bash "${project_dir}/scripts/test-browser.sh"
