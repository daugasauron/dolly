#!/usr/bin/env bash
# Prints the directory of the prepared GIMP sources: GIMP and the libraries under
# it (GLib, ATK, Pango, GTK+, libart, fontconfig, expat) of their pinned releases,
# the parts the Wine demo builds or installs, with gimp-dolly.patch applied and
# the files their makefiles copy or generate with perl.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
demo_dir="${project_dir}/demos/wine"
# Each release under the name the build knows it by, and what is taken of it.
releases=(GLIB:glib ATK:atk PANGO:pango GTK:gtk LIBART:libart_lgpl FONTCONFIG:fontconfig EXPAT:expat GIMP:gimp)
paths=(glib/glib glib/gobject glib/gmodule glib/COPYING atk/atk atk/COPYING pango/pango pango/modules/basic pango/COPYING
  gtk/gdk-pixbuf gtk/gdk gtk/gtk gtk/COPYING libart_lgpl fontconfig/src fontconfig/fontconfig fontconfig/fc-lang/fclang.h
  fontconfig/fc-glyphname/fcglyphname.h fontconfig/fc-case/fccase.h fontconfig/fonts.conf.in fontconfig/fonts.dtd
  fontconfig/COPYING expat/lib expat/COPYING gimp/app gimp/libgimpbase gimp/libgimpcolor gimp/libgimpmath
  gimp/libgimpmodule gimp/libgimpthumb gimp/libgimpwidgets gimp/libgimp gimp/cursors gimp/themes/Default
  gimp/data/brushes gimp/data/gradients gimp/data/palettes gimp/data/patterns gimp/data/images gimp/etc gimp/menus
  gimp/tips/gimp-tips.xml gimp/regexrepl gimp/COPYING gimp/LICENSE gimp/AUTHORS)
recipe_hash="$(sha256sum "${demo_dir}/gimp-dolly.patch" "${BASH_SOURCE[0]}" | sha256sum | cut -d' ' -f1)"
output="${project_dir}/build/generated/gimp-${DOLLY_GIMP_VERSION}-${recipe_hash:0:16}"
if [[ ! -d "${output}" ]]; then
  mkdir -p "${project_dir}/build/generated"
  temporary="$(mktemp -d "${project_dir}/build/generated/.gimp.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  mkdir "${temporary}/full" "${temporary}/tree"
  for release in "${releases[@]}"; do
    url="DOLLY_${release%%:*}_URL" hash="DOLLY_${release%%:*}_SHA256"
    archive="$("${project_dir}/scripts/fetch-verified-file.sh" "${!url}" "${!hash}" "${project_dir}/.cache/$(basename "${!url}")")"
    mkdir "${temporary}/full/${release##*:}"
    tar -xf "${archive}" --strip-components=1 -C "${temporary}/full/${release##*:}"
  done
  chmod -R u+w "${temporary}/full"
  patch --silent --fuzz=0 --no-backup-if-mismatch -d "${temporary}/full" -p1 < "${demo_dir}/gimp-dolly.patch"
  # What configure and the makefiles do for a build for Windows without loadable modules: Pango's
  # lists of built-in modules, and the alias definitions perl writes.
  for backend in win32 fc; do
    cp "${temporary}/full/pango/pango/module-defs-${backend}.c.win32" "${temporary}/full/pango/pango/module-defs-${backend}.c"
  done
  (cd "${temporary}/full/gtk/gdk-pixbuf" && perl makegdkpixbufalias.pl -def < gdk-pixbuf.symbols > gdk-pixbuf-aliasdef.c)
  (cd "${temporary}/full/gtk/gdk" && perl makegdkalias.pl -def < gdk.symbols > gdkaliasdef.c)
  # The lists of GIMP's icons and cursors, as its makefiles have them.
  sed -n '/^CORE_IMAGES/,/^EXTRA_DIST/{/^EXTRA_DIST/!p}' "${temporary}/full/gimp/themes/Default/images/Makefile.am" \
    > "${temporary}/full/gimp/themes/Default/images/images.mk"
  sed -n '/^CURSOR_IMAGES/,/^EXTRA_DIST/{/^EXTRA_DIST/!p}' "${temporary}/full/gimp/cursors/Makefile.am" > "${temporary}/full/gimp/cursors/cursors.mk"
  for path in "${paths[@]}"; do
    mkdir -p "${temporary}/tree/$(dirname "${path}")"
    cp -a "${temporary}/full/${path}" "${temporary}/tree/${path}"
  done
  # Not built: other window systems, tests, GTK+'s icons as pictures (their compiled form is a header),
  # and of GIMP's own library for plug-ins all but the headers its program includes.
  rm -rf -- "${temporary}/tree/gtk/gdk"/{x11,linux-fb} "${temporary}/tree/gtk/gtk/theme-bits"
  find "${temporary}/tree" -depth -type d \( -name tests -o -name test \) -exec rm -rf {} +
  find "${temporary}/tree/gimp/libgimp" -type f ! -name '*.h' -delete
  find "${temporary}/tree" -type f \( -name 'Makefile*' -o -name 'makefile*' -o -name '*.xcf' -o -name '*.xcf.gz' \) -delete
  for library in glib atk pango gtk libart_lgpl; do
    find "${temporary}/tree/${library}" -type f \( -name '*.png' -o -name '*.def' -o -name '*.symbols' -o -name '*.pl' -o -name '*.rc' \
      -o -name '*.rc.in' -o -name '*.win32' -o -name '*.win32.in' -o -name '*.S' -o -name '*.la' -o -name '*.ico' -o -name 'configure*' \
      -o -name 'ChangeLog' -o -name '*.m4' -o -name '*.sh' -o -name 'config.*' \) -delete
  done
  mv -T -- "${temporary}/tree" "${output}"
fi
printf '%s\n' "${output}"
