# Canonical upstream source pins for Dolly's reproducible build.
# This file is shell syntax so the fetch/build scripts consume it directly.

DOLLY_EMSDK_VERSION=6.0.8
DOLLY_EMSDK_IMAGE='docker.io/emscripten/emsdk:6.0.8@sha256:8714ed3a9fb585e662c931259a996bac36a57a8dd34b81e8277436fd77364475'
DOLLY_EMSCRIPTEN_COMMIT=aeb67926e7de656da38bc807d83050af93578758
DOLLY_EMSCRIPTEN_URL='https://github.com/emscripten-core/emscripten.git'

DOLLY_LLVM_COMMIT=4bfd08c2d769736841ae4f5705d76fa6daa39027
DOLLY_LLVM_URL='https://github.com/llvm/llvm-project.git'

DOLLY_SBASE_COMMIT=c546c3a5724c81cee9a11d816a38ccdf17472129
DOLLY_SBASE_URL='https://git.suckless.org/sbase'

DOLLY_AWK_COMMIT=5739fd79bcfc75ba7526773d0cf634521f8aca3c
DOLLY_AWK_URL='https://github.com/onetrueawk/awk.git'

DOLLY_QUICKJS_VERSION=0.15.0
DOLLY_QUICKJS_COMMIT=433941b99fb3c5e7f98b7ebd78727972bcf467ee
DOLLY_QUICKJS_URL='https://github.com/quickjs-ng/quickjs.git'

# Pi v1.0.3; package-lock.json pins the matching published npm packages.
DOLLY_PI_SOURCE_COMMIT=d78dc83d633229d12f8b79631384c4c2717c399f
DOLLY_PI_SOURCE_URL='https://github.com/earendil-works/pi.git'

DOLLY_TYPESCRIPT_VERSION=5.9.3
DOLLY_TYPESCRIPT_URL='https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz'
DOLLY_TYPESCRIPT_SHA256=10e108c9cf7d5f2879053dff18515fb405abf2ccef63eaaf017d9c571687a1d3

DOLLY_CPYTHON_VERSION=3.14.7
DOLLY_CPYTHON_COMMIT=823f0323ee6ec1402088b73bce1a38473cac36dc
DOLLY_CPYTHON_URL='https://github.com/python/cpython.git'

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

DOLLY_0AD_VERSION=0.28.0
DOLLY_0AD_SOURCE_URL='https://releases.wildfiregames.com/0ad-0.28.0-unix-build.tar.xz'
DOLLY_0AD_SOURCE_SHA256=27e217755ef76a922fe58dbf593d96e54b6ed2375d23f548c35619aa6bd5a42a
DOLLY_0AD_DATA_URL='https://releases.wildfiregames.com/0ad-0.28.0-unix-data.tar.xz'
DOLLY_0AD_DATA_SHA256=e844b30ae2102c47e0a4fff2f0e0ef05ba0cebb1890aa72276fa12457c39526f

DOLLY_LIBFFI_VERSION=3.5.2
DOLLY_LIBFFI_URL='https://github.com/libffi/libffi/releases/download/v3.5.2/libffi-3.5.2.tar.gz'
DOLLY_LIBFFI_SHA256=f3a3082a23b37c293a4fcd1053147b371f2ff91fa7ea1b2a52e335676bac82dc

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

# Match Neovim 0.12.5's upstream dependency pins.
DOLLY_NEOVIM_VERSION=0.12.5
DOLLY_NEOVIM_URL='https://github.com/neovim/neovim/archive/refs/tags/v0.12.5.tar.gz'
DOLLY_NEOVIM_SHA256=a810c95332317bd0017e1ca07e376a8472c79075cbed00fa3737d190a8a0a45a

DOLLY_LIBUV_VERSION=1.52.1
DOLLY_LIBUV_URL='https://github.com/libuv/libuv/archive/v1.52.1.tar.gz'
DOLLY_LIBUV_SHA256=478baf2599bfbc882c355288c9cb6f92e0e7dda435fa04031fa5b607cf3f414c

DOLLY_LUA_VERSION=5.1.5
DOLLY_LUA_URL='https://www.lua.org/ftp/lua-5.1.5.tar.gz'
DOLLY_LUA_SHA256=2640fc56a795f29d28ef15e13c34a47e223960b0240e8cb0a82d9b0738695333

