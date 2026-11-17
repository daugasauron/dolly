# Sourced by scripts/prepare-image-sources.sh.
# Release archives as published; the xz and tar packages read them in Dolly.
if has_image pcre2; then
  copy_static "$(bash scripts/fetch-pinned-archive.sh pcre2)" gtk/pcre2-10.49.tar.gz
fi
if has_image glib; then
  copy_static "$(bash scripts/fetch-pinned-archive.sh glib)" gtk/glib-2.90.1.tar.xz
  copy_static demos/gtk/glib-dolly.patch gtk/glib-dolly.patch
fi
if has_image gtk-build; then
  while read -r pin archive; do
    copy_static "$(bash scripts/fetch-pinned-archive.sh "${pin}")" "gtk/${archive}"
  done <<'ARCHIVES'
fribidi fribidi-1.0.17.tar.xz
harfbuzz harfbuzz-14.6.0.tar.xz
fontconfig fontconfig-2.18.3.tar.xz
cairo cairo-1.18.6.tar.xz
graphene graphene-1.10.8.tar.xz
libepoxy libepoxy-1.5.10.tar.xz
gdk_pixbuf gdk-pixbuf-2.44.8.tar.xz
pango pango-1.58.2.tar.xz
gtk gtk-4.24.1.tar.xz
ARCHIVES
  copy_static demos/gtk/fontconfig-dolly.patch gtk/fontconfig-dolly.patch
  copy_static demos/gtk/gtk-dolly.patch gtk/gtk-dolly.patch
fi
