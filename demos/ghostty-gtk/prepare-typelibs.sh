#!/usr/bin/env bash
# The GObject Introspection typelibs blueprint-compiler reads to compile
# Ghostty's .blp files: Arch Linux's packages of the same releases
# (typelib-packages.txt), a bootstrap exception: Dolly has no
# gobject-introspection to write them. Prints the directory.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
demo_dir="${project_dir}/demos/ghostty-gtk"
recipe_hash="$(cd "${project_dir}" && sha256sum demos/ghostty-gtk/prepare-typelibs.sh demos/ghostty-gtk/typelib-packages.txt | sha256sum | cut -c1-16)"
output="${project_dir}/build/generated/typelibs-${recipe_hash}"
if [[ -d "${output}" ]]; then
  printf '%s\n' "${output}"
  exit 0
fi

mkdir -p "${project_dir}/build/generated"
temporary="$(mktemp -d "${project_dir}/build/generated/.typelibs.XXXXXX")"
trap 'rm -rf -- "${temporary}"' EXIT
mkdir "${temporary}/typelibs"
while read -r url sha256; do
  package="$("${project_dir}/scripts/fetch-verified-file.sh" "${url}" "${sha256}" "${project_dir}/.cache/arch-${sha256:0:16}.pkg.tar.zst")"
  tar --zstd -xf "${package}" -C "${temporary}" --wildcards 'usr/lib/girepository-1.0/*.typelib'
done < "${demo_dir}/typelib-packages.txt"
for name in Adw-1 Gdk-4.0 GdkPixbuf-2.0 Gio-2.0 GLib-2.0 GModule-2.0 GObject-2.0 Graphene-1.0 \
  Gsk-4.0 Gtk-4.0 HarfBuzz-0.0 Pango-1.0 PangoCairo-1.0 cairo-1.0 freetype2-2.0; do
  cp "${temporary}/usr/lib/girepository-1.0/${name}.typelib" "${temporary}/typelibs/"
done

mv -T -- "${temporary}/typelibs" "${output}"
printf '%s\n' "${output}"
