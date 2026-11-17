# Canonical upstream source pins for Dolly's reproducible build.
# This file is shell syntax so the fetch/build scripts consume it directly.

DOLLY_EMSDK_VERSION=6.0.8
DOLLY_EMSDK_IMAGE='docker.io/emscripten/emsdk:6.0.8@sha256:8714ed3a9fb585e662c931259a996bac36a57a8dd34b81e8277436fd77364475'
DOLLY_EMSCRIPTEN_COMMIT=aeb67926e7de656da38bc807d83050af93578758
DOLLY_EMSCRIPTEN_URL='https://github.com/emscripten-core/emscripten.git'
DOLLY_EMSCRIPTEN_CHECKOUT=emscripten-source
DOLLY_EMSCRIPTEN_SPARSE='system/lib/libcxx system/lib/libcxxabi system/lib/libunwind system/lib/llvm-libc'

# The seed's compiler and Clang's resource headers, as the llvm-cc image built
# them from DOLLY_LLVM_COMMIT (demos/llvm/pin-seed-compiler.mjs writes both lines).
DOLLY_SEED_COMPILER_URL='https://github.com/daugasauron/dolly/releases/download/v0.1.7/dolly-seed-compiler-c98f9ab67a7084fae4b49d4352fbe50c69bf46ddefa5a635d1b6331eecf97310.tar'
DOLLY_SEED_COMPILER_SHA256=c98f9ab67a7084fae4b49d4352fbe50c69bf46ddefa5a635d1b6331eecf97310

DOLLY_SBASE_COMMIT=c546c3a5724c81cee9a11d816a38ccdf17472129
DOLLY_SBASE_URL='https://git.suckless.org/sbase'

DOLLY_AWK_COMMIT=5739fd79bcfc75ba7526773d0cf634521f8aca3c
DOLLY_AWK_URL='https://github.com/onetrueawk/awk.git'

DOLLY_ZIG_VERSION=0.17.0
DOLLY_ZIG_URL='https://ziglang.org/download/0.17.0/zig-0.17.0.tar.xz'
DOLLY_ZIG_SHA256=b6c7f1728f043700d6529bac980800792f824256a9d2f1839b3d62beed0b8abd

DOLLY_WAMR_COMMIT=68b8ed3892b857218cb2d0fb7369431fae6fc801
DOLLY_WAMR_URL='https://github.com/bytecodealliance/wasm-micro-runtime.git'

# libghostty-vt 1.0.0 (tag vt-1.0.0), the terminal's VT library.
DOLLY_GHOSTTY_COMMIT=0fa3d577a5614150ff8e2c152de5fb9d5c6d2dec
DOLLY_GHOSTTY_URL='https://github.com/ghostty-org/ghostty.git'
# Wuffs, which Ghostty's terminal library takes for kitty graphics, and the
# support files of translate-c's output: Ghostty's own pins of them
# (pkg/wuffs/build.zig.zon, pkg/translate-c/build.zig.zon).
DOLLY_WUFFS_URL='https://deps.files.ghostty.org/wuffs-7411f488fe2e2c205c3d3b3d28638b7356522930.tar.gz'
DOLLY_WUFFS_SHA256=17877d346f7988651d6c62e45b2e3b05c86809a6442c5e34612374b2a9719a1c
DOLLY_TRANSLATE_C_URL='https://deps.files.ghostty.org/translate_c-02ff0c523fb92a38939b04d0145c4a9602a74d56.tar.gz'
DOLLY_TRANSLATE_C_SHA256=e344433bcce14759529e58ea600e67d7c39846b1775b122f88db7cb4dad58591

DOLLY_UUCODE_VERSION=0.2.0
DOLLY_UUCODE_COMMIT=1fb73433bba5d93366c57f23ff2e9d7939746500
DOLLY_UUCODE_URL='https://deps.files.ghostty.org/uucode-1fb73433bba5d93366c57f23ff2e9d7939746500.tar.gz'
DOLLY_UUCODE_SHA256=9e574f5b72c07f426eb31e2604860f22ba0fc5f9ccb44ef44e3212a5e9001828

DOLLY_CURL_VERSION=8.21.0
DOLLY_CURL_COMMIT=68720b4837284335b2d63cb358f8f6ce65f5bc55
DOLLY_CURL_URL='https://github.com/curl/curl.git'

DOLLY_ZLIB_VERSION=1.3.2
DOLLY_ZLIB_COMMIT=da607da739fa6047df13e66a2af6b8bec7c2a498
DOLLY_ZLIB_URL='https://github.com/madler/zlib.git'

DOLLY_GIT_VERSION=2.55.0
DOLLY_GIT_COMMIT=e9019fcafe0040228b8631c30f97ae1adb61bcdc
DOLLY_GIT_URL='https://github.com/git/git.git'

DOLLY_MAKE_VERSION=4.4.1
DOLLY_MAKE_URL='https://ftp.gnu.org/gnu/make/make-4.4.1.tar.gz'
DOLLY_MAKE_SHA256=dd16fb1d67bfab79a72f5e8390735c49e3e8e70b4945a15ab1f81ddb78658fb3

# The newest less that GNU termcap serves: from 701 on less asks for a
# capability before tgetent when its output is not a terminal, which termcap
# 1.3.1 does not survive.
DOLLY_LESS_VERSION=692
DOLLY_LESS_URL='https://www.greenwoodsoftware.com/less/less-692.tar.gz'
DOLLY_LESS_SHA256=61300f603798ecf1d7786570789f0ff3f5a1acf075a6fb9f756837d166e37d14

