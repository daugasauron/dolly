#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
if [[ $# != 1 ]]; then
  echo 'usage: fetch-pinned-checkout.sh NAME' >&2
  exit 64
fi
# A Git source is pinned by DOLLY_NAME_URL and DOLLY_NAME_COMMIT; DOLLY_NAME_CHECKOUT names
# its cache directory when that is not NAME, and DOLLY_NAME_SPARSE lists the only trees fetched.
prefix="DOLLY_${1^^}"
prefix="${prefix//-/_}"
url_key="${prefix}_URL" commit_key="${prefix}_COMMIT" checkout_key="${prefix}_CHECKOUT" sparse_key="${prefix}_SPARSE"
if [[ ! "$1" =~ ^[a-z][a-z0-9_-]*$ || -z "${!commit_key:-}" ]]; then
  echo "dolly: unknown pinned Git source: $1" >&2
  exit 64
fi
cache_name="${!checkout_key:-$1}"
read -r -a sparse <<< "${!sparse_key:-}"
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
  filter=()
  if ((${#sparse[@]})); then
    git -C "${temporary}" sparse-checkout init --cone
    git -C "${temporary}" sparse-checkout set "${sparse[@]}"
    filter=(--filter=blob:none)
  fi
  git -C "${temporary}" fetch --quiet --depth=1 "${filter[@]}" origin "${commit}"
  git -C "${temporary}" checkout --quiet --detach FETCH_HEAD
  bash "${project_dir}/scripts/verify-git-source.sh" "${temporary}" "${commit}"
  mv -T --no-clobber -- "${temporary}" "${source_dir}"
fi
bash "${project_dir}/scripts/verify-git-source.sh" "${source_dir}" "${commit}"
printf '%s\n' "${source_dir}"
