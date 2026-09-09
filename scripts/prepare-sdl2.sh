#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="$(bash "${project_dir}/scripts/fetch-pinned-archive.sh" sdl2)"
recipe_hash="$(cd "${project_dir}"; sha256sum scripts/prepare-sdl2.sh \
  config/sdl2-dolly.patch src/sdl2/SDL_dollyvideo.c | sha256sum | cut -d' ' -f1)"
output="${project_dir}/build/generated/sdl2-${DOLLY_SDL2_SHA256}-${recipe_hash}"
temporary=""
cleanup() {
  if [[ -n "${temporary}" ]]; then rm -rf -- "${temporary}"; fi
}
trap cleanup EXIT
if [[ ! -d "${output}" ]]; then
  mkdir -p "${project_dir}/build/generated"
  temporary="$(mktemp -d "${project_dir}/build/generated/.sdl2.XXXXXX")"
  tar -xzf "${archive}" --strip-components=1 -C "${temporary}"
  patch --silent --fuzz=0 --no-backup-if-mismatch -d "${temporary}" -p1 \
    < "${project_dir}/config/sdl2-dolly.patch"
  mkdir -p "${temporary}/src/video/dolly"
  cp "${project_dir}/src/sdl2/SDL_dollyvideo.c" "${temporary}/src/video/dolly/"
  mv -T "${temporary}" "${output}"
  temporary=""
fi
printf '%s\n' "${output}"
