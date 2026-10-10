#!/usr/bin/env bash
# Prints the directory of the prepared GTK+ sources: GLib, ATK, Pango and GTK+ of
# their pinned releases, the parts the Wine demo builds, with gimp-dolly.patch
# applied and the files their makefiles copy or generate with perl.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
demo_dir="${project_dir}/demos/wine"
# Each release under the name the build knows it by, and what is taken of it.
releases=(GLIB:glib ATK:atk PANGO:pango GTK:gtk)
paths=(glib/glib glib/gobject glib/gmodule glib/COPYING atk/atk atk/COPYING pango/pango pango/modules/basic pango/COPYING
  gtk/gdk-pixbuf gtk/gdk gtk/gtk gtk/COPYING)
recipe_hash="$(sha256sum "${demo_dir}/gimp-dolly.patch" "${BASH_SOURCE[0]}" | sha256sum | cut -d' ' -f1)"
output="${project_dir}/build/generated/gimp-${DOLLY_GTK_VERSION}-${recipe_hash:0:16}"
if [[ ! -d "${output}" ]]; then
  mkdir -p "${project_dir}/build/generated"
  temporary="$(mktemp -d "${project_dir}/build/generated/.gimp.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  mkdir "${temporary}/full" "${temporary}/tree"
  for release in "${releases[@]}"; do
    url="DOLLY_${release%%:*}_URL" hash="DOLLY_${release%%:*}_SHA256"
    archive="$("${project_dir}/scripts/fetch-verified-file.sh" "${!url}" "${!hash}" "${project_dir}/.cache/$(basename "${!url}")")"
    mkdir "${temporary}/full/${release##*:}"
    tar -xjf "${archive}" --strip-components=1 -C "${temporary}/full/${release##*:}"
  done
  patch --silent --fuzz=0 --no-backup-if-mismatch -d "${temporary}/full" -p1 < "${demo_dir}/gimp-dolly.patch"
  # What configure and the makefiles do for a build for Windows without loadable modules: Pango's
  # list of built-in modules, and the alias definitions perl writes.
  cp "${temporary}/full/pango/pango/module-defs-win32.c.win32" "${temporary}/full/pango/pango/module-defs-win32.c"
  (cd "${temporary}/full/gtk/gdk-pixbuf" && perl makegdkpixbufalias.pl -def < gdk-pixbuf.symbols > gdk-pixbuf-aliasdef.c)
  (cd "${temporary}/full/gtk/gdk" && perl makegdkalias.pl -def < gdk.symbols > gdkaliasdef.c)
  for path in "${paths[@]}"; do
    mkdir -p "${temporary}/tree/$(dirname "${path}")"
    cp -a "${temporary}/full/${path}" "${temporary}/tree/${path}"
  done
  # Not built: other window systems, tests, the icons' sources (their compiled form is a header).
  rm -rf -- "${temporary}/tree/gtk/gdk"/{x11,linux-fb} "${temporary}/tree/gtk/gtk/theme-bits"
  find "${temporary}/tree" -depth -type d \( -name tests -o -name test \) -exec rm -rf {} +
  find "${temporary}/tree" -type f \( -name '*.png' -o -name 'Makefile*' -o -name 'makefile*' -o -name '*.def' -o -name '*.symbols' \
    -o -name '*.pl' -o -name '*.rc' -o -name '*.rc.in' -o -name '*.win32' -o -name '*.win32.in' -o -name '*.S' -o -name '*.la' \) -delete
  mv -T -- "${temporary}/tree" "${output}"
fi
printf '%s\n' "${output}"
