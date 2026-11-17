# The tools demo's upstream source pins, sourced by config/source-pins.sh.

DOLLY_FLEX_VERSION=2.6.4
DOLLY_FLEX_URL='https://github.com/westes/flex/releases/download/v2.6.4/flex-2.6.4.tar.gz'
DOLLY_FLEX_SHA256=e87aae032bf07c26f85ac0ed3250998c37621d95f8bd748b31f15b33c45ee995

DOLLY_ZSTD_VERSION=1.5.7
DOLLY_ZSTD_URL='https://github.com/facebook/zstd/releases/download/v1.5.7/zstd-1.5.7.tar.gz'
DOLLY_ZSTD_SHA256=eb33e51f49a15e023950cd7825ca74a4a2b43db8354825ac24fc1b7ee09e6fa3

# The tools demo: everyday programs as packages, each built in Dolly from its
# release archive as published. Zstandard's is the one pinned for Mojo above.
DOLLY_SQLITE_VERSION=3.54.0
DOLLY_SQLITE_URL='https://www.sqlite.org/2026/sqlite-autoconf-3540000.tar.gz'
DOLLY_SQLITE_SHA256=134ec0802dda5795816e25d25872d20b312cb3973438c49b30bc40b7705ea9ed
DOLLY_JQ_VERSION=1.8.2
DOLLY_JQ_URL='https://github.com/jqlang/jq/releases/download/jq-1.8.2/jq-1.8.2.tar.gz'
DOLLY_JQ_SHA256=71b8d6e8f5fe81f6c6d0d110e3892251f6ce76ed095abd315e26e6e1193af3af
DOLLY_XZ_VERSION=5.8.4
DOLLY_XZ_URL='https://github.com/tukaani-project/xz/releases/download/v5.8.4/xz-5.8.4.tar.gz'
DOLLY_XZ_SHA256=0014c7886930454fe8bd4228665b51af55eeae560ea135c9c4cd33f55b2591d9
DOLLY_BZIP2_VERSION=1.0.8
DOLLY_BZIP2_URL='https://sourceware.org/pub/bzip2/bzip2-1.0.8.tar.gz'
DOLLY_BZIP2_SHA256=ab5a03176ee106d3f0fa90e381da478ddae405918153cca248e682cd0c4a2269
DOLLY_TREE_VERSION=2.3.2
DOLLY_TREE_URL='https://gitlab.com/OldManProgrammer/unix-tree/-/archive/2.3.2/unix-tree-2.3.2.tar.gz'
DOLLY_TREE_SHA256=513a53cbc42ca1f4ea06af2bab1f5283524a3848266b1d162416f8033afc4985
DOLLY_LZ4_VERSION=1.10.0
DOLLY_LZ4_URL='https://github.com/lz4/lz4/releases/download/v1.10.0/lz4-1.10.0.tar.gz'
DOLLY_LZ4_SHA256=537512904744b35e232912055ccf8ec66d768639ff3abe5788d90d792ec5f48b
DOLLY_ZIP_VERSION=3.0
DOLLY_ZIP_URL='https://downloads.sourceforge.net/infozip/zip30.tar.gz'
DOLLY_ZIP_SHA256=f0e8bb1f9b7eb0b01285495a2699df3a4b766784c1765a8f1aeedf63c0806369
DOLLY_UNZIP_VERSION=6.0
DOLLY_UNZIP_URL='https://downloads.sourceforge.net/infozip/unzip60.tar.gz'
DOLLY_UNZIP_SHA256=036d96991646d0449ed0aa952e4fbe21b476ce994abc276e49d30e686708bd37
# Gavin Howard's bc and dc.
DOLLY_BC_VERSION=7.0.3
DOLLY_BC_URL='https://github.com/gavinhoward/bc/releases/download/7.0.3/bc-7.0.3.tar.gz'
DOLLY_BC_SHA256=6e59d1154d167f8073a56de58a5476cc6213a7672abdf4197b5cc9599d56cd43
# xxd, from Vim's repository at a tag.
DOLLY_XXD_VERSION=9.2.1178
DOLLY_XXD_URL='https://raw.githubusercontent.com/vim/vim/v9.2.1178/src/xxd/xxd.c'
DOLLY_XXD_SHA256=f4f9812f9b83651e30040c83bd722651cc4656eb95b86a852edd1cd60e9b2fcd
DOLLY_XXD_MAN_URL='https://raw.githubusercontent.com/vim/vim/v9.2.1178/runtime/doc/xxd.1'
DOLLY_XXD_MAN_SHA256=ab329ce79d69f86007ace6040d5915fc3453368ba0568bed8a944f9e5bd02ae5
# Alfred Klomp's base64.
DOLLY_BASE64_VERSION=0.5.2
DOLLY_BASE64_URL='https://github.com/aklomp/base64/archive/refs/tags/v0.5.2.tar.gz'
DOLLY_BASE64_SHA256=723a0f9f4cf44cf79e97bcc315ec8f85e52eb104c8882942c3f2fba95acc080d
# linenoise, the line editor of the sqlite3 shell.
DOLLY_LINENOISE_VERSION=2.0
DOLLY_LINENOISE_URL='https://github.com/antirez/linenoise/archive/refs/tags/2.0.tar.gz'
DOLLY_LINENOISE_SHA256=97ad7d4041e11d7fa395819fd773c1892dea89e5292342378a8345692ce89c29
# Meson, as the wheel PyPI publishes.
DOLLY_MESON_VERSION=1.12.1
DOLLY_MESON_URL='https://files.pythonhosted.org/packages/57/99/36cd25f9598eef70db97577440a70a360af505f6f01c2338a18d1556079c/meson-1.12.1-py3-none-any.whl'
DOLLY_MESON_SHA256=930bc7542cbd9f57009e182fd014eba48cf1a0180a7b9006d2d32d8f168d8b02
# SCons from the wheel PyPI publishes (demos/tools), which builds Godot.
DOLLY_SCONS_VERSION=4.10.1
DOLLY_SCONS_URL='https://files.pythonhosted.org/packages/ce/bf/931fb9fbb87234c32b8b1b1c15fba23472a10777c12043336675633809a7/scons-4.10.1-py3-none-any.whl'
DOLLY_SCONS_SHA256=bd9d1c52f908d874eba92a8c0c0a8dcf2ed9f3b88ab956d0fce1da479c4e7126
# SCons' manual page, from its source archive: the wheel has none.
DOLLY_SCONS_MAN_URL='https://files.pythonhosted.org/packages/7d/c9/2f430bb39e4eccba32ce8008df4a3206df651276422204e177a09e12b30b/scons-4.10.1.tar.gz'
DOLLY_SCONS_MAN_SHA256=99c0e94a42a2c1182fa6859b0be697953db07ba936ecc9817ae0d218ced20b15
# The WebAssembly Binary Toolkit: the source release, with its submodules.
DOLLY_WABT_VERSION=1.0.42
DOLLY_WABT_URL='https://github.com/WebAssembly/wabt/releases/download/1.0.42/wabt-1.0.42.tar.xz'
DOLLY_WABT_SHA256=a76cda3c174a43097863a07fc0b0c202f770f53e21806ea2636f167d1ffb1e30

