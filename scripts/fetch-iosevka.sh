#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
font_dir="${project_dir}/.cache/fonts"
web_font="${font_dir}/IosevkaTerm-SemiBold.woff2"
upstream_font="${font_dir}/IosevkaTerm-SemiBold.ttf"
fonttools="${font_dir}/fonttools-${DOLLY_FONTTOOLS_VERSION}-py3-none-any.whl"

"${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_IOSEVKA_URL}" "${DOLLY_IOSEVKA_SHA256}" "${web_font}"
"${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_IOSEVKA_TTF_URL}" "${DOLLY_IOSEVKA_TTF_SHA256}" "${upstream_font}" >/dev/null
"${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_FONTTOOLS_URL}" "${DOLLY_FONTTOOLS_SHA256}" "${fonttools}" >/dev/null
# The terminal's font keeps the glyphs a program can draw: those of the
# characters it maps and those its default features reach. The rest of its
# 46,736 glyphs, character variants and stylistic sets, are 6.8 MB that no
# program asks for.
runtime_font="${font_dir}/IosevkaTerm-SemiBold-drawn.ttf"
temporary="$(mktemp "${font_dir}/.subset.XXXXXX")"
trap 'rm -f -- "${temporary}"' EXIT
python3 -I -c 'import sys; sys.path.insert(0, sys.argv.pop(1)); from fontTools.subset import main; sys.exit(main())' \
  "${fonttools}" "${upstream_font}" --unicodes='*' --notdef-outline --name-IDs='*' --name-languages='*' \
  --output-file="${temporary}"
mv -f -- "${temporary}" "${runtime_font}"
printf '%s\n' "${runtime_font}"
