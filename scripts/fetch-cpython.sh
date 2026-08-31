#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source_dir="${project_dir}/.cache/cpython-${DOLLY_CPYTHON_COMMIT}"

mkdir -p "${project_dir}/.cache"
if [[ ! -d "${source_dir}/.git" ]]; then
  if [[ -e "${source_dir}" ]]; then
    echo "dolly: ${source_dir} exists but is not a CPython checkout" >&2
    exit 1
  fi
  temporary="$(mktemp -d "${project_dir}/.cache/cpython-fetch.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  git init --quiet "${temporary}"
  git -C "${temporary}" remote add origin "${DOLLY_CPYTHON_URL}"
  git -C "${temporary}" fetch --quiet --depth=1 origin "${DOLLY_CPYTHON_COMMIT}"
  git -C "${temporary}" checkout --quiet --detach FETCH_HEAD
  mv -- "${temporary}" "${source_dir}"
  trap - EXIT
fi

actual="$(git -C "${source_dir}" rev-parse HEAD)"
if [[ "${actual}" != "${DOLLY_CPYTHON_COMMIT}" ]]; then
  echo "dolly: expected CPython ${DOLLY_CPYTHON_COMMIT}, found ${actual}" >&2
  exit 1
fi
printf '%s\n' "${source_dir}"