DOLLY_BINARYEN_VERSION=133
DOLLY_BINARYEN_URL='https://github.com/WebAssembly/binaryen/archive/refs/tags/version_133.tar.gz'
DOLLY_BINARYEN_SHA256=2f3e3d9edc56751499571da073a8a81943ca3fcbc08a945d2c619a7a1d4eb88b
# Thomas Dickey's Berkeley Yacc and reflex: the yacc and flex packages.
DOLLY_BYACC_VERSION=20260126
DOLLY_BYACC_URL='https://invisible-island.net/archives/byacc/byacc-20260126.tgz'
DOLLY_BYACC_SHA256=b618c5fb44c2f5f048843db90f7d1b24f78f47b07913c8c7ba8c942d3eb24b00
DOLLY_REFLEX_VERSION=20260131
DOLLY_REFLEX_URL='https://invisible-island.net/archives/reflex/reflex-20260131.tgz'
DOLLY_REFLEX_SHA256=ab51a65f33623bb9a3877fc5991ca7960b2421ed112d94c733d85597991748bd
DOLLY_PIGZ_VERSION=2.8
DOLLY_PIGZ_URL='https://zlib.net/pigz/pigz-2.8.tar.gz'
DOLLY_PIGZ_SHA256=eb872b4f0e1f0ebe59c9f7bd8c506c4204893ba6a8492de31df416f0d5170fd0
# toybox: its grep and sed, in the toybox package.
DOLLY_TOYBOX_VERSION=0.8.15
DOLLY_TOYBOX_URL='https://landley.net/toybox/downloads/toybox-0.8.15.tar.gz'
DOLLY_TOYBOX_SHA256=44e2bab43dfe2c171743297631ce558c6d9ed38b87a66fd751cef617574b375e
# dte: the editor package.
DOLLY_DTE_VERSION=1.11.1
DOLLY_DTE_URL='https://craigbarnes.gitlab.io/dist/dte/dte-1.11.1.tar.gz'
DOLLY_DTE_SHA256=3d7d0d375fd31906ed436de20161dddc42d97f969a93d22b02aecfc3451e6c39

