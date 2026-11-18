# The wine demo's upstream source pins, sourced by config/source-pins.sh.

# The Wine demo: the last release series whose DLLs are all ELF-style Winelib (demos/wine/README.md);
# flex generates three of its parsers during host preparation, as Bison does.
DOLLY_WINE_VERSION=4.0.4
DOLLY_WINE_URL='https://dl.winehq.org/wine/source/4.0/wine-4.0.4.tar.xz'
DOLLY_WINE_SHA256=53a051ff61009f5c0d0f3770fac56c5d1cccd1015078f8b214d63bc6cd8f6169
# ReactOS Paint for the Wine demo: the commit of the ReactOS-0.3.17 tag, the last release line whose
# Paint is plain C; demos/wine/mspaint.sha256 pins each file taken from it.
DOLLY_REACTOS_COMMIT=1bca06c493016c137186496bc5aeda9082d1080f
DOLLY_REACTOS_URL='https://raw.githubusercontent.com/reactos/reactos'
# TinyCC for the Wine demo's x86-64 emulator: its maintainers' win64 binary release, x86-64 Windows code
# that ships unmodified, and the source release that goes with it.
DOLLY_TINYCC_VERSION=0.9.27
DOLLY_TINYCC_URL='https://download.savannah.gnu.org/releases/tinycc/tcc-0.9.27.tar.bz2'
DOLLY_TINYCC_SHA256=de23af78fca90ce32dff2dd45b3432b2334740bb9bb7b05bf60fdbfc396ceb9c
DOLLY_TINYCC_WIN64_URL='https://download.savannah.gnu.org/releases/tinycc/tcc-0.9.27-win64-bin.zip'
DOLLY_TINYCC_WIN64_SHA256=34a721949a2583fdff725312da092fa0f5f1f284b702e6f811c6954714faabb2
# NetSurf for the Wine demo: the release of the browser with all its libraries; gperf generates one of
# libhubbub's tables during host preparation, as flex does Wine's lexers. The GTK demo builds the same
# release inside Dolly, for fontconfig's build.
DOLLY_NETSURF_VERSION=3.11
DOLLY_NETSURF_URL='https://download.netsurf-browser.org/netsurf/releases/source-full/netsurf-all-3.11.tar.gz'
DOLLY_NETSURF_SHA256=4dea880ff3c2f698bfd62c982b259340f9abcd7f67e6c8eb2b32c61f71644b7b
# IJG libjpeg for the Wine demo's NetSurf, whose module compiles its units with Wine's headers and flags.
DOLLY_JPEG_VERSION=9f
DOLLY_JPEG_URL='https://www.ijg.org/files/jpegsrc.v9f.tar.gz'
DOLLY_JPEG_SHA256=04705c110cb2469caa79fb71fba3d7bf834914706e9641a4589485c1f832565b
DOLLY_ATK_VERSION=1.9.1
DOLLY_ATK_URL='https://download.gnome.org/sources/atk/1.9/atk-1.9.1.tar.bz2'
DOLLY_ATK_SHA256=65732d71c6c02e957673f49f8c5818f2cad3f451116b58ab1636c73dc8ab0dc6
DOLLY_GIMP_PANGO_VERSION=1.14.10
DOLLY_GIMP_PANGO_URL='https://download.gnome.org/sources/pango/1.14/pango-1.14.10.tar.bz2'
DOLLY_GIMP_PANGO_SHA256=1c53eb4a430c2311b75d6bedef87e452fa3cfea3c51a23a2e898f95e868bc503
DOLLY_GIMP_GTK_VERSION=2.6.10
DOLLY_GIMP_GTK_URL='https://download.gnome.org/sources/gtk+/2.6/gtk+-2.6.10.tar.bz2'
DOLLY_GIMP_GTK_SHA256=d408b606c8dd414dfbf220ccc168a0bc85a419945439796792a5357a96ff02af
# GIMP for the Wine demo: the last release of the 2.2 series, which needs no cairo, GEGL or babl; libart
# fills its paths; its text is drawn by Pango's FreeType backend, which finds fonts with fontconfig, whose
# configuration expat parses.
DOLLY_GIMP_VERSION=2.2.17
DOLLY_GIMP_URL='https://download.gimp.org/gimp/v2.2/gimp-2.2.17.tar.bz2'
DOLLY_GIMP_SHA256=8a4d3b28b3a11ea7564df09c8990d1c90bc3dd713b1dde0737e08603854b01b4
DOLLY_LIBART_VERSION=2.3.17
DOLLY_LIBART_URL='https://download.gnome.org/sources/libart_lgpl/2.3/libart_lgpl-2.3.17.tar.bz2'
DOLLY_LIBART_SHA256=0c9a06d612cf2e527b96aeb129fe79db750ab93e13f215043d720bcde72b407e
DOLLY_GIMP_FONTCONFIG_VERSION=2.3.2
DOLLY_GIMP_FONTCONFIG_URL='https://www.freedesktop.org/software/fontconfig/release/fontconfig-2.3.2.tar.gz'
DOLLY_GIMP_FONTCONFIG_SHA256=6f7b91d328d6408c097ec11777bf4b1c2c710613b573b399794bc5999ff12227
DOLLY_GIMP_EXPAT_VERSION=2.7.1
DOLLY_GIMP_EXPAT_URL='https://github.com/libexpat/libexpat/releases/download/R_2_7_1/expat-2.7.1.tar.xz'
DOLLY_GIMP_EXPAT_SHA256=354552544b8f99012e5062f7d570ec77f14b412a3ff5c7d8d0dae62c0d217c30
