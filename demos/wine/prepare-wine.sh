#!/usr/bin/env bash
# Prints the directory of the prepared Wine tree: the part of the pinned release
# the image builds, with wine-dolly.patch applied and the seven parser files
# generated (Dolly has neither Bison nor flex).
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
demo_dir="${project_dir}/demos/wine"
# What the build reads: headers, the tools, the server, and each module's directory without its tests.
paths=(include libs/port libs/wine libs/wpp tools/winebuild tools/wrc tools/widl tools/wmc server fonts
  dlls/winecrt0 dlls/uuid dlls/ntdll dlls/kernel32 dlls/advapi32 dlls/gdi32 dlls/user32 dlls/version
  dlls/usp10 dlls/imm32 dlls/comctl32 dlls/comdlg32 dlls/shell32 dlls/shlwapi dlls/uxtheme dlls/winspool.drv dlls/msvcrt
  programs/notepad programs/winefile programs/winemine programs/wineconsole programs/cmd COPYING.LIB LICENSE AUTHORS VERSION)
archive="$("${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_WINE_URL}" "${DOLLY_WINE_SHA256}" \
  "${project_dir}/.cache/wine-${DOLLY_WINE_VERSION}.tar.xz")"
bison="$("${project_dir}/scripts/build-bison.sh")"
flex="$(bash "${demo_dir}/build-flex.sh")"
recipe_hash="$(sha256sum "${demo_dir}/wine-dolly.patch" "${BASH_SOURCE[0]}" | sha256sum | cut -d' ' -f1)"
output="${project_dir}/build/generated/wine-${DOLLY_WINE_VERSION}-${recipe_hash:0:16}"
if [[ ! -d "${output}" ]]; then
  mkdir -p "${project_dir}/build/generated"
  temporary="$(mktemp -d "${project_dir}/build/generated/.wine.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  mkdir "${temporary}/full" "${temporary}/tree"
  tar -xJf "${archive}" --strip-components=1 -C "${temporary}/full"
  patch --silent --fuzz=0 --no-backup-if-mismatch -d "${temporary}/full" -p1 < "${demo_dir}/wine-dolly.patch"
  # The commands of Wine's makedep, with relative names and no #line so no host path enters the files.
  for grammar in libs/wpp/ppy tools/wrc/parser tools/widl/parser tools/wmc/mcy; do
    (cd "${temporary}/full/$(dirname "${grammar}")" && name="$(basename "${grammar}")" &&
      "${bison}" --no-lines -Wnone -p "${name}_" -o "${name}.tab.c" -d "${name}.y")
  done
  for lexer in libs/wpp/ppl tools/wrc/parser tools/widl/parser; do
    (cd "${temporary}/full/$(dirname "${lexer}")" && name="$(basename "${lexer}")" && "${flex}" -L -o"${name}.yy.c" "${name}.l")
  done
  for path in "${paths[@]}"; do
    mkdir -p "${temporary}/tree/$(dirname "${path}")"
    cp -a "${temporary}/full/${path}" "${temporary}/tree/${path}"
  done
  find "${temporary}/tree" -depth -type d -name tests -exec rm -rf {} +
  find "${temporary}/tree" -type f \( -name '*.po' -o -name '*.sfd' -o -name '*.svg' -o -name '*.man.in' \) -delete
  mv -T -- "${temporary}/tree" "${output}"
fi
printf '%s\n' "${output}"
