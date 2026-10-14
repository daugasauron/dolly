# Sourced by scripts/prepare-image-sources.sh.
# X.Org's release archives as published: gzip, and the xz and tar packages,
# read them inside Dolly. (pin, archive name)
stage_x11() {
  while read -r pin archive; do
    copy_static "$(bash scripts/fetch-pinned-archive.sh "${pin}")" "x11/${archive}"
  done
}
if has_image x11-build; then
  stage_x11 <<'ARCHIVES'
xorgproto xorgproto-2026.1.tar.gz
xtrans xtrans-1.6.0.tar.gz
xcb_proto xcb-proto-1.17.0.tar.gz
libxau libXau-1.0.12.tar.gz
libxcb libxcb-1.17.0.tar.gz
libx11 libX11-1.8.13.tar.gz
libxext libXext-1.3.7.tar.gz
libxrender libXrender-0.9.12.tar.gz
libxfixes libXfixes-6.0.2.tar.gz
libxi libXi-1.8.3.tar.gz
libice libICE-1.1.2.tar.gz
libsm libSM-1.2.6.tar.gz
libxt libXt-1.3.1.tar.gz
libxmu libXmu-1.3.1.tar.gz
libxpm libXpm-3.5.19.tar.gz
libxaw libXaw-1.0.16.tar.gz
ARCHIVES
fi
if has_image xorg-server-build; then
  stage_x11 <<'ARCHIVES'
libmd libmd-1.3.0.tar.xz
pixman pixman-0.46.4.tar.gz
libxfont2 libXfont2-2.0.9.tar.gz
libxkbfile libxkbfile-1.2.0.tar.xz
xkbcomp xkbcomp-1.5.0.tar.gz
xkeyboard_config xkeyboard-config-2.48.tar.xz
xorg_server xorg-server-21.1.25.tar.gz
ARCHIVES
  # Xsdl, which the patches add to the server's build, and Dolly's patch.
  node scripts/build-source-tar.mjs "${static_dir}/x11/xsdl.tar" \
    demos/x11/xorg-server-xsdl.patch /tmp/xorg/xorg-server-xsdl.patch \
    demos/x11/xorg-server-dolly.patch /tmp/xorg/xorg-server-dolly.patch \
    demos/x11/xsdl/sdl.c /tmp/xorg/xorg-server-21.1.25/hw/kdrive/sdl/sdl.c \
    demos/x11/xsdl/meson.build /tmp/xorg/xorg-server-21.1.25/hw/kdrive/sdl/meson.build
fi
while read -r program archive; do
  if has_image "${program}"; then
    copy_static "$(bash scripts/fetch-pinned-archive.sh "${program}")" "x11/${archive}"
  fi
done <<'ARCHIVES'
twm twm-1.0.13.1.tar.gz
xclock xclock-1.2.1.tar.gz
xeyes xeyes-1.3.1.tar.gz
ARCHIVES
