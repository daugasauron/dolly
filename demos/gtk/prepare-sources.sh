# Sourced by scripts/prepare-image-sources.sh.
# Release archives as published; the xz and tar packages read them in Dolly.
if has_image pcre2; then
  copy_static "$(bash scripts/fetch-pinned-archive.sh pcre2)" gtk/pcre2-10.49.tar.gz
fi
if has_image glib; then
  copy_static "$(bash scripts/fetch-pinned-archive.sh glib)" gtk/glib-2.90.1.tar.xz
  copy_static demos/gtk/glib-dolly.patch gtk/glib-dolly.patch
fi
