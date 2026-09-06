#!/usr/bin/env bash
set -euo pipefail

source_dir="${1:?usage: verify-git-source.sh DIRECTORY COMMIT [PATCH]}"
commit="${2:?usage: verify-git-source.sh DIRECTORY COMMIT [PATCH]}"
actual="$(git -C "${source_dir}" rev-parse HEAD)"
if [[ "${actual}" != "${commit}" ]]; then
  echo "dolly: ${source_dir}: expected ${commit}, found ${actual}" >&2
  exit 1
fi
if ! git -C "${source_dir}" diff --cached --quiet --no-ext-diff "${commit}" --; then
  echo "dolly: ${source_dir}: pinned checkout has staged source changes" >&2
  exit 1
fi
expected="${commit}"
if [[ -n "${3:-}" ]]; then
  verification_dir="$(mktemp -d)"
  trap 'rm -r -- "${verification_dir}"' EXIT
  cp -- "$(git -C "${source_dir}" rev-parse --path-format=absolute --git-path index)" "${verification_dir}/index"
  export GIT_INDEX_FILE="${verification_dir}/index"
  git -C "${source_dir}" apply --cached --whitespace=nowarn "${3}"
  expected="$(git -C "${source_dir}" write-tree)"
fi
if ! git -C "${source_dir}" diff --quiet --no-ext-diff "${expected}" -- ||
   [[ -n "$(git -C "${source_dir}" ls-files --others --directory)" ]]; then
  echo "dolly: ${source_dir}: pinned checkout has local source changes (including untracked/ignored files)" >&2
  exit 1
fi