DOLLY_CMAKE_VERSION=4.4.3
DOLLY_CMAKE_URL='https://github.com/Kitware/CMake/releases/download/v4.4.3/cmake-4.4.3.tar.gz'
DOLLY_CMAKE_SHA256=c46400618b4f1f2b43507f24fb22f3ae830c3416cf23b776e16e1d413aa892f0

DOLLY_SDL2_VERSION=2.32.10
DOLLY_SDL2_URL='https://www.libsdl.org/release/SDL2-2.32.10.tar.gz'
DOLLY_SDL2_SHA256=5f5993c530f084535c65a6879e9b26ad441169b3e25d789d83287040a9ca5165

DOLLY_OPENAL_VERSION=1.24.3
DOLLY_OPENAL_URL='https://openal-soft.org/openal-releases/openal-soft-1.24.3.tar.bz2'
DOLLY_OPENAL_SHA256=cb5e6197a1c0da0edcf2a81024953cc8fa8545c3b9474e48c852af709d587892

DOLLY_SEVEN_KINGDOMS_VERSION=2.15.7
DOLLY_SEVEN_KINGDOMS_URL='https://downloads.sourceforge.net/project/skfans/7KAA%202.15.7/7kaa-2.15.7.tar.gz'
DOLLY_SEVEN_KINGDOMS_SHA256=2a9833ffe5fa7558857d4f8ba39cad1dccefadb01d298350ed8f954c75b6a6ae

DOLLY_LPEG_VERSION=1.1.0
DOLLY_LPEG_URL='https://github.com/neovim/deps/raw/d495ee6f79e7962a53ad79670cb92488abe0b9b4/opt/lpeg-1.1.0.tar.gz'
DOLLY_LPEG_SHA256=4b155d67d2246c1ffa7ad7bc466c1ea899bbc40fef0257cc9c03cecbaed4352a

DOLLY_LUV_VERSION=1.52.1-0
DOLLY_LUV_URL='https://github.com/luvit/luv/archive/1.52.1-0.tar.gz'
DOLLY_LUV_SHA256=e8b8774b31d24be4fcf2b021b90599ecccc8e476c61efcc59c3c10cab813a885

DOLLY_LUA_COMPAT53_VERSION=0.13
DOLLY_LUA_COMPAT53_URL='https://github.com/lunarmodules/lua-compat-5.3/archive/v0.13.tar.gz'
DOLLY_LUA_COMPAT53_SHA256=f5dc30e7b1fda856ee4d392be457642c1f0c259264a9b9bfbcb680302ce88fc2

DOLLY_UTF8PROC_VERSION=2.11.3
DOLLY_UTF8PROC_URL='https://github.com/juliastrings/utf8proc/archive/v2.11.3.tar.gz'
DOLLY_UTF8PROC_SHA256=abfed50b6d4da51345713661370290f4f4747263ee73dc90356299dfc7990c78

DOLLY_TREESITTER_VERSION=0.26.13
DOLLY_TREESITTER_URL='https://github.com/tree-sitter/tree-sitter/archive/v0.26.13.tar.gz'
DOLLY_TREESITTER_SHA256=ece24c3c5e2a76384075e830c7139b59fce8fb01e4ef8436fab08bbe10444c89

