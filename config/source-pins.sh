# Canonical external-source pins for Dolly's reproducible build.
# This file is shell syntax so the fetch/build scripts consume it directly.

DOLLY_EMSDK_VERSION=6.0.8
DOLLY_EMSDK_IMAGE='docker.io/emscripten/emsdk:6.0.8@sha256:8714ed3a9fb585e662c931259a996bac36a57a8dd34b81e8277436fd77364475'

DOLLY_LLVM_COMMIT=4bfd08c2d769736841ae4f5705d76fa6daa39027
DOLLY_LLVM_URL='https://github.com/llvm/llvm-project.git'

DOLLY_SBASE_COMMIT=c546c3a5724c81cee9a11d816a38ccdf17472129
DOLLY_SBASE_URL='https://git.suckless.org/sbase'

DOLLY_AWK_COMMIT=5739fd79bcfc75ba7526773d0cf634521f8aca3c
DOLLY_AWK_URL='https://github.com/onetrueawk/awk.git'

DOLLY_QUICKJS_VERSION=0.15.0
DOLLY_QUICKJS_COMMIT=433941b99fb3c5e7f98b7ebd78727972bcf467ee
DOLLY_QUICKJS_URL='https://github.com/quickjs-ng/quickjs.git'

DOLLY_PI_VERSION=0.84.4
DOLLY_PI_URL='https://registry.npmjs.org/@earendil-works/pi-coding-agent/-/pi-coding-agent-0.84.4.tgz'
DOLLY_PI_SHA256=5bce766d19c3ceba18f3fbaad91c449c9f9d73981f9e3400ecef932006f06968
DOLLY_ESBUILD_VERSION=0.25.9

DOLLY_ZIG_VERSION=0.16.0
DOLLY_ZIG_URL='https://ziglang.org/download/0.16.0/zig-0.16.0.tar.xz'
DOLLY_ZIG_SHA256=43186959edc87d5c7a1be7b7d2a25efffd22ce5807c7af99067f86f99641bfdf

DOLLY_WAMR_COMMIT=68b8ed3892b857218cb2d0fb7369431fae6fc801
DOLLY_WAMR_URL='https://github.com/bytecodealliance/wasm-micro-runtime.git'

DOLLY_GHOSTTY_COMMIT=4540d499ae463ad7b90f28f6f852f64f844c160f
DOLLY_GHOSTTY_URL='https://github.com/ghostty-org/ghostty.git'

DOLLY_UUCODE_VERSION=0.2.0
DOLLY_UUCODE_COMMIT=2826a37a4562284fdacd8fa029d49509cc9bffcd
DOLLY_UUCODE_URL='https://deps.files.ghostty.org/uucode-2826a37a4562284fdacd8fa029d49509cc9bffcd.tar.gz'
DOLLY_UUCODE_SHA256=7e76fc7fab1e7ac728c52b35bbb3e5b8c639841abfc7fe1a4bcb13050594bc9e

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

DOLLY_LUA_VERSION=5.5.1
DOLLY_LUA_URL='https://www.lua.org/ftp/lua-5.5.1.tar.gz'
DOLLY_LUA_SHA256=1c4b4068d67061f2a2231ad2b5422e77acea1487ea9890f6320af614f4373dce

DOLLY_BISON_VERSION=3.8.2
DOLLY_BISON_URL='https://ftp.gnu.org/gnu/bison/bison-3.8.2.tar.xz'
DOLLY_BISON_SHA256=9bba0214ccf7f1079c5d59210045227bcf619519840ebfa80cd3849cff5a5bf2

DOLLY_IOSEVKA_COMMIT=dc5f458fa3918d909f0f78313b09b4887f3131d8
DOLLY_IOSEVKA_URL='https://raw.githubusercontent.com/iosevka-webfonts/unhinted-iosevkaterm/dc5f458fa3918d909f0f78313b09b4887f3131d8/WOFF2-Unhinted/IosevkaTerm-SemiBold.woff2'
DOLLY_IOSEVKA_SHA256=8642ab1546b24042d75500d34dbf2cba323bae4424ed41aa3005122b807a05fe
DOLLY_IOSEVKA_TTF_URL='https://raw.githubusercontent.com/iosevka-webfonts/unhinted-iosevkaterm/dc5f458fa3918d909f0f78313b09b4887f3131d8/TTF-Unhinted/IosevkaTerm-SemiBold.ttf'
DOLLY_IOSEVKA_TTF_SHA256=754545a4f6250efdd3d2cc916bb344c59f0c59830405307dfd44d183f919a654

DOLLY_STB_COMMIT=2c980bb59875b0d32144a71867fbdebb2f77cd20
DOLLY_STB_TRUETYPE_URL='https://raw.githubusercontent.com/nothings/stb/2c980bb59875b0d32144a71867fbdebb2f77cd20/stb_truetype.h'
DOLLY_STB_TRUETYPE_SHA256=ecd30b05e0dd4fea3a13c26810dd9e1992dc379049482c393d5a19e6b5090aab
