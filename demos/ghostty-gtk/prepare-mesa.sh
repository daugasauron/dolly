#!/usr/bin/env bash
# The pinned Mesa with Dolly's patch and the parsers and scanners its Meson
# build would generate: Bison 3 and flex built for the host from their pins,
# as Wine's port uses them (a bootstrap exception), with Mesa's own arguments.
# The patch has Meson take these files. Prints the tree.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
demo_dir="${project_dir}/demos/ghostty-gtk"
source "${project_dir}/config/source-pins.sh"
archive="$(bash "${project_dir}/scripts/fetch-pinned-archive.sh" mesa)"
bison="$("${project_dir}/scripts/build-bison.sh")"
flex="$("${project_dir}/demos/wine/build-flex.sh")"
recipe_hash="$(cd "${project_dir}" && sha256sum demos/ghostty-gtk/prepare-mesa.sh demos/ghostty-gtk/mesa-dolly.patch | sha256sum | cut -c1-16)"
output="${project_dir}/build/generated/mesa-${DOLLY_MESA_SHA256:0:16}-${recipe_hash}"
if [[ -d "${output}" ]]; then
  printf '%s\n' "${output}"
  exit 0
fi

mkdir -p "${project_dir}/build/generated"
temporary="$(mktemp -d "${project_dir}/build/generated/.mesa.XXXXXX")"
trap 'rm -rf -- "${temporary}"' EXIT
tree="${temporary}/mesa-${DOLLY_MESA_VERSION}"
mkdir "${tree}"
tar -xJf "${archive}" --strip-components=1 -C "${tree}"
patch --silent --fuzz=0 --no-backup-if-mismatch -d "${tree}" -p1 < "${demo_dir}/mesa-dolly.patch"
(cd "${tree}/src/compiler/glsl" &&
  "${bison}" -o glsl_parser.cpp -p _mesa_glsl_ --defines=glsl_parser.h glsl_parser.yy &&
  "${flex}" -o glsl_lexer.cpp glsl_lexer.ll)
(cd "${tree}/src/compiler/glsl/glcpp" &&
  "${bison}" -o glcpp-parse.c -p glcpp_parser_ --defines=glcpp-parse.h glcpp-parse.y &&
  "${flex}" -o glcpp-lex.c glcpp-lex.l)
(cd "${tree}/src/mesa/program" &&
  "${bison}" -o program_parse.tab.c --defines=program_parse.tab.h program_parse.y &&
  "${flex}" -o lex.yy.c program_lexer.l)

mv -T -- "${tree}" "${output}"
printf '%s\n' "${output}"
