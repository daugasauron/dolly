# The libraries inside the 0 A.D. builds, and SpiderMonkey, as packages: the investigation

Read at `/home/daug/dev/dolly/work/rust` (head `8af8f983`, `main` is an ancestor), with the built images in its `dist/`, the build logs in `build/image-logs/`, the staged 0 A.D. release under `.cache/0ad/0ad-0.28.0/` and the extracted sources under `build/generated/zero-ad-build-*/`. Nothing was built, run or changed; every number comes from `git`, `grep`, `sha256sum`, the recipes, the logs and the task files. Paths are relative to the tree root. This builds on [`copy-directive/investigation.md`](../20261013-144241-copy-directive/investigation.md) (§3.2 K3 and §5.B cover the FreeType and libpng `COPY` rows) and does not repeat it.

**Summary (findings, no advice)**

1. Every library version in `zero-ad-deps` was chosen on 2026-09-23 for a host Emscripten build (`2fd9966c`): ICU 68.2, Boost 1.83.0, FreeType 2.14.3, libpng 1.6.58, Ogg 1.3.5 and Vorbis 1.3.7 are the versions of Emscripten's ports (`-sUSE_ICU=1 -sUSE_BOOST_HEADERS=1 …`), fmt 7.1.3, libxml2 2.13.5, ENet 1.3.18 and libsodium 1.0.20 were Dolly's own four rows with no reason recorded. None is a version 0 A.D. pins: 0 A.D. bundles only SpiderMonkey, premake, cxxtest, fcollada, nvtt and spirv-reflect, and asks pkg-config for the rest with one floor, fmt ≥ 5.3.0.
2. They moved into Dolly in one commit, `776ae6f5` (2026-10-01), as one image with one source archive, and SpiderMonkey followed on 2026-10-07 (`9fa4b4d3`) as a second image whose shape was decided in writing: `FROM zero-ad-deps` "for pkgconf, zlib.pc and the C++ toolchain", Python and Cargo by `INSTALL`, the engine taking the result by `COPY`, so that "the deps image … should not carry Python, Rust and Cargo (about 700 MB) for every rebuild" and "SpiderMonkey's patch changes should rebuild SpiderMonkey alone".
3. Today `zero-ad-deps` (418 MB, 284 s of build script) compiles twelve things and writes seven `.pc` files; `zero-ad-spidermonkey` (874 MB, 865 s) produces two archives of 21.4 MB and 5.2 MB and 341 header paths; `zero-ad-engine` (479 MB, 310 s of `make`) copies the two SpiderMonkey rows and writes SpiderMonkey's `.pc` itself.
4. Users: `zero-ad-deps` is `FROM` for five recipes (the two 0 A.D. stages and the three views `pkgconf`, `libpng`, `freetype`) and a `COPY` source for `wine-build` (8 rows), `xonotic-build` (5) and `xonotic` (2). Nothing installs the three views except `freetype` installing `libpng`. No recipe outside the 0 A.D. chain asks for `pkg-config`. SpiderMonkey has one consumer; every other JavaScript user links QuickJS, and the Claude Code task of 2026-10-05 weighed SpiderMonkey as a Node engine and chose "extend Janis".
5. SpiderMonkey's source is 0 A.D.'s bundled `mozjs-128.13.0.tar.xz` (150,635,036 bytes, SHA-256 `6422e51b…`, a digest recorded nowhere in the tree), which 0 A.D.'s `build.sh` fetches from `releases.wildfiregames.com` or makes from Mozilla's `firefox-128.13.0esr.source.tar.xz` with `make-source-package.py`. The staged, pruned tree is pinned in the recipe (`a0e7bd45…`); `config/source-pins.sh` has no SpiderMonkey entry.
6. Of 0 A.D.'s eight SpiderMonkey patches `patch.sh` applies six unconditionally; two are needed to build at all here (`FixRustLinkage`, `FixPython3_14` for CPython 3.14.7), one fixes a GC crash (`FixExtraGCTracing`), three are inert for a static clang build. Dolly's 490-line patch shares no hunk with them; 171 of its lines date from the host cross-build of 2026-09-23 and 319 from the in-Dolly build of 2026-10-07.
7. The configure flags split cleanly: `--without-intl-api --disable-js-shell --disable-tests --disable-jemalloc` are 0 A.D.'s `mozconfig`; `--disable-shared-js` is Dolly's and is the opposite of 0 A.D.'s `--enable-shared-js`; `--disable-jit`, the wasi triple, `-D__wasi__`, the Rust target and linker are the port's.
8. The entanglements, read from the files: ENet's socket backend `enet-dolly.c` (153 lines) is a generic HTTP datagram transport keyed by `$DOLLY_ENET_RELAY`, and the relay it speaks to is the demo's tool; ICU's data file `icudt68l.dat` (28.6 MB) is ICU's own, byte-identical in the pinned archive and the staged content, but staged by 0 A.D.'s content script from the Emscripten port cache and found at run time by ICU's `ICU_DATA`, which `/usr/bin/zero-ad` sets; `libicudata.a` is the stub.
9. The language fact the cases turn on: a package's `INSTALL` rows are installed by whoever installs it, and a build image keeps the files of what it installs (`src/dollyfile.c:1401`); so a `spidermonkey` package whose recipe said `INSTALL python`, `cargo`, `cbindgen` would put Python, Rust and Cargo (about 425 MB of snapshots) and `dso@0`, `sockets@0`, `threads@0` into `zero-ad-engine` and into any session that installed it, and no existing toolchain holds those four tools with `pkg-config`, `patch` and `zlib.pc`.
10. Not findable without building: whether SpiderMonkey builds unchanged on a base other than `zero-ad-deps`; whether Wildfire's published tarball equals the bundled one; whether 0 A.D. R28 compiles against fmt 11; the per-library sizes inside `zero-ad-deps`; whether a real `libicudata.a` can be made in Dolly.

---

## 1. History

### 1.1 Chronology

