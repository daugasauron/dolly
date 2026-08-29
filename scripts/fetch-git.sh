#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
commit="${DOLLY_GIT_COMMIT}"
source_dir="${project_dir}/.cache/git-${commit}"
url="${DOLLY_GIT_URL}"

mkdir -p "${project_dir}/.cache"
if [[ ! -d "${source_dir}/.git" ]]; then
  if [[ -e "${source_dir}" ]]; then
    echo "dolly: ${source_dir} exists but is not a Git checkout" >&2
    exit 1
  fi
  temporary="$(mktemp -d "${project_dir}/.cache/git-fetch.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  git init --quiet "${temporary}"
  git -C "${temporary}" remote add origin "${url}"
  git -C "${temporary}" fetch --quiet --depth=1 origin "${commit}"
  git -C "${temporary}" checkout --quiet --detach FETCH_HEAD
  mv -- "${temporary}" "${source_dir}"
  trap - EXIT
fi
actual="$(git -C "${source_dir}" rev-parse HEAD)"
if [[ "${actual}" != "${commit}" ]]; then
  echo "dolly: expected Git ${commit}, found ${actual}" >&2
  exit 1
fi
printf '%s\n' "${source_dir}"