# Neovim's bundled grammar revisions (cmake.deps/deps.txt).
DOLLY_TREESITTER_C_URL='https://github.com/tree-sitter/tree-sitter-c/archive/v0.24.1.tar.gz'
DOLLY_TREESITTER_C_SHA256=25dd4bb3dec770769a407e0fc803f424ce02c494a56ce95fedc525316dcf9b48
DOLLY_TREESITTER_LUA_URL='https://github.com/tree-sitter-grammars/tree-sitter-lua/archive/v0.5.0.tar.gz'
DOLLY_TREESITTER_LUA_SHA256=cf01b93f4b61b96a6d27942cf28eeda4cbce7d503c3bef773a8930b3d778a2d9
DOLLY_TREESITTER_VIM_URL='https://github.com/tree-sitter-grammars/tree-sitter-vim/archive/v0.8.1.tar.gz'
DOLLY_TREESITTER_VIM_SHA256=93cafb9a0269420362454ace725a118ff1c3e08dcdfdc228aa86334b54d53c2a
DOLLY_TREESITTER_VIMDOC_URL='https://github.com/neovim/tree-sitter-vimdoc/archive/v4.1.0.tar.gz'
DOLLY_TREESITTER_VIMDOC_SHA256=020e8f117f648c8697fca967995c342e92dbd81dab137a115cc7555207fbc84f
DOLLY_TREESITTER_QUERY_URL='https://github.com/tree-sitter-grammars/tree-sitter-query/archive/v0.8.0.tar.gz'
DOLLY_TREESITTER_QUERY_SHA256=c2b23b9a54cffcc999ded4a5d3949daf338bebb7945dece229f832332e6e6a7d
DOLLY_TREESITTER_MARKDOWN_URL='https://github.com/tree-sitter-grammars/tree-sitter-markdown/archive/v0.5.3.tar.gz'
DOLLY_TREESITTER_MARKDOWN_SHA256=df845b1ab7c7c163ec57d7fa17170c92b04be199bddab02523636efec5224ab6

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

DOLLY_RAYLIB_VERSION=6.0
DOLLY_RAYLIB_COMMIT=dbc56a87da87d973a9c5baa4e7438a9d20121d28
DOLLY_RAYLIB_URL='https://github.com/raysan5/raylib.git'

DOLLY_BOX3D_VERSION=0.1.0
DOLLY_BOX3D_COMMIT=8441b4a06d6d09dcfb0b0f704df4d847d1437b92
DOLLY_BOX3D_URL='https://github.com/erincatto/box3d.git'

# ClassiCube source and bundled texture pack.
DOLLY_CLASSICUBE_URL="https://codeload.github.com/ClassiCube/ClassiCube/tar.gz/df93681952f8bb2cb0e7943f708db30cb92a34fa"
DOLLY_CLASSICUBE_SHA256="3490f4747012235459609a387b87300b0e52de4b76073df77340eadc9691407e"

DOLLY_LLAMACPP_COMMIT=093a2f86c3e37c54fa3e1f9efb17b304f3433abd
DOLLY_LLAMACPP_URL='https://codeload.github.com/ggml-org/llama.cpp/tar.gz/093a2f86c3e37c54fa3e1f9efb17b304f3433abd'
DOLLY_LLAMACPP_SHA256=f2091fce4f21fa35d207b3c94b889c6f70379666d244eb989e987f9fbcc5d6ed
DOLLY_DAWN_WEBGPU_URL='https://github.com/google/dawn/releases/download/v20260908.214631/emdawnwebgpu_pkg-v20260908.214631.zip'
DOLLY_DAWN_WEBGPU_SHA256=9c36eb46ada070b9cc0de2bdfd04c1fa1a1fd852cc1ebb371e96e68e1efe6c3c

DOLLY_LUA55_URL='https://www.lua.org/ftp/lua-5.5.1.tar.gz'
DOLLY_LUA55_SHA256=1c4b4068d67061f2a2231ad2b5422e77acea1487ea9890f6320af614f4373dce

# Native shader translator used by the 0 A.D. asset preparation step.
DOLLY_0AD_NAGA_VERSION=30.0.1
DOLLY_0AD_NAGA_SHA256=45283c11b8b1da1936214eefc9caf9c1bc74ae5c090023eaea84ba317a194c8c

DOLLY_EMACS_VERSION=31.1
DOLLY_EMACS_URL='https://ftp.gnu.org/gnu/emacs/emacs-31.1.tar.gz'
DOLLY_EMACS_SHA256=3cad7fd1466c0e24867df8d2609da3ac75abc90d7c4c0175e410e9be46d4092a