| Date | Commit | What it did to these builds | Reason given |
| --- | --- | --- | --- |
| 2026-09-23 | `2fd9966c` "Run the 0 A.D. engine and deterministic replays in Dolly" | First build, on the host in the emsdk container. `toolchain/0ad/dependencies.sh` compiled a probe with `-sUSE_ICU=1 -sUSE_BOOST_HEADERS=1 -sUSE_FREETYPE=1 -sUSE_LIBPNG=1 -sUSE_OGG=1 -sUSE_VORBIS=1` (Emscripten's ports), then CMake-built fmt, libxml2, ENet, SDL2, libpng and FreeType, and ran libsodium's `./configure --host=wasm64-unknown-emscripten`. `dependencies.tsv` had four rows: fmt 7.1.3, libxml2 2.13.5, enet 1.3.18, libsodium 1.0.20. `package-headless.py` copied `icudt68l.dat` out of `.cache/emscripten/ports/icu/icu`. `sodium.patch` (65 lines) tested `DOLLY`. | Message body empty. The baseline task: "A real browser caught legacy EH instructions in the SDK's libpng port despite a successful Wasm link. The tracked dependency build now recompiles libpng and FreeType with Dolly's modern Wasm exception/longjmp flags" (`tasks/20260923-115439-0ad-baseline/TASK.md:90-92`). |
| 2026-09-23 | `7256b761` "Bootstrap wasm64 SpiderMonkey for the 0 A.D. port" | `toolchain/0ad/spidermonkey.patch`, 171 lines; the container cross-build `build-spidermonkey.sh`. | Baseline task: "SpiderMonkey 128.13.0 with WFG's fixes compiles as wasm64 and runs in a Dolly process … It adds wasm64 CPU detection, an explicit Rust target, static mozglue linkage, process entropy and aligned GC allocation without native address probing" (`:36-50`). The investigation task had found the bundled tarball "rejects `wasm64-unknown-wasi` with `Unknown CPU type: wasm64`" and "inspection of the shipped WFG patch series found no addition of wasm64 target detection" (`tasks/20260923-113538-0ad-investigation/TASK.md:25-28`). |
| 2026-09-24 | `9896d6af` "Run 0 A.D. multiplayer through a bounded HTTP room relay" | `enet-dolly.c` born (message body empty). | Baseline task `:283`: "Upstream ENet now runs through a bounded room relay using Dolly's" HTTP broker. |
| 2026-10-01 | `776ae6f5` "Build the 0 A.D. engine and its libraries inside Dolly" | `zero-ad-deps` (a DOLLY 5 `IMAGE`) "builds libpng, FreeType, Ogg/Vorbis, fmt and libxml2 with CMake, ICU, libsodium and ENet from their source directories, SDL2 from its module and pkgconf for premake, all from pinned upstream archives (build-sources.tsv)"; `zero-ad-engine` builds premake and pyrogenesis "against the still host-built SpiderMonkey". | Self-host task: "ICU and libsodium have only autotools, which Slop cannot run, so their source directories are compiled as Emscripten's ports and libsodium's `build.zig` do" (`tasks/20260930-231200-self-host-zero-ad/TASK.md:208-213`); "`pkg-config` descriptions are written for SDL2 (copied without its own) and the libraries built without their build system; premake needs one for every library" (`:226-228`). |
| 2026-10-01 | `791d14cc` "Remove the host engine build; build the ENet and OpenAL probes in Dolly" | The host scripts go; `engine.patch`, `sodium.patch` and `enet-dolly.c` "move beside the recipes that use them". | |
| 2026-10-02 | `f4c890f0` "Inline the 0 A.D. build steps into their Dollyfiles" | "Dollyfile 6 drops modules … SDL2 is copied from sdl2-build with a small sdl2.pc instead of rebuilding it through its module". | |
| 2026-10-02 | (task) | Integrator's decision on SpiderMonkey's Cargo steps: build upstream Cargo inside Dolly "instead of teaching Patti Cargo subcommands or patching Cargo out of mozjs. Unchanged upstream tools over a deliberate substrate is the porting rule" (`:281-288`). | |
| 2026-10-06 | `f5c1185e` "zero-ad: build premake, the dependencies and the engine as Dolly" | "The patches test `__dolly__`, libsodium takes its generic paths, ICU's double-conversion learns wasm64 and its charset default is passed as the header's own hook." `sodium.patch` is gone; the flags are spelled in the recipe. | |
| 2026-10-06 | `61f4edb5` "Point 0 A.D.'s dependencies at the SDL2 package and repin the catalog" | The three SDL2 rows name the `sdl2` package; the directive stays `COPY`. | No body. |
| 2026-10-06 | `113cce04` | The licence texts of every statically linked library and SpiderMonkey's crates travel `zero-ad-deps` → `zero-ad-engine` → `zero-ad` (the 12 licence `COPY` rows). | "The owner delegated the three open licence decisions." |
| 2026-10-07 | `9fa4b4d3` "Build SpiderMonkey 128.13.0 inside Dolly: recipe, consolidated patch, cbindgen" | `Dollyfile-zero-ad-spidermonkey`, `Dollyfile-cbindgen`, the patch grows to 477 lines; `zero-ad-engine` "takes its headers and the two archives by COPY instead of the host-built mozjs-host.tar.gz". | The shape was decided before the build (`:328-336`): "a separate build-only toolchain … (`FROM zero-ad-deps` for pkgconf, zlib.pc and the C++ toolchain; `INSTALL python`, `INSTALL cargo`, which brings `rust`; a `cbindgen` package), and `zero-ad-engine` takes `/tmp/mozjs` by `COPY` as `zero-ad-deps` takes SDL2. Reasons: the engine needs only headers and two archives; the deps image (229-461 s, 430 MB) should not carry Python, Rust and Cargo (about 700 MB) for every rebuild; SpiderMonkey's patch changes should rebuild SpiderMonkey alone; and the slot caps favour one heavy build per image." |
| 2026-10-07 | `7debb6c8`, `39e9fcd6`, `cf8d0d9f`, `437cd275` | `REQUIRES HEADER zlib`/`LIB z` added "(deps does not retain them)"; `--with-libclang-path` skips a `c++ -print-search-dirs` probe; `-fstandalone-debug` hunk; the style fixtures kept in the staged tree. | Each message says why (above). |
| 2026-10-07 | `bb95315c` "Xonotic: link IJG libjpeg and FreeType into the client" | `xonotic-build` copies FreeType and libpng out of `zero-ad-deps`: "FreeType and libpng are copied from the zero-ad-deps build." | |
| 2026-10-09 | `3a50bdfc` "Wine demo" | `wine-build` copies the same, plus libpng's three headers "for NetSurf". | No body. |
| 2026-10-12 | `837014d0` "pkgconf, libpng and freetype are packages, kept from zero-ad-deps" | The three views. | "xonotic-build and wine-build copy libpng and FreeType out of zero-ad-deps with the same rows; pkg-config is what a build in a session asks for a library. libpng brings zlib and the zlib.pc zero-ad-deps writes, since its own .pc names it; freetype brings libpng." The rule applied: "Cheapest shape first: a thin `PACKAGE` over the image that builds the program (`FROM` and `EXPORTS`) adds no image input and rebuilds nothing" (`tasks/20261012-130814-packages/TASK.md:43-44`). |
| 2026-10-13 | (task) | The same task's "Left": "`xonotic-build` and `wine-build` `INSTALL` `libpng` and `freetype` in place of their five and eight `COPY` rows: two image rebuilds" (`:191-193`). | |

### 1.2 The rulings of 2026-10-12 on each library

`tasks/20261012-130814-packages/TASK.md:105-108`:

- pkgconf: "made: `pkg-config` is what a build asks for a library".
- libpng, FreeType: "which `xonotic-build` and `wine-build` copy with the same rows: made".
- Ogg, Vorbis, fmt, libxml2: "stay: upstream's CMake builds them here unchanged, one consumer".
- ICU, libsodium, ENet, Boost's headers (150 MB): "stay: one consumer; ICU's data file is 0 A.D.'s, ENet's transport is 0 A.D.'s relay".

The rule they were judged by (`:27-33`): "A **library** is a package when a program outside its own build would link it and building it here took a port … Portable C that `cc` compiles from upstream's archive in seconds stays where its one consumer builds it … until a second image uses it."

### 1.3 Where each version came from

| Library | Version | First pinned | By what | 0 A.D.'s own requirement |
| --- | --- | --- | --- | --- |
| libpng | 1.6.58 | 2026-09-23 | Emscripten's port; `build-sources.tsv:1` still fetches `storage.googleapis.com/webassembly/emscripten-ports/libpng-1.6.58.tar.gz` | pkg-config `libpng` (`extern_libs5.lua:456`) |
| FreeType | VER-2-14-3 | 2026-09-23 | Emscripten's port (`dependencies.sh` built `.cache/emscripten/ports/freetype/freetype-VER-2-14-3`) | pkg-config `freetype2` |
| Ogg, Vorbis | 1.3.5, 1.3.7 | 2026-09-23 | `-sUSE_OGG=1 -sUSE_VORBIS=1` | pkg-config `vorbisfile` |
| ICU | 68.2 | 2026-09-23 | `-sUSE_ICU=1`; the port cache's `uvernum.h:142` says `68.2` | pkg-config `icu-i18n`, `icu-uc`; `HWDetect.cpp:217` reports `U_ICU_VERSION`; no floor |
| Boost headers | 1.83.0 | 2026-09-23 | `-sUSE_BOOST_HEADERS=1`; `build-sources.tsv:6` is `emscripten-ports/boost` | system include; no floor |
| fmt | 7.1.3 | 2026-09-23 | `dependencies.tsv` row 1, no reason recorded | "requires fmt 5.3.0 or greater" (`extern_libs5.lua:299`); 85 `fmt::` uses in the engine |
| libxml2 | 2.13.5 | 2026-09-23 | `dependencies.tsv` | pkg-config `libxml-2.0` |
| ENet | 1.3.18 | 2026-09-23 | `dependencies.tsv` | pkg-config `libenet` |
| libsodium | 1.0.20 | 2026-09-23 | `dependencies.tsv` | pkg-config `libsodium` (the lobby, built `--without-lobby` here: `premake5.lua:787-798`) |
| pkgconf | 2.5.1 | 2026-10-01 | `build-sources.tsv:11`, "pkgconf for premake" (`776ae6f5`) | 0 A.D.'s premake runs `pkg-config` for every library (`pkgconfig.lua`) |
| SpiderMonkey | 128.13.0 | 2026-09-23 | 0 A.D. R28's `libraries/source/spidermonkey/mozjs-128.13.0.tar.xz` (`build.sh:9`, "This should match the version in config/milestone.txt") | `--with-system-mozjs` asks pkg-config for `mozjs-128` (`extern_libs5.lua:642-658`) |

So no version in `zero-ad-deps` is a 0 A.D. pin; SpiderMonkey's is. The ICU data file was never 0 A.D.'s content: `package-headless.py:48-50` reads it from the Emscripten port cache, and its digest `d8e42c5c…` equals the one in the pinned `icu4c-68_2-src.tgz` (`source/data/in/icudt68l.dat`) and the staged `dist/static/zero-ad/data/icu/icudt68l.dat` (28,566,176 bytes), which `Dollyfile-zero-ad:39` pins.

### 1.4 Why the builds sit where they sit, as the record states it

- One archive, one image: `776ae6f5` made `deps.tar.gz` (30,970,530 bytes today) out of all eleven source trees plus the licences, the probes and `enet-dolly.c` (`demos/zero-ad/prepare-sources.sh:18-49`). A change to any one library re-pins `zero-ad-deps` whole.
- SpiderMonkey `FROM zero-ad-deps`: for `pkg-config`, `zlib.pc` and the compiler (`:328-331`). The build log confirms both are used: `checking for pkg_config... /usr/bin/pkg-config`, `checking whether pkg-config is pkgconf... yes` (`build/image-logs/zero-ad-spidermonkey.log:70-72`), `checking for zlib >= 1.2.3... yes` (`:232`); mozjs turns `--with-system-zlib` on by default for a standalone JS build (`moz.configure:909-941`).
- Python, Cargo, cbindgen by `INSTALL` and the engine by `COPY`: the 700 MB and "rebuild SpiderMonkey alone" reasons (`:333-336`). The `COPY` keeps those tools and their modules out of `zero-ad-engine` (copy investigation §5.F.1).
- FreeType and libpng by `COPY` in Xonotic and Wine: "as 0 A.D. built them" (recipe comments, `xonotic-build:12`, `wine-build:13`); the views came five days later and the replacement is listed as pending.

## 2. How each is built today

Recipes: `demos/zero-ad/Dollyfile-zero-ad-deps` (197 lines), `-zero-ad-spidermonkey` (95), `-zero-ad-engine` (78). Base chain of `zero-ad-deps`: `FROM openal-build` (`:13`) ← `cmake-build` ← `system-tools` ← `system-build`; so it has `cc`, `c++`, `ar`, `make`, `cmake`, `patch`, `find`, `sh`, zlib's headers and archive (`system-tools:215` installs `zlib` at pin `165f9683…`), libcurl, OpenAL. Staging: `prepare-build-sources.sh` fetches the eleven archives of `build-sources.tsv` and the 0 A.D. release, `prepare-sources.sh:18-49` packs the trees under `/tmp/zad/…` and the licences under `/usr/share/licenses/…`.

### 2.1 The twelve things in `zero-ad-deps`

| Thing | Source in the archive | Build (`build.slop`, `:73-116`) | Produces | Exports (`:167-195`) | What is not upstream's |
| --- | --- | --- | --- | --- | --- |
| pkgconf 2.5.1 | `libpkgconf/`, `cli/` | one `cc` line, `-DPKGCONFIG_IS_STATIC`, with a 17-line `config.h` the recipe writes ("Upstream builds pkgconf with Meson; these are the values its configure step finds here", `:39-57`); `ln -s pkgconf pkg-config` (`:76-77`) | `/usr/bin/pkgconf`, `pkg-config` | `TOOL pkgconf`, `TOOL pkg-config`, `FOLDER zero-ad-pkgconfig /usr/lib/pkgconfig` | the `config.h` values; `PKG_DEFAULT_PATH` `/usr/lib/pkgconfig:/usr/share/pkgconfig` |
| libpng 1.6.58 | `png/` | `cmake_build png -DPNG_SHARED=OFF -DPNG_TESTS=OFF -DPNG_TOOLS=OFF -DPNG_EXECUTABLES=OFF` (`:87`); `cmake_build` passes `-DCMAKE_SYSTEM_NAME=Dolly -DCMAKE_SYSTEM_PROCESSOR=wasm64 -DCMAKE_INSTALL_PREFIX=/usr -DCMAKE_INSTALL_LIBDIR=lib -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DCMAKE_POLICY_VERSION_MINIMUM=3.5` and `-j4` (`:78-86`) | `libpng16.a`, `png.h`, `pngconf.h`, `pnglibconf.h`, `include/libpng16/`, `libpng16.pc`, `libpng.pc` (CMake's) | `HEADER png`, `pngconf`, `pnglibconf`, `libpng16`; `LIB png16` | nothing |
| FreeType 2.14.3 | `freetype/` | `cmake_build freetype -DFT_DISABLE_BZIP2=ON -DFT_DISABLE_HARFBUZZ=ON -DFT_DISABLE_BROTLI=ON -DFT_REQUIRE_ZLIB=ON -DFT_REQUIRE_PNG=ON` (`:88`) | `libfreetype.a`, `include/freetype2/`, `freetype2.pc` | `HEADER freetype2`, `LIB freetype` | nothing |
| Ogg 1.3.5 | `ogg/` | `cmake_build ogg -DINSTALL_DOCS=OFF -DBUILD_TESTING=OFF` | `libogg.a`, `include/ogg/`, `ogg.pc` | `HEADER ogg`, `LIB ogg` | nothing |
| Vorbis 1.3.7 | `vorbis/` | `cmake_build vorbis` | `libvorbis.a`, `libvorbisfile.a`, `libvorbisenc.a` (built, not exported), `include/vorbis/`, `vorbis*.pc` | `HEADER vorbis`, `LIB vorbis`, `LIB vorbisfile` | nothing |
| fmt 7.1.3 | `fmt/` | `cmake_build fmt -DFMT_TEST=OFF -DFMT_DOC=OFF` | `libfmt.a`, `include/fmt/`, `fmt.pc` | `HEADER fmt`, `LIB fmt` | nothing |
| libxml2 2.13.5 | `xml2/` | `cmake_build xml2 -DLIBXML2_WITH_PYTHON=OFF -DLIBXML2_WITH_TESTS=OFF -DLIBXML2_WITH_PROGRAMS=OFF -DLIBXML2_WITH_THREADS=OFF -DLIBXML2_WITH_LZMA=OFF -DLIBXML2_WITH_HTTP=OFF -DLIBXML2_WITH_ICONV=OFF -DLIBXML2_WITH_ZLIB=ON` | `libxml2.a`, `include/libxml2/`, `libxml-2.0.pc` | `HEADER libxml2`, `LIB xml2` | the feature set (no threads, iconv, lzma, http) |
| ICU 68.2 | `icu/common`, `icu/i18n`, `icu/stubdata` | one `sed` on `i18n/double-conversion-utils.h` adding `__wasm64__` to the architecture list (`:97-98`); `objects.mk` (`:61-71`, compiles every `.c`/`.cpp` of the given directories into one `ar rcs`) three times with `-O2 -std=c++11 -DU_USING_ICU_NAMESPACE=0 -DU_NO_DEFAULT_INCLUDE_UTF_HEADERS=1 -DUNISTR_FROM_CHAR_EXPLICIT=explicit -DUNISTR_FROM_STRING_EXPLICIT=explicit -DU_STATIC_IMPLEMENTATION -DU_CHARSET_IS_UTF8=1` and `-DU_COMMON_IMPLEMENTATION=1` / `-DU_I18N_IMPLEMENTATION=1` (`:99-102`); headers copied by `cp` (`:103-104`) | `libicuuc.a`, `libicui18n.a`, `libicudata.a` (the **stub**: no data inside), `include/unicode/`; `icu-uc.pc` and `icu-i18n.pc` written by the recipe (`:137-148`, `Cflags: -DU_STATIC_IMPLEMENTATION` only) | `HEADER unicode`; `LIB icuuc`, `icui18n`, `icudata` | the one-line sed; the flag set (the comment: "ICU knows no Dolly platform: its charset default is the one hook it offers, and its bundled double-conversion lists architectures (wasm32 but not wasm64)", `:95-96`); the data file is elsewhere (§2.4) |
| libsodium 1.0.20 | `sodium/src/libsodium`, `builds/msvc/version.h` | `version.h` copied from the MSVC build dir (`:106`); every directory under `src/libsodium` compiled by `objects.mk` with 29 `-DHAVE_…` configure results spelled in the recipe, `-DCONFIGURED=1 -D_GNU_SOURCE=1 -DNATIVE_LITTLE_ENDIAN=1 … -DHAVE_LINUX_COMPATIBLE_GETRANDOM -fvisibility=hidden -fno-strict-aliasing -fwrapv` (`:107-109`) | `libsodium.a`, `include/sodium/`, `sodium.h`; `libsodium.pc` by the recipe | `HEADER sodium`, `sodium.h`; `LIB sodium` | the configure results as flags (the 2026-09-23 `sodium.patch` is gone since `f5c1185e`: "libsodium takes its generic paths") |
| ENet 1.3.18 | `enet/` | `cp enet-dolly.c enet/dolly.c; rm enet/unix.c enet/win32.c` (`:112-113`); `objects.mk` on the directory (`:114`) | `libenet.a`, `include/enet/`; `libenet.pc` by the recipe | `HEADER enet`, `LIB enet` | the socket backend (§2.5) |
| Boost 1.83.0 | `boost/boost` | `cp -R` (`:116`) | `include/boost/` | `HEADER boost` | nothing; headers only |
| probes | `enet-check.c`, `openal-check.cpp` (the demo's test fixtures) | `cc … -lenet`, `c++ … -lopenal` (`:163-164`) | `/usr/libexec/zero-ad/enet-check`, `openal-check`, retained | `FOLDER` (`:165`) | the demo's; `test/0ad-enet-browser.mjs:9` and `0ad-openal-browser.mjs:7` read them out of the `zero-ad-deps` snapshot |

SDL2 is not built here: three `COPY` rows take its headers, archive and licence folder out of the `sdl2` package (`:14-15, 36`), and the recipe writes `sdl2.pc` because the package ships none (`demos/sdl2/Dollyfile-sdl2` has no `pkgconfig` row). Likewise `zlib.pc` and `libcurl.pc` (`:127-136`): neither `Dollyfile-zlib` nor `Dollyfile-curl` writes one. The seven `.pc` files are checked at once: `pkg-config --exists zlib libcurl icu-i18n libsodium libenet libpng freetype2 vorbisfile fmt libxml-2.0 openal sdl2` (`:159`).

Declares: `TOOLCHAIN`, hosts `runtime`, `audio`, `display`, `input`, `download`, `http`, `upload` (`:3-9`; `audio@0` because the OpenAL probe is retained, `http@0` because the ENet probe is; the self-host task `:253-255`), an `ENTRY` (`:197`). Snapshot: 418,174,627 bytes, 24,087 retained paths; the build script's `time`: `real 283.939` s (`build/image-logs/zero-ad-deps.log:1749-1760`, 2026-10-13). Scratch timings from 2026-10-01: "libpng 18 s; Ogg, Vorbis, fmt, libxml2 70 s together; ICU, libsodium and ENet about 120 s at `-j4`" (self-host `:208-211`). Per-library output sizes recorded: pkgconf 146 KB, libpng 262 KB, FreeType 903 KB plus 878 KB of headers, "ICU, libsodium, ENet, Boost's headers (150 MB)" (packages task `:105-108`); the view snapshots are 292,641 (`pkgconf`, 22 paths), 767,947 (`libpng`, 31 paths, with zlib) and 1,938,923 bytes (`freetype`, 83 paths, with libpng and zlib) (`dist/`, `build/image-logs/{pkgconf,libpng,freetype}.log`). The individual sizes of ICU's three archives, libxml2, fmt, Ogg, Vorbis, libsodium and ENet are not in the tree (the snapshot manifest lists paths without sizes).

### 2.2 SpiderMonkey in `zero-ad-spidermonkey`

- **Source and pin.** `prepare-sources.sh:63-79`: 0 A.D.'s bundled `libraries/source/spidermonkey/mozjs-128.13.0.tar.xz` is extracted afresh without `js/src/tests/test262`, `non262`, `js/src/jit-test` and `testing/web-platform` ("490 MB" of tests), packed with 0 A.D.'s `patches/` directory and `demos/zero-ad/toolchain/spidermonkey.patch` into `dist/static/zero-ad-build/mozjs.tar.gz` (161,549,758 bytes), which the recipe pins: `SOURCE … a0e7bd45…` (`:40`). The upstream chain of pins is `DOLLY_0AD_SOURCE_SHA256` (`config/source-pins.sh:57-59`, the 0 A.D. release) → the bundled tarball (150,635,036 bytes, SHA-256 `6422e51b9e76586c3054127bf13f992ec2338bd2d6156dc430accfb0b5301f1d`, computed here, recorded nowhere). `source-pins.sh` has no SpiderMonkey row; `config/upstreams.json:91` maps SpiderMonkey to `mozjs.tar.gz` with repository `mozilla-firefox/firefox`. 0 A.D.'s `build.sh` says where its tarball comes from: `fetch` gets `https://releases.wildfiregames.com/libs/mozjs-128.13.0.tar.xz` (`:30-33`), `build_archive` makes it from `https://archive.mozilla.org/pub/firefox/releases/128.13.0esr/source/firefox-128.13.0esr.source.tar.xz` by `js/src/make-source-package.py` (`:15-27`); `LIB_VERSION="${PV}+wfg4"` (`:12`). Two stale staging files remain in `dist/static/zero-ad-build/` (`mozjs-host.tar.gz` 114 MB, `bootstrap.tar` 150 MB); no recipe names them (`git grep`), and the self-host task lists them as "no longer described" (`:444-445, 486`).
- **Patches.** `SLOP CWD /tmp/mozjs/mozjs-128.13.0 sh ../patches/patch.sh` (`:42`) runs 0 A.D.'s script, then `patch -p1 … spidermonkey.patch` (`:43`). `patch.sh` applies unconditionally: `FixRustLinkage` (16 lines: `DIRS += ["rust"]` outside the shell condition; bug 1588340), `FixLibNames` (16: `JS_LIBRARY_NAME` becomes `mozjs128-release`/`-debug`), `FixPkgConfigDebug` (26: `-DDEBUG` into `js.pc`), `FixExtraGCTracing` (38: `removeBlackRootsTracer` passes `data`; bug 1982134, "creates segfaults during GCs"), `SuppressDanglingPointerWarning` (46: a `#pragma GCC diagnostic` block in `RootingAPI.h`), `FixPython3_14` (45: `ast.Str`→`ast.Constant`, `arg.s`→`arg.value`); and conditionally `FixFpNormIssue` (i686) and `FixMacOSBuild` (Darwin). Dolly's CPython is 3.14.7 (`source-pins.sh:30`). Dolly's `spidermonkey.patch` (490 lines, 21 hunks, 18 files): wasm64 in `init.configure`, `constants.py` and `double-conversion/utils.h`; `rust.configure` vendor disambiguation and a `RUST_TARGET` override for target and host; `USE_LIBS += ["jsrust", "mozglue"]` for the static library; `gc/Memory.cpp` keeping the scattershot allocator off under `__wasi__` and `numAddressBits = sizeof(uintptr_t) * 8`; `RandomNum.cpp` taking `getrandom` under `__EMSCRIPTEN__` and then `__dolly__`; `allow_missing` for `llvm-objdump`, `readelf`, `objcopy`, `strip`, `m4`; `cargo-linker` with `subprocess.call` and `#!/usr/bin/python3`; `-mthread-model single` dropped from the shipped `old-configure`; lazy `ssl`, `blessed` and gyp pool imports; `mozinfo` naming Dolly; the vendored `jobserver` crate's in-process backend on wasm64; `-fstandalone-debug` only with debug symbols. The first 171 lines (`7256b761`, 2026-09-23) are the host cross-build's hunks (`init.configure`, `rust.configure`, `moz.build`, `Memory.cpp`, `RandomNum.cpp` with `__EMSCRIPTEN__`, `constants.py`); the rest came with `9fa4b4d3` and `cf8d0d9f`. The self-host task lists the twelve in-Dolly edits with "Upstream?" for each (`:70-110`): plausibly upstreamable for eight, "Dolly-specific" for the shebang, `-mthread-model`, `__dolly__`.
- **Needs beyond the base** (`:18-37`): `INSTALL python` (which installs `cc` and `ninja`: `demos/python/Dollyfile-python:407-408`; hosts `dso`, `http`, `sockets`), `INSTALL cargo` (a `COPY` package that installs `rust`, which installs `cc`; hosts `dso`, `http`, `threads`), `INSTALL cbindgen` (hosts `http`, `threads`); from the base `pkg-config`, `zlib.h`/`libz.a`, `patch`, `sh`, `make`, `gzip`, `tar`. The recipe therefore declares `dso@0`, `sockets@0`, `threads@0` beside the opened-toolchain set (`:3-12`), because `INSTALL` checks that the installing recipe declares each package's modules (`docs/dollyfile.md:150-152`).
- **Configure** (`:60-63`): `python ../configure.py --enable-project=js --host=wasm64-unknown-wasi --target=wasm64-unknown-wasi --disable-jit --disable-shared-js --without-intl-api --disable-tests --disable-js-shell --disable-jemalloc --disable-debug --enable-optimize=-O2 --disable-debug-symbols --disable-bootstrap --disable-warnings-as-errors --with-libclang-path=/usr/lib`, with `CC='cc -D__wasi__'`, `RUST_TARGET=wasm64-emscripten-probe`, `CBINDGEN=/usr/bin/cbindgen`, `MOZCONFIG=/dev/null` (`:54-57`). Against 0 A.D.'s `mozconfig`: `--enable-project=js`, `--enable-shared-js`, `--disable-jemalloc`, `--without-intl-api`, `--disable-js-shell`, `--disable-tests`, and `build.sh:166-171` adds `--enable-optimize` for the release build (and a second `--enable-debug` build Dolly does not make). So 0 A.D.'s are `--without-intl-api --disable-js-shell --disable-tests --disable-jemalloc`; `--disable-shared-js` is Dolly's and contradicts 0 A.D.'s `--enable-shared-js` (0 A.D. links `libmozjs128-release.so` on Linux, `build.sh:236-240`; the engine in Dolly links `-ljs_static -ljsrust`); the rest are the port's. The recipe's comment explains `-D__wasi__` and the triple ("mozbuild knows no Dolly OS", `:45-51`).
- **Make** (`:67-69`): `make -j4` with `MOZ_CARGO_WRAP_LD=/opt/rust-sdk/bin/dolly-rust-link` and three more wrap variables, "which translates the Emscripten target's linker vocabulary to cc"; `dolly-rust-link` is built by `demos/rust/Dollyfile-rust-sdk:31` and the `rust` package exports `FOLDER rust-sdk /opt/rust-sdk` (`Dollyfile-rust:17`). The recursive sub-makes run serially ("jobserver unavailable: using -j1", self-host `:152-160`).
- **Produces** (`:70-89`): `/opt/mozjs/include` (328 symlinks of `dist/include` dereferenced by Python's `shutil.copytree`, "Dolly's cp has no -L"), `/opt/mozjs/lib/libjs_static.a` (21,428,434 bytes) and `libjsrust.a` (5,173,076 bytes) (`zero-ad-spidermonkey.log:3820-3821`), `/usr/share/licenses/spidermonkey/{LICENSE,MPL-2.0,crates/*}`. Retained by `FOLDER /opt/mozjs` and `FOLDER /usr/share/licenses/spidermonkey` (`:91-92`); no `EXPORTS`, no `.pc`. Build: `real 865.060` s (`:3822`), snapshot 873,914,313 bytes; the self-host task measured 879 s and peaks of 7.3 GB to the 9 GB cap (`:408-415`).
- **What is 0 A.D.-specific.** The source archive's provenance and three of its patches; the four configure flags above; the engine's expectation of exactly this feature set: "`js-config.h`/`js-confdefs.h` carry the same feature set and the engine's `-D` set is unchanged" (self-host `:130-133`). Everything else in the recipe is Dolly's.

### 2.3 What `zero-ad-engine` does with them

`FROM zero-ad-deps` (`:14`); premake 5.0.0-beta7 from 0 A.D.'s `libraries/source/premake-core` with a 41-line patch (the `emscripten`/`wasm64` platform names) (`:32-44`); two `COPY` rows from `zero-ad-spidermonkey` (`:48-49`); `FILE /tmp/pkgconfig/mozjs-128.pc` with `Cflags: -I/opt/mozjs/include`, `Libs: -L/opt/mozjs/lib -ljs_static -ljsrust` (`:50-55`); the probe `spidermonkey-check` compiled against `/opt/mozjs` with `-lz` and run (`:58-61`; the test `0ad-spidermonkey-browser.mjs:8` reads it from this image); `premake5 --os=emscripten --with-system-mozjs --without-lobby …` with `PKG_CONFIG_PATH=/tmp/pkgconfig` (`:64-67`), so 0 A.D.'s `extern_libs5.lua:642-658` asks `pkg-config` for `mozjs-128`; `make config=release -j4 pyrogenesis` with `SOURCE_DATE_EPOCH` (`:69-70`, `real 310.070`, `zero-ad-engine.log:683`). Hosts: `runtime`, `audio`, `display`, `input`, `download`, `gpu`, `http`, `upload` and not `dso`, `threads` or `sockets` (`:3-10`); since sealing scans every retained executable for stamped modules (`docs/dollyfile.md:220-224`) and both probes and `pyrogenesis` are retained, the SpiderMonkey archives stamp none of the three. Snapshot 479,186,491 bytes. `engine.patch` (2,809 lines, 48 files) is the engine port (`arch.h`, `os/dolly/`, the WebGPU backend, `TaskManager.cpp`, the network session timeouts, premake's `pkgconfig.lua` closing its pipes); nothing in it is a library's source.

### 2.4 ICU's data

`libicudata.a` is built from `icu/stubdata` (`:101`), so the archives carry no locale data. The data file is `icudt68l.dat` from the ICU 68.2 source archive's `source/data/in/`, 28,566,176 bytes, digest `d8e42c5c…` identical in the Emscripten port cache, the `build-sources.tsv` extraction and `dist/static/zero-ad/data/icu/` (checked here). It reaches the game as a `SOURCE` row of `Dollyfile-zero-ad:39` under `/opt/0ad/data/icu/`, staged by `package-headless.py:48-50` from `.cache/emscripten/ports/icu/icu` (a path of the host SDK cache, not of `build-sources.tsv`), and found at run time by ICU's own `ICU_DATA` variable, which `/usr/bin/zero-ad` exports (`Dollyfile-zero-ad:156`). 0 A.D.'s source does not name a data directory (`grep u_setDataDirectory|ICU_DATA` over `source/`: none). SpiderMonkey's tree carries its own ICU 73 and data (`config/external/icu/data/icudt73l.dat`), excluded by `--without-intl-api`.

### 2.5 ENet's transport

`enet-dolly.c` replaces `unix.c` and `win32.c` (the recipe's comment: "ENet keeps its protocol; dolly.c replaces the unix.c and win32.c socket backends", `:111`). Its header: "Private ENet platform transport, above Dolly's existing HTTP/process ABI … The relay assigns hosts and owns routing policy" (`:9-12`). It POSTs each operation to `$DOLLY_ENET_RELAY` through `dolly_http_perform` (`:31-44`), eight datagram sockets of 4096 bytes, leases, a 10 ms poll interval; `connect`, `listen`, `accept`, `select` return `ENOTSUP`. Nothing in the file names 0 A.D.; the port the probe uses, 20595, is 0 A.D.'s default (`test/fixtures/0ad-enet.c:11`). The relay (`toolchain/relay.mjs`) "routes bounded datagrams only between 2–8 pre-created participant URLs and never contacts other hosts" (README `:54-56`) and is the demo's development tool. `engine.patch` adjusts the engine's use of ENet (`HOST_SERVICE_TIMEOUT = 0` under `__dolly__`, `NetServer.cpp`), not ENet.

### 2.6 pkgconf and the `.pc` files

pkgconf's build is one `cc` line and a `config.h` (`:40-57, 76`); its outputs are two names on `PATH`. It exists for 0 A.D.'s premake (`776ae6f5`) and for `amy` sessions ("pkg-config is what a build in a session asks for a library", `837014d0`; `test/amy-browser.mjs:208-215` compiles against `libpng` and `freetype2` with the flags `pkg-config` gives). The three `.pc` files for things `zero-ad-deps` did not build: `sdl2.pc` (Version 2.32.10), `zlib.pc` (1.3.2), `libcurl.pc` (8.21.0) (`:121-136`); the `libpng` view ships `zlib.pc` along ("libpng's names it", `Dollyfile-libpng:6-7, 18`). The four for libraries built without their build system: `icu-uc`, `icu-i18n`, `libsodium`, `libenet` (`:137-158`).

## 3. Who uses each today

Counted by `git grep` over `Dollyfile*` and `demos/*/Dollyfile*` (130 recipes).

| Thing | `FROM` | `COPY` | `INSTALL` | `REQUIRES LIB/HEADER` naming it | Other copies in the catalog |
| --- | --- | --- | --- | --- | --- |
| `zero-ad-deps` as a whole | `zero-ad-spidermonkey`, `zero-ad-engine`, `pkgconf`, `libpng`, `freetype` | `wine-build` 8, `xonotic-build` 5, `xonotic` 2 | (a toolchain: none) | | |
| pkgconf | via the chain | | nobody installs `pkgconf`; `REQUIRES TOOL pkg-config` only in `zero-ad-spidermonkey:30` and `zero-ad-engine:19` | | none |
| libpng | | `wine-build` (archive + 3 headers + licence), `xonotic-build` (archive + licence), `xonotic` (licence) | `freetype:8` installs `libpng` | none (`COPY` cannot satisfy a `REQUIRES`) | none |
| FreeType | | `wine-build`, `xonotic-build` (headers, archive, licence), `xonotic` (licence) | nobody | none | none |
| Ogg, Vorbis, libxml2, libsodium, Boost | | | | 0 A.D. only | none; the three LLVM recipes set `LLVM_ENABLE_LIBXML2=OFF` |
| ICU | | | | 0 A.D. only | SpiderMonkey's bundled ICU 73, excluded; the Claude Code task notes Edge.js would need ICU (`:116-121`), not pursued |
| fmt 7.1.3 | | | | 0 A.D. only | fmt 11.1.1 inside OpenAL Soft 1.24.3 (`add_subdirectory(fmt-11.1.1 EXCLUDE_FROM_ALL)`, linked `PRIVATE` into `libopenal.a`; its licence staged as `OpenAL/fmt`); fmt 11.2.0 in `mojo-build` (`include` and `src/format.cc` only, `demos/mojo/prepare-sources.sh:59`, pinned `source-pins.sh:311-313`) |
| ENet | | | | 0 A.D. only (the `enet-check` probe in `zero-ad-deps`) | none |
| SpiderMonkey | | `zero-ad-engine` 2 rows | | the engine via pkg-config | every other JavaScript user links QuickJS: `bhop`, `classicube`, `rts-arena`, `slopyard`, `pi-build` (`-lquickjs`), and `pi`, `pi-runtime`, `closed-source-agent` install `janis`. `tasks/20261005-133044-claude-code/TASK.md:122-127`: "Dolly already builds SpiderMonkey 128 for wasm64 (0 A.D., `--disable-jit` …); it has ESM hooks, but replacing QuickJS means rewriting `quickjs-main.c` against the C++ embedding API … (weeks). Its speed against QuickJS-ng here is not measured. Decision: extend Janis … Revisit the engine only for an engine-level failure." |
| `zlib.pc`, `libcurl.pc`, `sdl2.pc` | | | | read by `pkg-config --exists` (`:159`), by mozjs's configure (`zlib`), by premake (all three) | `zlib` (`Dollyfile-zlib`), `curl`, `sdl2` ship none of their own |

Checks of other bundling the task asked for: CPython builds its own libffi (`demos/python/Dollyfile-python:29-98`, `EXPORTS LIB ffi`); nothing else in the recipes names expat or mpdecimal, so whatever CPython does with them is inside its own build (not visible in a recipe); `neovim-build` and `wine-build` build neither libxml2 nor ICU (`wine-build` names `expat` only through the inventory's description of GIMP; the recipe text has no libxml2/ICU row); IJG libjpeg is built in both `xonotic-build:49` and `wine-build:54` from the same pin (the `builds-twice` task's subject).

## 4. The inventory's claims in this group, checked

| Claim (inventory.md) | Verdict | What was looked at |
| --- | --- | --- |
| "`zero-ad-deps` compiles pkgconf, libpng, FreeType, Ogg, Vorbis, libxml2, ICU 68.2, libsodium, Boost's headers, fmt 7.1.3 and ENet" | True (Boost is copied, not compiled; two probes are compiled too) | `Dollyfile-zero-ad-deps:73-116, 162-164` |
| "writes the `.pc` files of `zlib`, `curl` and `sdl2`" | True, and partial: it writes seven; the other four are for ICU, libsodium and ENet, which it built without their build systems | `:121-158` |
| "ENet's sockets are replaced by `enet-dolly.c` (0 A.D.'s relay)" | True that the backend is replaced; "0 A.D.'s relay" is half right: the backend is generic (any `$DOLLY_ENET_RELAY`), the relay server is the demo's | `enet-dolly.c:9-12, 31`; `toolchain/relay.mjs`; README `:54-56` |
| "ICU needs the data file 0 A.D.'s content supplies" | Partly: the file is ICU's own `icudt68l.dat`, byte-identical to the pinned archive's; it is delivered by 0 A.D.'s content staging (from the Emscripten port cache) and the game's launcher sets `ICU_DATA`; `libicudata.a` is the stub | §2.4 |
| "fmt exists in three versions across the tree" | True: 7.1.3, 11.1.1 (inside OpenAL), 11.2.0 (Mojo, one file) | §3 |
| "FreeType and libpng are taken out of it by `COPY` in `xonotic-build`, `wine-build` and `xonotic`" | True: 5, 8 and 2 rows (`xonotic`'s are the licence folders only) | `xonotic-build:13-17`, `wine-build:14-21`, `xonotic:17-18` |
| "SpiderMonkey 128.13.0 is built in `zero-ad-spidermonkey` with mozbuild, Python, Cargo and cbindgen; `zero-ad-engine` copies two rows" | True | `:18-20, 60-69`; `zero-ad-engine:48-49` |
| "Its source is taken out of 0 A.D.'s release and has no pin of its own" | Partly: no row in `source-pins.sh`; the staged tree is pinned by the recipe (`a0e7bd45…`) and the upstream bytes transitively by 0 A.D.'s release pin; the bundled tarball's own digest (`6422e51b…`) is recorded nowhere | §2.2 |
| "any build needs three of 0 A.D.'s six patches" | Partly: two are needed to build (`FixRustLinkage`, `FixPython3_14`), one is a GC correctness fix (`FixExtraGCTracing`, "segfaults during GCs"); whether a build without it misbehaves here was not tested; `FixLibNames`, `FixPkgConfigDebug` affect only names and `js.pc` that Dolly does not use; `SuppressDanglingPointerWarning` is a pragma block | `patches/*.diff`, `patch.sh` |
| "Dolly's 490-line patch is all the port's" | True in that no hunk is 0 A.D.'s (the two touch `frontend/reader.py` at different places); 171 lines are the host cross-build's of 2026-09-23, carried over | `git log --follow`, the patch |
| "The README's 'no JIT, serial tasks' does not describe it: no JIT is a configure flag" | True: `--disable-jit` is `:61`; "serial tasks" is `engine.patch`'s `TaskManager.cpp` | README `:47-48` |
| "`--without-intl-api`, `--disable-js-shell` and `--disable-jemalloc` are 0 A.D.'s mozconfig; `--disable-shared-js` is Dolly's" | True; `--disable-tests` is also 0 A.D.'s; 0 A.D. has `--enable-shared-js` | `mozconfig` |
| "nothing else would install it today" | True by the recipes; the one recorded consideration (Claude Code's engine) decided against | §3 |
| "writes a recipe out and lists five things in the way" | True (`inventory.md:94-118`); of the five: (1) holds (§5.a); (2) holds: `pkgconf` is `FROM zero-ad-deps` and `zlib.pc` is written there; (3) holds; (4) holds: `:67` names `/opt/rust-sdk/bin/dolly-rust-link` and `RUST_TARGET=wasm64-emscripten-probe`; (5) is a choice, not an obstacle: a package may keep `/opt/mozjs` | the recipe |
| "Host modules: `runtime@0` alone. Inferred" | Confirmed from the seal rule: `zero-ad-engine` retains the probe and declares no `dso`, `threads`, `sockets` | §2.3 |

## 5. What a package holding its own build would look like, on real cases

Language facts used: a package keeps only what it declares plus `COPY` results, and its `INSTALL` rows are recorded and installed first by whoever installs it (`docs/dollyfile.md:133-136, 143-153, 200-202`); a toolchain or application keeps the files of what it installs (`src/dollyfile.c:1401`); a package declares the modules every program built with it needs (`:216-219`); an image carries one pin per recipe, so an `INSTALL` of `zlib` at another pin than the base's fails (`:152-153`). `REQUIRES HOST` is never inherited.

### 5.a SpiderMonkey

**The base.** No existing toolchain holds `cc`/`c++`/`make`/`ar` (`cc` package), `patch` (`git` package, `Dollyfile-git:11`), `sh` and `find` (`posix`), `gzip`, `tar`, `pkg-config`, a `zlib.pc`, Python, Cargo with Rust, and cbindgen together: `system-tools` and `cmake-build` lack the last four; `rust-build` is `FROM rust-sdk` ← `system-build` with `INSTALL posix` and has no `patch` or `pkg-config`; `zero-ad-deps` has the first group and gets the last three by `INSTALL`. Since a package cannot say "for the build only" ([build-needs](../20261013-144754-build-needs/TASK.md)), the tools go into a base:

```text
DOLLY 7
TOOLCHAIN spidermonkey-build
REQUIRES HOST runtime@0 display@0 input@0 download@0 http@0 upload@0   # as every opened toolchain
REQUIRES HOST dso@0 sockets@0 threads@0                                 # python, cargo, cbindgen declare them
FROM    /vX/Dollyfile-system-tools <sha>            # cc, c++, make, ar, patch, sh, gzip, tar, zlib
INSTALL /vX/demos/zero-ad/Dollyfile-pkgconf <sha>   # today a view FROM zero-ad-deps (inventory's obstacle 2)
INSTALL /vX/demos/python/Dollyfile-python <sha>     # brings cc, ninja
INSTALL /vX/demos/rust/Dollyfile-cargo <sha>        # brings rust, cc
INSTALL /vX/demos/rust/Dollyfile-cbindgen <sha>
FILE /usr/lib/pkgconfig/zlib.pc                      # the 4 lines zero-ad-deps writes today (:127-131)
    Name: zlib
    …
ENTRY /bin/foreground -i /bin/slop
```

This is `tools-build`'s pattern ("A package is built FROM it and keeps none of it, so the formatter serves the build and is no row of the package", `demos/tools/Dollyfile-tools-build:10-16`). With `pkgconf` as it is today, `spidermonkey-build`'s cache identity includes `zero-ad-deps`'s snapshot, and every change to the 0 A.D. libraries rebuilds SpiderMonkey, as now; with `pkgconf` holding its one `cc` line (`builds-views`' subject) it does not.

**The package.**

```text
DOLLY 7
PACKAGE spidermonkey
REQUIRES HOST runtime@0                              # the archives stamp nothing (§2.3)
FROM    /vX/demos/spidermonkey/Dollyfile-spidermonkey-build <sha>
INSTALL /vX/Dollyfile-zlib <sha>                     # a consumer links -lz (the probe does, zero-ad-engine:60)
REQUIRES TOOL python cargo rustc cbindgen pkg-config patch make …
SOURCE  /vX/dist/static/spidermonkey/mozjs.tar.gz <sha> /tmp/mozjs.tar.gz
SLOP gzip -dc /tmp/mozjs.tar.gz | tar -xf - -C /
SLOP CWD /tmp/mozjs/mozjs-128.13.0 sh ../patches/patch.sh      # 0 A.D.'s six, or the three Dolly needs, carried in the archive
SLOP patch -p1 -d /tmp/mozjs/mozjs-128.13.0 -i /tmp/mozjs/spidermonkey.patch
FILE /tmp/mozjs/build.slop                           # today's :52-89 with /opt/mozjs → /usr/include/mozjs-128, /usr/lib
SLOP time slop -e /tmp/mozjs/build.slop
FILE /usr/lib/pkgconfig/mozjs-128.pc                 # today zero-ad-engine:50-55, with -I/usr/include/mozjs-128
SLOP c++ -std=c++20 -O1 $(pkg-config --cflags mozjs-128) /tmp/mozjs/check.cpp $(pkg-config --libs mozjs-128) -lz -o /tmp/check && /tmp/check
EXPORTS LIB    js_static /usr/lib/libjs_static.a
EXPORTS LIB    jsrust    /usr/lib/libjsrust.a
EXPORTS HEADER mozjs-128 /usr/include/mozjs-128
FOLDER /usr/share/licenses/spidermonkey
```

- **Source and pin, three ways seen in the tree.** (i) As today: the pruned tree out of 0 A.D.'s release, pinned by the staged archive; the package's source then depends on 0 A.D.'s release pin and `prepare-build-sources.sh`. (ii) A `DOLLY_MOZJS_*` row in `source-pins.sh` naming `https://releases.wildfiregames.com/libs/mozjs-128.13.0.tar.xz`, the URL 0 A.D.'s `build.sh:31-32` fetches, with the digest `6422e51b…` if the published file equals the bundled one (not checked: no network here). (iii) Mozilla's `firefox-128.13.0esr.source.tar.xz` plus a host run of `make-source-package.py` (`build.sh:17-27`), which `docs/sources.md` allows ("Host preparation may configure and patch pinned trees deterministically and reviewably"); whether its output is byte-identical to Wildfire's is not knowable here, and the `build.sh:64` comment about its origin names 115.16.1esr, a stale line. In every way the three needed 0 A.D. patches travel with the staging (today the whole `patches/` directory does).
- **What `zero-ad-engine` would say.** `INSTALL spidermonkey` in place of `:48-49`; `:50-55` (the `.pc`) and `PKG_CONFIG_PATH=/tmp/pkgconfig` at `:64` go; the probe rows `:58-62` go with the package (the test `0ad-spidermonkey-browser.mjs:8` then reads the probe from the package's snapshot or the engine keeps its own compile); `REQUIRES LIB js_static` becomes possible; `--with-system-mozjs` finds `/usr/lib/pkgconfig/mozjs-128.pc` through the default path. `zero-ad` keeps its licence `COPY` from `zero-ad-engine` (a toolchain keeps installed files) or takes `/usr/share/licenses/spidermonkey` from the package. Host lines of `zero-ad-engine` do not change (the package declares `runtime@0` only); `zlib` is installed there already at the base's pin.
- **What a session would get from `amy install spidermonkey`.** The two archives (26.6 MB), the headers, the `.pc`, the licences and `zlib`; not Python, Rust, Cargo or cbindgen, because they are the base's, not rows. Had they been rows, the installing image would hold `python` (47,197,100 bytes), `rust` (336,842,410), `cargo` (36,914,499), `cbindgen` (5,026,004) and would have to declare `dso@0`, `sockets@0`, `threads@0`; `zero-ad-engine`, a toolchain, would keep all of it.
- **Simpler in the recipes that use it:** two `COPY` rows and the `.pc` body leave `zero-ad-engine`; the pin of `zero-ad-spidermonkey` is written once (`INSTALL`) instead of twice; the inventory's `REQUIRES` becomes possible. **More complicated or lost:** one more toolchain image with an `ENTRY` and a boot route (`spidermonkey-build`); the `rust` package's layout (`/opt/rust-sdk/bin/dolly-rust-link`, `wasm64-emscripten-probe`) remains the package's interface; a flag set chosen once for everyone: a general package could build the shell (`js`) or Intl, but the engine compiles against `js-config.h` as configured (self-host `:130-133`), so a SpiderMonkey with other flags is a different library for 0 A.D.; two users wanting different flags would be two packages or 0 A.D.'s flags for all; `pkgconf` and `zlib.pc` must come from somewhere other than `zero-ad-deps` first, or the chain is as entangled as today.
- **Who else could use it then:** by the recipes, nobody today; the Claude Code task's engine question is the one recorded candidate, decided against for now.
- **What would rebuild:** `spidermonkey-build` (restores and installs, seconds), `spidermonkey` (about 15 minutes, 7-9 GB peak), `zero-ad-engine` (about 7 minutes of `make`), `zero-ad` (about 5 minutes); `zero-ad-spidermonkey` goes; `zero-ad-deps` and its views are untouched unless `pkgconf` moves.

### 5.b FreeType and libpng, as their own builds

Today both are CMake projects built unchanged (`:87-88`) and exposed as views (`Dollyfile-libpng`, `Dollyfile-freetype`). As builds of their own, on `cmake-build` (which has CMake, the compiler and `zlib` at pin `165f9683…` from `system-tools`):

```text
DOLLY 7
PACKAGE libpng
REQUIRES HOST runtime@0
FROM    /vX/demos/cmake/Dollyfile-cmake-build <sha>
INSTALL /vX/Dollyfile-zlib <sha>                     # the base's pin; libpng16.pc names zlib
SOURCE  /vX/dist/static/libpng/libpng-1.6.58.tar.gz <sha> /tmp/png.tar.gz   # build-sources.tsv:1 moves to source-pins.sh, or stays staged
SLOP gzip -dc /tmp/png.tar.gz | tar -xf - -C /tmp
SLOP cmake -S /tmp/libpng-1.6.58 -B /tmp/build -DCMAKE_SYSTEM_NAME=Dolly -DCMAKE_SYSTEM_PROCESSOR=wasm64 \
  -DCMAKE_INSTALL_PREFIX=/usr -DCMAKE_INSTALL_LIBDIR=lib -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DPNG_SHARED=OFF -DPNG_TESTS=OFF -DPNG_TOOLS=OFF -DPNG_EXECUTABLES=OFF
SLOP cmake --build /tmp/build -j4 && cmake --install /tmp/build
FILE /usr/lib/pkgconfig/zlib.pc                      # as the view carries it today (Dollyfile-libpng:18), until zlib ships one
    …
EXPORTS LIB png16 /usr/lib/libpng16.a
EXPORTS HEADER png /usr/include/png.h … libpng16 /usr/include/libpng16
FILE /usr/lib/pkgconfig/libpng16.pc
FILE /usr/lib/pkgconfig/libpng.pc
FILE /usr/share/licenses/libpng/LICENSE
```

`freetype` the same with `INSTALL libpng`, the five `FT_*` options of `:88`, `EXPORTS LIB freetype`, `HEADER freetype2`, `FILE freetype2.pc`, `FOLDER /usr/share/licenses/freetype`. The scratch measurement for libpng's build was 18 s (self-host `:209`); FreeType's is not recorded separately.

- **Then `zero-ad-deps`** says `INSTALL freetype` (which brings `libpng` and `zlib`; the zlib pin equals the base's) in place of `:87-88`, drops `EXPORTS` `:170-174, 184-185`, and `prepare-sources.sh:23-25, 33-34` stop staging the two trees and three licence files (`deps.tar.gz` shrinks by their share); `pkg-config --exists libpng freetype2` (`:159`) still passes because the packages carry the `.pc` files; `zero-ad`'s two licence rows still work because `zero-ad-engine` keeps installed files.
- **`xonotic-build`:** `INSTALL libpng`, `INSTALL freetype` for `:13-17` (five rows to two; `REQUIRES LIB freetype` possible); **`wine-build`:** the same for `:14-21` (eight to two; libpng's headers arrive by `EXPORTS HEADER`). Both are `FROM system-tools`, whose zlib pin is the one the packages install. The copy investigation §5.B lists the same and the recorded cost: "Xonotic's is not this tree's to make, Wine's builds Wine, GIMP and NetSurf". **`xonotic`** keeps its two licence rows from `zero-ad-deps` or takes them from `xonotic-build` (one `COPY` source instead of three), or installs the packages into the game image (1.9 MB of library the statically linked client does not use).
- **Simpler:** the `zero-ad-deps` pin disappears from three recipes (15 rows); three recipes build FreeType at one place; the licence folders travel as package files. **More complicated or lost:** two new pins and two staged archives (or two `source-pins.sh` rows); `zlib.pc` has an owner question (`libpng` carries it today "since its own `.pc` names it"); if the packages are rewritten but `zero-ad-deps` keeps building its own copies (the inventory's step 2, "no consumer changes"), FreeType and libpng are built twice at the same pin until step 3.
- **Who else could use them then:** `wine-build` (gdi32's fonts, NetSurf's PNG), `xonotic-build`, sessions (`amy install freetype` exists already as a view).
- **What would rebuild:** the two packages; then `zero-ad-deps` and everything on it (`zero-ad-spidermonkey`, `zero-ad-engine`, `zero-ad`, `pkgconf`) if it installs them; `xonotic-build`, `xonotic`, `wine-build`, `wine` when they switch.

### 5.c ICU (and ENet in brief): where the library ends and the port begins

**ICU.** The library part is generic: ICU 68.2's `common`, `i18n` and `stubdata` compiled by the recipe's `objects.mk`, headers copied, two `.pc` files; a one-line `sed` for wasm64 that SpiderMonkey's patch makes to its own copy of double-conversion too (`spidermonkey.patch:361-368`). The flag set (`U_USING_ICU_NAMESPACE=0`, `U_NO_DEFAULT_INCLUDE_UTF_HEADERS=1`, `UNISTR_FROM_*_EXPLICIT=explicit`, `U_STATIC_IMPLEMENTATION`, `U_CHARSET_IS_UTF8=1`) is in the recipe since `776ae6f5`; its origin is not written down (the 2026-09-23 build used Emscripten's port, whose tools are not in this tree, so whether the set is the port's could not be checked). Only `-DU_STATIC_IMPLEMENTATION` reaches a consumer through `icu-uc.pc`; the other defines change inline header behaviour (`UnicodeString` constructors, the default charset), so a consumer compiling without them sees a slightly different API than the engine does. The data part is ICU's too (§2.4), but the delivery is the demo's: `package-headless.py`, `/opt/0ad/data/icu`, `ICU_DATA` in `/usr/bin/zero-ad`.

```text
DOLLY 7
PACKAGE icu
REQUIRES HOST runtime@0
FROM    /vX/Dollyfile-system-tools <sha>            # c++, make, ar, cp, sed, grep, find
SOURCE  /vX/dist/static/icu/icu4c-68_2-src.tgz <sha> /tmp/icu.tgz   # build-sources.tsv:5 → source-pins.sh
SLOP gzip -dc /tmp/icu.tgz | tar -xf - -C /tmp
SLOP sed … double-conversion-utils.h …              # today's :97-98
FILE /tmp/objects.mk                                # today's :61-71
SLOP make -f /tmp/objects.mk … LIB=/usr/lib/libicuuc.a   (×3, today's :100-102)
SLOP mkdir -p /usr/include/unicode && cp …
FILE /usr/lib/pkgconfig/icu-uc.pc   … icu-i18n.pc  # today's :137-148
# the data, one of three ways:
#  (1) FILE /usr/share/icu/68.2/icudt68l.dat  (from the same archive, source/data/in/) and
#      EXPORTS ENV ICU_DATA /usr/share/icu/68.2   (a package sets variables "only for their own use", dollyfile.md:295-296)
#  (2) a real libicudata.a from the .dat: needs ICU's pkgdata/genccode tools built and run in Dolly; not tried
#  (3) as today: no data in the package; the consumer ships the file and sets ICU_DATA
EXPORTS HEADER unicode /usr/include/unicode
EXPORTS LIB icuuc … icui18n … icudata
FILE /usr/share/licenses/icu/LICENSE
```

- Under (1) and (2) `zero-ad`'s `SOURCE …/icudt68l.dat` row (`:39`) and `export ICU_DATA` (`:156`) could go only if `zero-ad` installed `icu` (it is a root composition that copies `pyrogenesis`; installing `icu` brings three archives the game does not need at run time), or if `zero-ad-engine` exported the variable into the engine image and `zero-ad` copied the file; under (3) `zero-ad` is unchanged and the package is the library alone. Under (1) every image that installs `icu` gets `ICU_DATA` in its environment. The content staging's dependence on `.cache/emscripten/ports/icu` would go with (1) or (2) and stay with (3).
- **Simpler in `zero-ad-deps`:** `:94-104` and `:137-148` and four `EXPORTS` become `INSTALL icu`; `deps.tar.gz` loses `icu/common`, `icu/i18n`, `icu/stubdata` and the licence. **More complicated:** a pin and a staged archive of its own; the flag set becomes the package's contract for everyone, chosen once; the data is version-locked (`icudt68l`), so an `icu` at another version is another data file. **Who else:** nobody in the catalog; Edge.js's need was noted and not pursued. **Rebuild:** `icu`, `zero-ad-deps` and its dependents.

**ENet.** The library part is upstream 1.3.18 minus `unix.c`/`win32.c`; the port part is `enet-dolly.c` (Dolly's HTTP datagram transport, 153 lines, no 0 A.D. name in it); the demo part is `relay.mjs` and its 2-8 participant policy. A `PACKAGE enet` would be `FROM system-tools`, `SOURCE` the ENet archive and `enet-dolly.c` (which moves out of `demos/zero-ad/` or is referenced from there), `objects.mk`, `EXPORTS LIB enet`, `HEADER enet`, `FILE libenet.pc`, and `REQUIRES HOST http@0`, because every program linked with it talks to the broker (as `sdl2` declares `display@0`, `input@0`); the probe `enet-check` and `0ad-enet-browser.mjs` would move with it. Every installer then declares `http@0` (`zero-ad-deps` does; `default` does). Who else: nothing links ENet today. What stays 0 A.D.'s: the relay server, the port 20595 in the probe, the engine's `HOST_SERVICE_TIMEOUT`.

## 6. What could not be found out without building, fetching or asking

- Whether SpiderMonkey's configure and make run unchanged on a base other than `zero-ad-deps` (`system-tools` plus the four installs): the self-host map lists what each stage needs (`:303-319`), and `zero-ad-deps` contributes only `pkg-config`, `zlib.pc` and the compiler to it, but no such build was run.
- Whether `releases.wildfiregames.com/libs/mozjs-128.13.0.tar.xz` equals the bundled tarball (`6422e51b…`), and whether `make-source-package.py` on Mozilla's ESR source reproduces either: no network, not run.
- Whether a SpiderMonkey built without the GC patch, or with the shell or Intl, works for the engine: not built.
- Whether 0 A.D. R28 compiles against fmt 11 (its floor is 5.3.0; 85 `fmt::` uses): not built.
- The sizes of ICU's, libxml2's, fmt's, Ogg's, Vorbis's, libsodium's and ENet's archives, and the build time of each alone: the manifest lists paths without sizes and the log times the whole script.
- Whether a real `libicudata.a` can be made inside Dolly (ICU's data tools), and whether the engine behaves the same with data compiled in rather than `ICU_DATA`.
- Whether the ICU flag set in the recipe is Emscripten's port's: the port's build script is not in this tree.
- Why fmt 7.1.3, libxml2 2.13.5, ENet 1.3.18 and libsodium 1.0.20 were the versions chosen on 2026-09-23: no message or task says.
- Why `61f4edb5` kept `COPY` for SDL2 in `zero-ad-deps` (also open in the copy investigation).
- Memory and time of `zero-ad-engine` restoring `spidermonkey-build`'s products through `INSTALL` against today's `COPY` of selected paths: not measured anywhere.