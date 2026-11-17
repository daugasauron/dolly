# The xonotic demo's upstream source pins, sourced by config/source-pins.sh.

# Xonotic 0.8.6: the release zip (data pk3 archives) and its source zip, whose
# darkplaces, gmqcc and qcsrc trees equal the repositories' xonotic-v0.8.6 tags.
DOLLY_XONOTIC_VERSION=0.8.6
DOLLY_XONOTIC_URL='https://dl.xonotic.org/xonotic-0.8.6.zip'
DOLLY_XONOTIC_SHA256=50850f8d800e7499722f6ea61e478e96464a375494b5a24da93aa0598cbe964d
DOLLY_XONOTIC_SOURCE_URL='https://dl.xonotic.org/xonotic-0.8.6-source.zip'
DOLLY_XONOTIC_SOURCE_SHA256=8b92ac781cff4ae89c121a23eacd7dec05a2aabedaccc23a19d1a0958b4012a8

# Ogg and Vorbis, linked into Xonotic's client and 0 A.D.'s engine for their Ogg Vorbis sounds.
DOLLY_LIBOGG_VERSION=1.3.5
DOLLY_LIBOGG_URL='https://downloads.xiph.org/releases/ogg/libogg-1.3.5.tar.gz'
DOLLY_LIBOGG_SHA256=0eb4b4b9420a0f51db142ba3f9c64b333f826532dc0f48c6410ae51f4799b664
DOLLY_LIBVORBIS_VERSION=1.3.7
DOLLY_LIBVORBIS_URL='https://downloads.xiph.org/releases/vorbis/libvorbis-1.3.7.tar.gz'
DOLLY_LIBVORBIS_SHA256=0e982409a9c3fc82ee06e08205b1355e5c6aa4c36bca58146ef399621b0ce5ab

# GNU Unifont's source (.hex files and build scripts) for the fonts/unifont.ttf
# Xonotic ships: its precompiled unifont-7.0.06.ttf is byte-identical to it.
DOLLY_UNIFONT_VERSION=7.0.06
DOLLY_UNIFONT_URL='https://ftp.gnu.org/gnu/unifont/unifont-7.0.06/unifont-7.0.06.tar.gz'
DOLLY_UNIFONT_SHA256=d04e8c86aaaf7214b5212340ee853a35502b9fa311561007be3a8cf465dabf3b

# Xolonium's source (FontForge .sfd, features, hinting, the build tools and the
# xonotic/ GPL variant) at the tag whose date the shipped fonts' name table
# carries ("Xolonium GPL 4.2 2020-11-18").
DOLLY_XOLONIUM_VERSION=4.2
DOLLY_XOLONIUM_URL='https://gitlab.com/sev/xolonium/-/archive/v4.2/xolonium-v4.2.tar.gz'
DOLLY_XOLONIUM_SHA256=624d623e2f89e94714e69ae51992ec44b07a4041cce616365404e321f71f9b09