# Xonotic 0.8.6: the release zip (data pk3 archives) and its source zip, whose
# darkplaces, gmqcc and qcsrc trees equal the repositories' xonotic-v0.8.6 tags.
DOLLY_XONOTIC_VERSION=0.8.6
DOLLY_XONOTIC_URL='https://dl.xonotic.org/xonotic-0.8.6.zip'
DOLLY_XONOTIC_SHA256=50850f8d800e7499722f6ea61e478e96464a375494b5a24da93aa0598cbe964d
DOLLY_XONOTIC_SOURCE_URL='https://dl.xonotic.org/xonotic-0.8.6-source.zip'
DOLLY_XONOTIC_SOURCE_SHA256=8b92ac781cff4ae89c121a23eacd7dec05a2aabedaccc23a19d1a0958b4012a8

# Dear ImGui, with its SDL2 and SDL_Renderer backends, for the imgui package.
DOLLY_IMGUI_VERSION=1.92.9b
DOLLY_IMGUI_URL='https://github.com/ocornut/imgui/archive/refs/tags/v1.92.9b.tar.gz'
DOLLY_IMGUI_SHA256=21d8a0a565e85dce943e375db00812c2f3f0ab21f3f0f7964e364a63422d7f99

# IJG libjpeg, linked into Xonotic's client for its JPEG textures.
DOLLY_JPEG_VERSION=9f
DOLLY_JPEG_URL='https://www.ijg.org/files/jpegsrc.v9f.tar.gz'
DOLLY_JPEG_SHA256=04705c110cb2469caa79fb71fba3d7bf834914706e9641a4589485c1f832565b

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