DOLLY_TERMCAP_VERSION=1.3.1
DOLLY_TERMCAP_URL='https://ftp.gnu.org/gnu/termcap/termcap-1.3.1.tar.gz'
DOLLY_TERMCAP_SHA256=91a0e22e5387ca4467b5bcb18edf1c51b930262fd466d5fda396dd9d26719100

DOLLY_SAMURAI_VERSION=1.3
DOLLY_SAMURAI_COMMIT=4288e71812493cb21b54ef23642a13214f44885f
DOLLY_SAMURAI_URL='https://github.com/michaelforney/samurai.git'

DOLLY_BISON_VERSION=3.8.2
DOLLY_BISON_URL='https://ftp.gnu.org/gnu/bison/bison-3.8.2.tar.xz'
DOLLY_BISON_SHA256=9bba0214ccf7f1079c5d59210045227bcf619519840ebfa80cd3849cff5a5bf2

DOLLY_IOSEVKA_COMMIT=dc5f458fa3918d909f0f78313b09b4887f3131d8
DOLLY_IOSEVKA_URL='https://raw.githubusercontent.com/iosevka-webfonts/unhinted-iosevkaterm/dc5f458fa3918d909f0f78313b09b4887f3131d8/WOFF2-Unhinted/IosevkaTerm-SemiBold.woff2'
DOLLY_IOSEVKA_SHA256=8642ab1546b24042d75500d34dbf2cba323bae4424ed41aa3005122b807a05fe
DOLLY_IOSEVKA_TTF_URL='https://raw.githubusercontent.com/iosevka-webfonts/unhinted-iosevkaterm/dc5f458fa3918d909f0f78313b09b4887f3131d8/TTF-Unhinted/IosevkaTerm-SemiBold.ttf'
DOLLY_IOSEVKA_TTF_SHA256=754545a4f6250efdd3d2cc916bb344c59f0c59830405307dfd44d183f919a654
# Subsets the terminal's font on the host (scripts/prepare-image-sources.sh).
DOLLY_FONTTOOLS_VERSION=4.68.0
DOLLY_FONTTOOLS_URL='https://files.pythonhosted.org/packages/35/74/4ea331ecc65ba05a58b1e4e8ccd604c8a15565f876dfbf93fc2a2ea2e22b/fonttools-4.68.0-py3-none-any.whl'
DOLLY_FONTTOOLS_SHA256=d76f8fdcb6936f5e1045a0c9dd721a4bf11112e60d1e243bfa1d39f06a8b3104

DOLLY_DROID_COMMIT=28c94330a909a10a5ab452538c2c97e247c48a13
DOLLY_DROID_URL='https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/28c94330a909a10a5ab452538c2c97e247c48a13/data/fonts/DroidSansFallback.ttf'
DOLLY_DROID_SHA256=56d3edfb377a8bc3c4b77f4476405c770173c0e31221ad7c77d0a8e1f3039a3e
DOLLY_DROID_NOTICE_URL='https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/28c94330a909a10a5ab452538c2c97e247c48a13/data/fonts/NOTICE'
DOLLY_DROID_NOTICE_SHA256=38751245389e1e23f73e6f5384b5cbe7fa972cc4410c5adc9c04b082a0b9561a

DOLLY_STB_COMMIT=2c980bb59875b0d32144a71867fbdebb2f77cd20
DOLLY_STB_TRUETYPE_URL='https://raw.githubusercontent.com/nothings/stb/2c980bb59875b0d32144a71867fbdebb2f77cd20/stb_truetype.h'
DOLLY_STB_TRUETYPE_SHA256=ecd30b05e0dd4fea3a13c26810dd9e1992dc379049482c393d5a19e6b5090aab
DOLLY_STB_IMAGE_URL='https://raw.githubusercontent.com/nothings/stb/2c980bb59875b0d32144a71867fbdebb2f77cd20/stb_image.h'
DOLLY_STB_IMAGE_SHA256=594c2fe35d49488b4382dbfaec8f98366defca819d916ac95becf3e75f4200b3

# mandoc: the package, and the formatter of upstream's manual pages.
DOLLY_MANDOC_VERSION=1.14.6
DOLLY_MANDOC_URL='https://mandoc.bsd.lv/snapshots/mandoc-1.14.6.tar.gz'
DOLLY_MANDOC_SHA256=8bf0d570f01e70a6e124884088870cbed7537f36328d512909eb10cd53179d9c

DOLLY_FONTTOOLS_VERSION=4.68.0
DOLLY_FONTTOOLS_URL='https://files.pythonhosted.org/packages/35/74/4ea331ecc65ba05a58b1e4e8ccd604c8a15565f876dfbf93fc2a2ea2e22b/fonttools-4.68.0-py3-none-any.whl'
DOLLY_FONTTOOLS_SHA256=d76f8fdcb6936f5e1045a0c9dd721a4bf11112e60d1e243bfa1d39f06a8b3104

# Each demo's own pins: demos/DEMO/source-pins.sh.
for demo_pins in "$(dirname -- "${BASH_SOURCE[0]}")"/../demos/*/source-pins.sh; do
  if [[ -f "${demo_pins}" ]]; then source "${demo_pins}"; fi
done
