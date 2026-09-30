#!/usr/bin/env bash
# Fetches the pinned WAMR checkout that interprets zig1.wasm; prints its path.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
commit=68b8ed3892b857218cb2d0fb7369431fae6fc801
source_dir="${project_dir}/.cache/wamr-${commit}"
if [[ ! -d "${source_dir}/.git" ]]; then
  temporary="$(mktemp -d "${project_dir}/.cache/wamr-fetch.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  git init --quiet "${temporary}"
  git -C "${temporary}" fetch --quiet --depth=1 \
    https://github.com/bytecodealliance/wasm-micro-runtime.git "${commit}"
  git -C "${temporary}" checkout --quiet --detach FETCH_HEAD
  mv -T --no-clobber -- "${temporary}" "${source_dir}"
fi
bash "${project_dir}/scripts/verify-git-source.sh" "${source_dir}" "${commit}"
printf '%s\n' "${source_dir}"