# The Wine demo: the last release series whose DLLs are all ELF-style Winelib (demos/wine/README.md);
# flex generates three of its parsers during host preparation, as Bison does.
DOLLY_WINE_VERSION=4.0.4
DOLLY_WINE_URL='https://dl.winehq.org/wine/source/4.0/wine-4.0.4.tar.xz'
DOLLY_WINE_SHA256=53a051ff61009f5c0d0f3770fac56c5d1cccd1015078f8b214d63bc6cd8f6169
DOLLY_FLEX_VERSION=2.6.4
DOLLY_FLEX_URL='https://github.com/westes/flex/releases/download/v2.6.4/flex-2.6.4.tar.gz'
DOLLY_FLEX_SHA256=e87aae032bf07c26f85ac0ed3250998c37621d95f8bd748b31f15b33c45ee995
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
# libhubbub's tables during host preparation, as flex does Wine's lexers.
DOLLY_NETSURF_VERSION=3.11
DOLLY_NETSURF_URL='https://download.netsurf-browser.org/netsurf/releases/source-full/netsurf-all-3.11.tar.gz'
DOLLY_NETSURF_SHA256=4dea880ff3c2f698bfd62c982b259340f9abcd7f67e6c8eb2b32c61f71644b7b
DOLLY_GPERF_VERSION=3.1
DOLLY_GPERF_URL='https://ftp.gnu.org/gnu/gperf/gperf-3.1.tar.gz'
DOLLY_GPERF_SHA256=588546b945bba4b70b6a3a616e80b4ab466e3f33024a352fc2198112cdbb3ae2
# The speech demo: transcribe.cpp with the ggml it vendors; NVIDIA's Parakeet TDT-CTC 110M (8-bit) and
# Silero VAD 6.2 as that project publishes them for it (GGUF).
DOLLY_TRANSCRIBE_URL='https://codeload.github.com/handy-computer/transcribe.cpp/tar.gz/c63b18e2b4292760f71721ad86778e721c92ebeb'
DOLLY_TRANSCRIBE_SHA256=688b5064156032c1703070c521247f770882498075ec79226ac4ef717d3f1fb0
DOLLY_PARAKEET_URL='https://huggingface.co/handy-computer/parakeet-tdt_ctc-110m-gguf/resolve/766f172fe70eb66785e3371664f53762e0fbafaa/parakeet-tdt_ctc-110m-Q8_0.gguf'
DOLLY_PARAKEET_SHA256=7dd44c74a331d788a4e5f8b16913b3feb29ced22cf5613aad0e0f6cd30516296
DOLLY_SILERO_VAD_URL='https://huggingface.co/handy-computer/silero-vad-v6.2-gguf/resolve/97bbd75179f535e4708bccdf61e9278b8b60dfc7/silero-vad-v6.2-F32.gguf'
DOLLY_SILERO_VAD_SHA256=0d871a800c420fdd5d1b17a3aea4296d1c39608f0ff4a9295eb76457eb1c88e6
# GTK+ for the Wine demo: the last GTK+ that draws without cairo, with the ATK of its time; GDK's and
# Pango's Windows backends are built against Winelib. Pango is the first whose OpenType code may be taken
# under the GPL (before, the FreeType licence alone), and GLib the series that Pango needs.
DOLLY_GLIB_VERSION=2.12.13
DOLLY_GLIB_URL='https://download.gnome.org/sources/glib/2.12/glib-2.12.13.tar.bz2'
DOLLY_GLIB_SHA256=1253d563ca2e50292d924849fe3a23c3b7bc707ab8b79bda19319f9d192b0e8e
DOLLY_ATK_VERSION=1.9.1
DOLLY_ATK_URL='https://download.gnome.org/sources/atk/1.9/atk-1.9.1.tar.bz2'
DOLLY_ATK_SHA256=65732d71c6c02e957673f49f8c5818f2cad3f451116b58ab1636c73dc8ab0dc6
DOLLY_PANGO_VERSION=1.14.10
DOLLY_PANGO_URL='https://download.gnome.org/sources/pango/1.14/pango-1.14.10.tar.bz2'
DOLLY_PANGO_SHA256=1c53eb4a430c2311b75d6bedef87e452fa3cfea3c51a23a2e898f95e868bc503
DOLLY_GTK_VERSION=2.6.10
DOLLY_GTK_URL='https://download.gnome.org/sources/gtk+/2.6/gtk+-2.6.10.tar.bz2'
DOLLY_GTK_SHA256=d408b606c8dd414dfbf220ccc168a0bc85a419945439796792a5357a96ff02af
# GIMP for the Wine demo: the last release of the 2.2 series, which needs no cairo, GEGL or babl; libart
# fills its paths; its text is drawn by Pango's FreeType backend, which finds fonts with fontconfig, whose
# configuration expat parses.
DOLLY_GIMP_VERSION=2.2.17
DOLLY_GIMP_URL='https://download.gimp.org/gimp/v2.2/gimp-2.2.17.tar.bz2'
DOLLY_GIMP_SHA256=8a4d3b28b3a11ea7564df09c8990d1c90bc3dd713b1dde0737e08603854b01b4
DOLLY_LIBART_VERSION=2.3.17
DOLLY_LIBART_URL='https://download.gnome.org/sources/libart_lgpl/2.3/libart_lgpl-2.3.17.tar.bz2'
DOLLY_LIBART_SHA256=0c9a06d612cf2e527b96aeb129fe79db750ab93e13f215043d720bcde72b407e
DOLLY_FONTCONFIG_VERSION=2.3.2
DOLLY_FONTCONFIG_URL='https://www.freedesktop.org/software/fontconfig/release/fontconfig-2.3.2.tar.gz'
DOLLY_FONTCONFIG_SHA256=6f7b91d328d6408c097ec11777bf4b1c2c710613b573b399794bc5999ff12227
DOLLY_EXPAT_VERSION=2.7.1
DOLLY_EXPAT_URL='https://github.com/libexpat/libexpat/releases/download/R_2_7_1/expat-2.7.1.tar.xz'
DOLLY_EXPAT_SHA256=354552544b8f99012e5062f7d570ec77f14b412a3ff5c7d8d0dae62c0d217c30

DOLLY_TMUX_VERSION=3.8
DOLLY_TMUX_URL='https://github.com/tmux/tmux/releases/download/3.8/tmux-3.8.tar.gz'
DOLLY_TMUX_SHA256=e79c699c7e949dccd0a4a125e17b8d1261e311b16979dbc8eb34542f3966d82e

DOLLY_LIBEVENT_VERSION=2.1.13-stable
DOLLY_LIBEVENT_URL='https://github.com/libevent/libevent/releases/download/release-2.1.13-stable/libevent-2.1.13-stable.tar.gz'
DOLLY_LIBEVENT_SHA256=f7e9383b8c0baa81b687e5b5eecc01beefaf1b19b64151d95ed61647fe7a315c

