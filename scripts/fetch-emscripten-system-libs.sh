#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
commit="${DOLLY_EMSCRIPTEN_COMMIT}"
url="${DOLLY_EMSCRIPTEN_URL}"
source_dir="${project_dir}/.cache/emscripten-source-${commit}"

mkdir -p "${project_dir}/.cache"
if [[ ! -d "${source_dir}/.git" ]]; then
  if [[ -e "${source_dir}" ]]; then
    echo "dolly: ${source_dir} exists but is not an Emscripten checkout" >&2
    exit 1
  fi
  temporary="$(mktemp -d "${project_dir}/.cache/emscripten-source-fetch.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  git init --quiet "${temporary}"
  git -C "${temporary}" remote add origin "${url}"
  git -C "${temporary}" sparse-checkout init --cone
  git -C "${temporary}" sparse-checkout set \
    system/lib/libcxx \
    system/lib/libcxxabi \
    system/lib/libunwind \
    system/lib/llvm-libc
  git -C "${temporary}" fetch --quiet --depth=1 origin "${commit}"
  git -C "${temporary}" checkout --quiet --detach FETCH_HEAD
  mv -- "${temporary}" "${source_dir}"
  trap - EXIT
fi

actual="$(git -C "${source_dir}" rev-parse HEAD)"
if [[ "${actual}" != "${commit}" ]]; then
  echo "dolly: expected Emscripten ${commit}, found ${actual}" >&2
  exit 1
fi
if [[ -n "$(git -C "${source_dir}" status --porcelain)" ]]; then
  echo "dolly: pinned Emscripten checkout has local source changes" >&2
  exit 1
fi

printf '%s\n' "${source_dir}"