# Libraries other demos build against, from their release archives.
DOLLY_FREETYPE_VERSION=2.14.3
DOLLY_FREETYPE_URL='https://download-mirror.savannah.gnu.org/releases/freetype/freetype-2.14.3.tar.xz'
DOLLY_FREETYPE_SHA256=36bc4f1cc413335368ee656c42afca65c5a3987e8768cc28cf11ba775e785a5f
DOLLY_LIBPNG_VERSION=1.6.59
DOLLY_LIBPNG_URL='https://download.sourceforge.net/libpng/libpng-1.6.59.tar.xz'
DOLLY_LIBPNG_SHA256=d80dd2a38a37f803cb9b6ac7b14bd6e74ddc3b654780a8380bdf93523fdb4389
DOLLY_PKGCONF_VERSION=2.5.1
DOLLY_PKGCONF_URL='https://distfiles.ariadne.space/pkgconf/pkgconf-2.5.1.tar.xz'
DOLLY_PKGCONF_SHA256=cd05c9589b9f86ecf044c10a2269822bc9eb001eced2582cfffd658b0a50c243
DOLLY_BROTLI_VERSION=1.2.1
DOLLY_BROTLI_URL='https://github.com/google/brotli/archive/refs/tags/v1.2.1.tar.gz'
DOLLY_BROTLI_SHA256=98d35d11a78dc453aebb7d10c3748f3f73ff78c8267c0dc697b8631f67bf7e8f
DOLLY_LIBJPEG_TURBO_VERSION=3.2.0
DOLLY_LIBJPEG_TURBO_URL='https://github.com/libjpeg-turbo/libjpeg-turbo/releases/download/3.2.0/libjpeg-turbo-3.2.0.tar.gz'
DOLLY_LIBJPEG_TURBO_SHA256=6f30092cef9fb839779646608f4ee14ae3cbac989c47fa05e841b0841f09878e
DOLLY_LIBTIFF_VERSION=4.7.2
DOLLY_LIBTIFF_URL='https://download.osgeo.org/libtiff/tiff-4.7.2.tar.xz'
DOLLY_LIBTIFF_SHA256=4996f0c4f93094719b1ca5c6279b20e588773ba8a247533e486416fb662ddb88
DOLLY_EXPAT_VERSION=2.8.5
DOLLY_EXPAT_URL='https://github.com/libexpat/libexpat/releases/download/R_2_8_5/expat-2.8.5.tar.xz'
DOLLY_EXPAT_SHA256=1e727b8933ec51a77a9a9d9afcf8e688bce45d907c13e36ab7393fe36e703182
# {fmt}: the release Blender 5.3 pins, the newest of the catalog's three.
DOLLY_FMT_VERSION=12.1.0
DOLLY_FMT_URL='https://github.com/fmtlib/fmt/archive/refs/tags/12.1.0.tar.gz'
DOLLY_FMT_SHA256=ea7de4299689e12b6dddd392f9896f08fb0777ac7168897a244a6d6085043fea
# gperf 3.1, whose library is plain C and C++ (later releases need gnulib's configure).
DOLLY_GPERF_VERSION=3.1
DOLLY_GPERF_URL='https://ftp.gnu.org/gnu/gperf/gperf-3.1.tar.gz'
DOLLY_GPERF_SHA256=588546b945bba4b70b6a3a616e80b4ab466e3f33024a352fc2198112cdbb3ae2