# NetBSD's libterminfo in its portable release: the terminfo library tmux
# reads its terminal with. GNU termcap has no setupterm.
DOLLY_NETBSD_CURSES_VERSION=0.3.2
DOLLY_NETBSD_CURSES_URL='https://github.com/sabotage-linux/netbsd-curses/archive/refs/tags/v0.3.2.tar.gz'
DOLLY_NETBSD_CURSES_SHA256=9d3ebd651e5f70b87b1327b01cbd7e0c01a0f036b4c1371f653b7704b11daf23

# Mojo: tag mojo/v1.1.0 of Modular's repository, the LLVM it pins
# (bazel/public-patches/llvm_source.bzl) and what its compiler takes besides
# LLVM (bazel/common.MODULE.bazel): two libraries, OpenTelemetry's headers, and
# Zstandard, which LLVM compresses a precompiled package with.
DOLLY_MODULAR_VERSION=1.1.0
DOLLY_MODULAR_COMMIT=c6fa49f712fe15c99d0461ad2baaf2a15cbc58ce
DOLLY_MODULAR_URL='https://github.com/modular/modular.git'
DOLLY_MOJO_LLVM_COMMIT=4154b56ccc70220dca3fa1226fc8a24bafd90ac3
DOLLY_MOJO_LLVM_URL='https://github.com/llvm/llvm-project.git'
DOLLY_FMT_VERSION=11.2.0
DOLLY_FMT_URL='https://github.com/fmtlib/fmt/archive/refs/tags/11.2.0.tar.gz'
DOLLY_FMT_SHA256=bc23066d87ab3168f27cef3e97d545fa63314f5c79df5ea444d41d56f962c6af
DOLLY_XXHASH_VERSION=0.8.3
DOLLY_XXHASH_URL='https://github.com/Cyan4973/xxHash/archive/refs/tags/v0.8.3.tar.gz'
DOLLY_XXHASH_SHA256=aae608dfe8213dfd05d909a57718ef82f30722c392344583d3f39050c7f29a80
DOLLY_OPENTELEMETRY_VERSION=1.19.0
DOLLY_OPENTELEMETRY_URL='https://github.com/open-telemetry/opentelemetry-cpp/archive/refs/tags/v1.19.0.tar.gz'
DOLLY_OPENTELEMETRY_SHA256=e0330194b72f2fe4c0ce3ece06b02dc4aa0ab491eb75bf42c6f5e283912e468c
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
# Neatvi: the vi package.
DOLLY_NEATVI_VERSION=20
DOLLY_NEATVI_URL='https://github.com/aligrudi/neatvi/archive/refs/tags/20.tar.gz'
DOLLY_NEATVI_SHA256=e1d9a89d770aa5bb60da472be1a526eb1d99be9267c4d6067fc625f10efc8fe5
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
# The WebAssembly Binary Toolkit: the source release, with its submodules.
DOLLY_WABT_VERSION=1.0.42
DOLLY_WABT_URL='https://github.com/WebAssembly/wabt/releases/download/1.0.42/wabt-1.0.42.tar.xz'
DOLLY_WABT_SHA256=a76cda3c174a43097863a07fc0b0c202f770f53e21806ea2636f167d1ffb1e30
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
# mandoc: the package, and the formatter of the tools packages' manual pages.
DOLLY_MANDOC_VERSION=1.14.6
DOLLY_MANDOC_URL='https://mandoc.bsd.lv/snapshots/mandoc-1.14.6.tar.gz'
DOLLY_MANDOC_SHA256=8bf0d570f01e70a6e124884088870cbed7537f36328d512909eb10cd53179d9c
# toybox: its grep and sed, in the toybox package.
DOLLY_TOYBOX_VERSION=0.8.15
DOLLY_TOYBOX_URL='https://landley.net/toybox/downloads/toybox-0.8.15.tar.gz'
DOLLY_TOYBOX_SHA256=44e2bab43dfe2c171743297631ce558c6d9ed38b87a66fd751cef617574b375e
# dte: the editor package.
DOLLY_DTE_VERSION=1.11.1
DOLLY_DTE_URL='https://craigbarnes.gitlab.io/dist/dte/dte-1.11.1.tar.gz'
DOLLY_DTE_SHA256=3d7d0d375fd31906ed436de20161dddc42d97f969a93d22b02aecfc3451e6c39
