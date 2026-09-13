#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
if [[ $# != 1 ]]; then
  echo 'usage: fetch-pinned-checkout.sh NAME' >&2
  exit 64
fi
case "$1" in
  quickjs) cache_name=quickjs-ng ;;
  emscripten) cache_name=emscripten-source ;;
  sbase|awk|curl|git|zlib|samurai|ghostty|raylib|box3d|pi-source|cpython) cache_name="$1" ;;
  *) echo "dolly: unknown pinned Git source: $1" >&2; exit 64 ;;
esac
prefix="DOLLY_${1^^}"
prefix="${prefix//-/_}"
url_key="${prefix}_URL"
commit_key="${prefix}_COMMIT"
commit="${!commit_key}"
[[ "${commit}" =~ ^[a-f0-9]{40}$ ]]
source_dir="${project_dir}/.cache/${cache_name}-${commit}"
mkdir -p "${project_dir}/.cache"
if [[ ! -d "${source_dir}/.git" ]]; then
  if [[ -e "${source_dir}" ]]; then
    echo "dolly: ${source_dir} exists but is not a Git checkout" >&2
    exit 1
  fi
  temporary="$(mktemp -d "${project_dir}/.cache/${cache_name}-fetch.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  git init --quiet "${temporary}"
  git -C "${temporary}" remote add origin "${!url_key}"
  if [[ "$1" == emscripten ]]; then
    git -C "${temporary}" sparse-checkout init --cone
    git -C "${temporary}" sparse-checkout set \
      system/lib/libcxx system/lib/libcxxabi system/lib/libunwind system/lib/llvm-libc
  fi
  git -C "${temporary}" fetch --quiet --depth=1 origin "${commit}"
  git -C "${temporary}" checkout --quiet --detach FETCH_HEAD
  bash "${project_dir}/scripts/verify-git-source.sh" "${temporary}" "${commit}"
  mv -T --no-clobber -- "${temporary}" "${source_dir}"
fi
bash "${project_dir}/scripts/verify-git-source.sh" "${source_dir}" "${commit}"
printf '%s\n' "${source_dir}"
