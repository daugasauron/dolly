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
freetype freetype-2.14.3.tar.xz
fribidi fribidi-1.0.17.tar.xz
harfbuzz harfbuzz-14.6.0.tar.xz
expat expat-2.8.5.tar.xz
gperf gperf-3.1.tar.gz
fontconfig fontconfig-2.18.3.tar.xz
libpng libpng-1.6.59.tar.xz
libjpeg_turbo libjpeg-turbo-3.2.0.tar.gz
libtiff tiff-4.7.2.tar.xz
pixman pixman-0.46.4.tar.gz
cairo cairo-1.18.6.tar.xz
graphene graphene-1.10.8.tar.xz
libepoxy libepoxy-1.5.10.tar.xz
gdk_pixbuf gdk-pixbuf-2.44.8.tar.xz
pango pango-1.58.2.tar.xz
gtk gtk-4.24.1.tar.xz
libxrandr libXrandr-1.5.5.tar.xz
libxcursor libXcursor-1.2.3.tar.xz
libxdamage libXdamage-1.1.7.tar.xz
libxcomposite libXcomposite-0.4.7.tar.xz
libxinerama libXinerama-1.1.6.tar.xz
ARCHIVES
  copy_static demos/gtk/fontconfig-dolly.patch gtk/fontconfig-dolly.patch
  copy_static demos/gtk/gtk-dolly.patch gtk/gtk-dolly.patch
  # Khronos's EGL and KHR headers, as Mesa's release carries them.
  mesa_archive="$(bash scripts/fetch-pinned-archive.sh mesa)"
  mesa_version="$(source config/source-pins.sh && echo "${DOLLY_MESA_VERSION}")"
  mesa_headers="${mesa_archive%.tar.gz}-headers"
  if [[ ! -d "${mesa_headers}" ]]; then
    rm -rf -- "${mesa_headers}.partial"
    mkdir -- "${mesa_headers}.partial"
    tar -xJf "${mesa_archive}" --strip-components=1 -C "${mesa_headers}.partial" \
      "mesa-${mesa_version}/include/EGL" "mesa-${mesa_version}/include/KHR"
    mv -T -- "${mesa_headers}.partial" "${mesa_headers}"
  fi
  node scripts/build-source-tar.mjs "${static_dir}/gtk/khronos-headers.tar" \
    "${mesa_headers}/include/EGL" /usr/include/EGL "${mesa_headers}/include/KHR" /usr/include/KHR
fi
