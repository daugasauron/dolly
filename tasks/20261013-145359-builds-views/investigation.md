# Packages that hold no build of their own (views and `COPY` packages): the investigation

Read at `/home/daug/dev/dolly/work/rust` (head `1b8e4b9c`, branch `integrate/round-1013`, history shared with `main`; `demos/studio/Dollyfile-dollyfile-studio` is modified there by a test run and was not read). The built images in its `dist/` and the logs in `build/image-logs/` were read; nothing was built, run or changed. Paths are relative to the tree root. This builds on [`builds-zero-ad-deps/investigation.md`](../20261013-145359-builds-zero-ad-deps/investigation.md) (`pkgconf`, `libpng`, `freetype`; FreeType and libpng written out as builds in its §5.b) and [`copy-directive/investigation.md`](../20261013-144241-copy-directive/investigation.md) (the nine `COPY` packages, §3.2 K2 and §5.A, D, E; the history of the three shapes, §1.6), and does not repeat them. The base images and their nine views (`core`, `cc`, `make`, `posix`, `ninja`, `git`, `amy`, `transfer`, `cmake`) are another agent's; here they are only counted.

**Summary (findings, no advice)**

1. The three shapes of a package were written on one day, 2026-10-05, by two commits (`8bfcd884`, `d4ab4f63`), as a list without preference (`docs/dollyfile.md:289-293`); the preference, "Cheapest shape first: a thin `PACKAGE` … rebuilds nothing", is the packages task's of 2026-10-12 (`tasks/20261012-130814-packages/TASK.md:43-44`) and was applied by `d237a991`, `837014d0` (both 2026-10-12), `dd858319` and `edef36bc` (10-13). Since then the doc's sentence changed only in its examples (`d8281852`, `d5ceeeca`).
2. Today 30 of 77 packages hold no build: 21 views (19 under the strict rule "a `FROM` and no `SOURCE`, `SLOP`, `RUN`, `COPY` row", plus `pkgconf`, whose one `SLOP` captures `--help` as its page, and `speech-to-text`, whose one `SOURCE` is a model file) and 9 made of `COPY` rows. The inventory's "22 views, 9 `COPY`, 39 builds, 9 data of 79" reconciles exactly with this loose rule at its tree: `javascript` was the 22nd view and became three builds (`d8281852`); the five Qwen-4B recipes went and `ps` came; so 42 hold their build and 5 are data or a script. The copy investigation's "22nd view I could not identify" is `pkgconf` and `speech-to-text` under the loose rule.
3. Of the twelve views outside the base images, nobody `INSTALL`s nine (`openal`, `libuv`, `raylib`, `box3d`, `llama`, `zig`, `session-recover`, `pkgconf`, `freetype`); `libpng` is installed by `freetype`, `voice` by `pi-phone`, `speech-to-text` by `speech-to-text-mic`. `default` installs none of them; of the `COPY` packages it installs `display`.
4. Each view keeps a selection of its builder's output, never all of it: `openal` leaves `openal-build`'s nothing but is one of two images on it; `raylib` leaves out `libm.a`; `libuv` leaves CMake; `llama` leaves the six llama.cpp archives; `voice` and `speech-to-text` leave `libtranscribe.a` and ggml, which no package offers; `zig` leaves WAMR and the seed runner, which no recipe keeps.
5. The things entangled, read from the recipes: `openal` is Dolly's 123-line patch applied at staging, options chosen for 0 A.D. (`HAVE_PTHREAD=OFF`, backends off), the demo's test fixture inside the source archive, and `zero-ad-deps` built on top of it (10 images beneath); `libuv` is Dolly's port (patch, two C files, a header, a Makefile) of Neovim's pinned version, staged under `dist/static/neovim/`, and 11 toolchains sit on `cmake-build`; `raylib` and `box3d` share one `sdk.mk` plus Dolly's adapter, a 13-function `libm.a`, two retained source trees "the game agents read", and Slopyard builds Box3D a second time with `-pthread` and SSE defines, so the SDK's `libbox3d.a` has no consumer but the `box3d` view; `nvim` holds five libraries that exist only as static archives, CMake, libuv and a page formatter; `display` needs Zig, Ghostty's library and a kernel-plugin compile.
6. The inventory's "nothing entangled" holds for the build steps of `openal`, `libuv`, `raylib`, `box3d`, `lua` (each is one block of rows that moves whole) and not for what surrounds them: a base built on the result (`openal`), a chain of 82 dependents (`libuv`), a second build with other options (`box3d`), a page formatted on another base (`lua`). Its "in the way" items for `nvim`, `display`, `rust`/`cargo`, `codex`/`pi` are true as stated, with details in §4.
7. Written out (§5), a package holding its own build is the view's base recipe with the view's export rows appended, in every case but `nvim`; the base image then either goes (`openal-build`, `gamedev-sdk`, `local-llm-build`, `speech-build`, `zig-build`, `ghostty-build`, `neovim-build`) or becomes a composition that installs the package (`cmake-build`, `system`). The question the language leaves open in each case is the same one as [build-needs](../20261013-144754-build-needs/TASK.md): a tool or library the build alone needs is a base or an `INSTALL` row that every installer gets.
8. The catalog already holds both shapes for the same kind of thing: `libevent` and `libterminfo` hold their builds and `tmux` installs them, so `tmux-panes` carries 851 KB of libraries its program linked statically; `quickjs`, `janis`, `typescript` hold their builds since 2026-10-14 at 1.65 MB more than the view they replace, in 14.9, 4.1 and 5.2 s.
9. What would rebuild, counted on today's graph: `openal` 12 images; `raylib`/`box3d` 4; `libuv` 82 (everything on `cmake-build`); `llama` 3; `voice`/`speech-to-text` 4; `nvim`/`lua` 4; `session-recover` 51; `zig` and `display` 118 and 115 (through `display` in `system-tools`).
10. Not findable without building: the time and memory of any of these builds (no log holds a duration), whether raylib's `rtext.c` still needs `-O0`, whether `libbox3d.a` with `-pthread` serves bhop, whether a `libuv` built on `system-tools` is byte-identical to today's, what `zero-ad-deps` declares `audio@0` for, and whether a program needs `libghostty-vt.a` besides the display plugin.

---

## 1. History

### 1.1 The rule: the three shapes, and who wrote each sentence

`git blame docs/dollyfile.md`, "Packages and amy" (`:262-302`):

| Lines | Text | Commit | Date |
| --- | --- | --- | --- |
| 264-266 | "A package is the unit of reuse: a lean image that holds only the files, exports and environment it declares, built in a toolchain (`FROM`) or from nothing" | `9fc8b997` | 2026-10-01 |
| 268-270 | "Software is a package when a session would install it … or more than one image uses it. An application, or a toolchain people open, is then a base, `INSTALL` rows and its own entry" | `8bfcd884` | 2026-10-05 |
| 271 | the three example names (`codex-agent`, `neovim`, `rust-tools`) | `d5ceeeca` | 2026-10-13 (names only) |
| 272-275 | "a toolchain remains where software is built. The same `COPY` rows in two recipes are a missing package. The core is packaged the same way: `core` … `cc` … `amy` … are kept from the toolchains that build them." | `d4ab4f63` | 2026-10-05 |
| 289-290 | "A package holds its build (`FROM` a toolchain, then steps: `zlib`, `ripgrep`, `sdl2`) or keeps the outputs of the toolchain that built them," | `8bfcd884` | 2026-10-05 |
| 291 | "with `FROM` and only `EXPORTS` (`cc`, `cmake`) or with `COPY`" | `d8281852` | 2026-10-13: `javascript` taken out of the examples when it became three builds |
| 292 | "rows (`nvim`, `rust`, `codex`), which leaves an expensive builder as it" | `d5ceeeca` | 2026-10-13: `codex-cli` renamed |
| 293 | "is." | `d4ab4f63` | 2026-10-05 |
| 298-301 | a manual page is a retained file in `cat1` or `man1` | `411d1cb2` | 2026-10-06 |

So the doc names three shapes and ranks none. "A toolchain remains where software is built" (`:271-272`) is the sentence that describes a view's base. No task text explains "leaves an expensive builder as it is" (copy investigation §6).

### 1.2 The packages task of 2026-10-12 and its rulings on this group

Owner: "Break out everything (that makes sense) into packages that are installable with amy." (`tasks/20261012-130814-packages/TASK.md:7`). The rules written there:

- "A **library** is a package when a program outside its own build would link it and building it here took a port: Dolly's glue, a platform file, a patch (`sdl2`, `libuv`, `raylib`, `box3d`, `curl`'s libcurl). Portable C that `cc` compiles from upstream's archive in seconds stays where its one consumer builds it (utf8proc, tree-sitter, LPeg as an archive), until a second image uses it" (`:27-33`).
- "A **library package installs no compiler** … a **program package brings what its programs start**" (`:36-38`).
- "Cheapest shape first: a thin `PACKAGE` over the image that builds the program (`FROM` and `EXPORTS`) adds no image input and rebuilds nothing." (`:43-44`).

Its table, the rows of this group (`:54-110`):

| Built in | Keeps | Decision |
| --- | --- | --- |
| `system` | `session-recover` (55 KB) | made |
| `zig-build` | Zig and its library | made; "installs `cc`, which compiles the C it writes" |
| `ghostty-build` | `libdisplay.so`, the font | `display`, offered |
| `ghostty-build` | `libghostty-vt.a`, its headers | "stays: the display plugin is its one consumer" |
| `cmake-build` | libuv, Dolly's port | **`libuv`** made |
| `neovim-build` | PUC Lua 5.1, `liblua.a`, headers, `lpeg.so`, `re.lua`, `luv.so` | **`lua`** made: "an interpreter a session runs; the two modules exist only for this Lua" |
| `neovim-build` | utf8proc, tree-sitter, `liblpeg.a`, `libluv.a` | "stay: portable C with one consumer" |
| `gamedev-sdk` | raylib with Dolly's adapter; Box3D | **`raylib`**, **`box3d`** made |
| `gamedev-sdk` | the sources of both (17.5 MB) | "stay: what the game agents read" |
| `speech-build` | `speech-to-text`, `voice` | **`transcribe`**, **`voice`** made |
| `llama-build`, `local-llm-build`, `pi-local` | llama.cpp, `dolly-llama` | "stay: one consumer, needs `gpu@0`" (made the next day, `edef36bc`) |
| `openal-build` | OpenAL Soft, Dolly's port | "stays for now: a package by the rule, but its programs need `audio@0`, which no image people install into declares (held, item 6)" (made the next day, `edef36bc`, with the opposite reading of `audio@0`: §3.1) |
| `zero-ad-deps` | pkgconf; libpng, FreeType | made (`837014d0`; zero-ad investigation §1.1) |

The same task's design 4, not done: "**The builds move into the packages** … each package holds its build (`FROM system-build`) and `system-tools` installs them … about 600 recipe lines move, none are added, one round." (`:272-281`).

### 1.3 Each view and `COPY` package: the commit that made it, and the reason given

| Package | Shape | Made by | Reason quoted |
| --- | --- | --- | --- |
| `display` | `COPY` ×4 from `ghostty-build`, no `FROM` | `5ec4783c` 2026-10-01 | "the shared ones become packages (zlib, curl, gzip, display, pi-coding-agent, nvim …)" |
| `nvim` | `COPY` ×12 from `neovim-build`, `FROM tools-build` | `5ec4783c` 2026-10-01 (page rows `b74634a7` 10-13) | same; the page: "Its manual page is formatted here as text … tools-build has mandoc, and a package keeps nothing of the base it is built on" (`Dollyfile-nvim:6-7`) |
| `rust`, `cargo`, `codex`, `pi`, `mojo`, `llvm` | `COPY` | `8bfcd884` 10-05; `9a67df01` 10-06; `95737c29`/`8bfcd884`; `c4dbe3ad`/`d7e1a516`; `141592ed` 10-13; `645f7474` 10-08 | copy investigation §1.6 |
| `zig`, `session-recover`, `libuv`, `lua`, `raylib`, `box3d` (and `make`, `transfer`) | views | `d237a991` 2026-10-12 | "Each is a thin PACKAGE over the image that already builds the program: no image input is added and no other image rebuilds (87 s for the eight). … raylib leaves out gamedev-sdk's libm.a: measured, its programs link without it. lua carries the LPeg and luv modules built for it." |
| `pkgconf`, `libpng`, `freetype` | views of `zero-ad-deps` | `837014d0` 2026-10-12 | zero-ad investigation §1.1 |
| `voice`, `transcribe` (now `speech-to-text`) | views of `speech-build` + `INSTALL parakeet` | `dd858319` 2026-10-12 | "speech-to-text and pi-phone held the same rows: the program copied from speech-build, the model and its licence downloaded. Each is now its base and one INSTALL" |
| `speech-to-text` renamed | | `78ed31c2` 2026-10-13 | "the package speech-to-text is its command; the image that listens is speech-to-text-mic" |
| `llama`, `openal` | views of `local-llm-build`, `openal-build` | `edef36bc` 2026-10-13 | "llama keeps dolly-llama from local-llm-build and declares gpu@0: default refuses it by that name. openal keeps OpenAL Soft's library, headers and CMake files from openal-build; it has no playback backend … so it asks for no host module … Neither adds a build: both bases are cache hits." |
| `lua` view → `COPY` | | `b74634a7` 2026-10-13 | "Each recipe formats upstream's page on tools-build; lua takes its files from neovim-build by COPY, as nvim does." |

Earlier rulings against the same packages: 2026-10-05, "Zig: measured as a package (60.7 MB, installs in 1.0 s …) The C backend alone has no `zig build`, `run` or `cc`, so a session cannot use it as a compiler; the recipe is ten lines (`FROM zig-build`, three exports) once it can" (`tasks/20261005-131645-more-packages/TASK.md:137-141`); "Lua 5.1 and libuv: private dependencies of Neovim and CMake, one consumer each through `FROM`" (`:147-148`); "`demos/slopyard`: raylib and box3d reach `slopyard` and `bhop` through `FROM gamedev-sdk`; nothing repeats, leave" (`:161-162`); a `dolly-llama` package proposed as a view ("`FROM …/Dollyfile-local-llm-build <pin>`, `EXPORTS TOOL dolly-llama`", `:155-160`).

### 1.4 Where the build images came from

| Image | Born | Message or reason |
| --- | --- | --- |
| `cmake-build` with libuv; `neovim-build` | `1f2954b6` 2026-09-07 "Checkpoint source-built Neovim and independent compiler images" | `config/libuv-dolly.patch` (151 lines), `libuv-dolly.mk`, `neovim-dolly.patch` (66), `modules/libuv.dm`, `modules/cmake.dm`; no body |
| `gamedev-sdk` | `8e270ae4` 2026-09-06 "Separate reusable runtime images from tools and startup policy" | `modules/gamedev-sdk.dm` split out of `gamedev.dm`; no body |
| `llama-build`, `local-llm-build` | `2a14ff91` 2026-09-14 "Run local llama.cpp inference inside Dolly through the GPU ABI" | two modules, `llama-core.dm` and `local-llm-engine.dm`; no reason for two images in the message |
| `openal-build` | `d45c3c39` 2026-09-24 "Build a reusable OpenAL SDK inside Dolly" | `toolchain/0ad/openal.patch` became `config/openal-dolly.patch`; `openal.dm` |
| `zig-build` (from `ghostty-build`) | `95810edd` 2026-10-01 "Build Zig inside Dolly and drop the host-built zig.wasm" | "ghostty-build now starts from zig-build and has that Zig emit Ghostty VT and compiler_rt as C for cc, so display edits do not rebuild Zig" |
| `speech-build` | `88a8003f` 2026-10-10 "Speech demo: an image that boots into speech-to-text" | "transcribe.cpp and its ggml are compiled by Dolly's cc with threads and Wasm SIMD" |
| `zero-ad-deps` `FROM openal-build` | `776ae6f5` 2026-10-01 | self-host task: "`openal-build` -> `zero-ad-deps` first (none imported; deps needs cmake)" (`tasks/20260930-231200-self-host-zero-ad/TASK.md:384`); "OpenAL's CMake adds `-pthread` whenever the compiler accepts it, and `openal.pc` then turned the engine into a threaded process" (`:223-225`), hence `HAVE_PTHREAD=OFF` |

### 1.5 The owner's words of 2026-10-13, and the one case done that night

Owner: "Last night when I said "break out more things as packages" I mean that to simplify and make the current builds more generic. One example would be breaking out spidermonkey (just an example) into a package. It seems you just started adding random stuff? It's fine, keep them, but that was not the point. I want to simplify and create as many reusable, good, no shortcuts, packages as possible." The reading that the thin packages are the shortcut is the integrator's (`tasks/20261013-142800-generic-builds/TASK.md:49-55`: "Fifteen of the earlier ones … are thin recipes over the image that happens to build the thing: the build still lives in a demo's image, which is the shortcut the owner does not want"), not a sentence of the owner's.

The one view rewritten that night: `javascript` into `quickjs`, `janis`, `typescript` (`d8281852`). "So the three are not views of `typescript-build`: each recipe is `FROM system-tools` and holds its build, and each installs the one before by reference." Together 29,892,346 bytes against 28,240,268 (1,652,078 more: upstream's `qjs`, three recipe chains, three pages); built in 14.9, 4.1 and 5.2 s; sixteen recipes repinned; "`typescript-build` held nothing that is no package's: nothing is left of it" (`tasks/20261013-135951-javascript-split/TASK.md:42-60`).

## 2. The complete list today

Rule used, over the 77 `PACKAGE` recipes (130 recipes: 20 applications, 33 toolchains): a **view** is a package with a `FROM` and no `SOURCE`, `SLOP`, `RUN` or `COPY` row (19), plus two that have one row which is not a build step: `pkgconf` (`SLOP pkgconf --help > …/cat1/pkgconf.1`: a page captured from the program it keeps) and `speech-to-text` (`SOURCE … silero-vad.gguf`: a model file); a **`COPY` package** has a `COPY` row (9; four of them also run a `SLOP`: a launcher compiled, a page formatted, `pi --version`); a package **holds its build** when it has a `SOURCE` and a `SLOP`/`RUN` and no `COPY` (42; `meson` installs a pinned wheel, `nena` and `curl` compile Dolly's own C: counted here); the rest are **data or a script** (5: `dolly-docs` 39 `SOURCE` rows, `parakeet`, `qwen3.5-2b`, `minicpm5-2b`, `ps` written by `FILE` rows).

### 2.1 The 21 views

Sizes are the snapshots in `dist/` (bytes); "keeps" counts `EXPORTS`/`FILE`/`FOLDER` rows; installers are recipes with an `INSTALL` row of it.

| View | `FROM` | Keeps | Snapshot | Installed by | In `default` |
| --- | --- | --- | --- | --- | --- |
| `openal` | `openal-build` | 4/1/0 | 3,516,837 (34 paths) | nobody | no |
| `libuv` | `cmake-build` | 3/1/0 | 618,289 (33) | nobody | no |
| `raylib` | `gamedev-sdk` | 4/3/0 | 1,853,874 (23) | nobody | no |
| `box3d` | `gamedev-sdk` | 2/1/0 | 2,241,549 (27) | nobody | no |
| `llama` | `local-llm-build` | 2/0/0 | 10,962,916 (21) | nobody (`pi-local` copies the same two paths) | no (refused: `gpu@0`) |
| `voice` | `speech-build` (+ `INSTALL parakeet`) | 2/0/0 | 3,970,207 (23) | `pi-phone` | no (`buttons@0`, `microphone@0`) |
| `speech-to-text` | `speech-build` (+ `INSTALL parakeet`, one `SOURCE`) | 3/0/0 | 5,208,884 (24) | `speech-to-text-mic` | no (`microphone@0`) |
| `zig` | `zig-build` (+ `INSTALL cc`) | 3/2/0 | 60,649,882 (1,456) | nobody | no |
| `session-recover` | `system` | 1/1/0 | 163,576 (17) | nobody | no |
| `pkgconf` | `zero-ad-deps` (one `SLOP`) | 2/2/0 | 292,641 (22) | nobody | no |
| `libpng` | `zero-ad-deps` (+ `INSTALL zlib`) | 5/4/0 | 767,947 (31) | `freetype` | no |
| `freetype` | `zero-ad-deps` (+ `INSTALL libpng`) | 2/1/1 | 1,938,923 (83) | nobody | no |
| `cmake` | `cmake-build` (+ `INSTALL cc`) | 2/2/0 | 87,828,405 | nobody | no |
| `core`, `cc`, `make` | `system-build` | 21/20, 14/8, 1/2 | 987,683; 126,163,965; 466,903 | `zero-ad`; 7 recipes; nobody | `core` yes |
| `posix`, `git`, `ninja`, `amy`, `transfer` | `system-tools` | 59/61, 3/7/1, 1/2, 2/2, 2/2 | 3,327,936; 10,134,515; 258,788; 298,744; 165,752 | `rust-build`, `zero-ad`; nobody; `python`, `meson`; nobody; `zero-ad` | `posix`, `amy`, `transfer` yes |

The last two rows are the other agent's; counted here only. The `zig` snapshot is 60.6 MB where the packages task measured 186.9 MB with `cc` inside (`:127`): the by-reference change of `2283e960` is visible in `dist/`.

### 2.2 The 9 `COPY` packages

| Package | `FROM` | `COPY` from (rows) | Other rows | Keeps | Snapshot | Installed by | In `default` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `nvim` | `tools-build` | `neovim-build` (12) | 1 `SOURCE`, 2 `SLOP` (page) | 3/1/0 | 36,352,884 (2,233) | `neovim`, `dollyfile-studio` | no |
| `lua` | `tools-build` | `neovim-build` (11) | 1 `SOURCE`, 2 `SLOP` (page) | 6/1/0 | 3,349,279 (35) | nobody | no |
| `display` | none | `ghostty-build` (4) | 1 `FILE` (`/etc/termcap`) | 2/1/0 | 9,414,842 (14) | `system-tools`, `rust-sdk`, `zero-ad`, `default` | yes |
| `rust` | none | `rust-build` (2) | `INSTALL cc`, launcher `FILE` | 3/1/0 | 336,842,410 (1,252) | `cargo`, `rust-tools` | no |
| `cargo` | none | `rust-build` (3) | `INSTALL rust` | 4/1/0 | 36,914,499 (1,472) | `rust-tools`, `zero-ad-spidermonkey` | no |
| `codex` | `system` | `codex-build` (3) | `INSTALL ripgrep`, `fd`; 2 `SOURCE`, launcher compiled | 1/1/0 | 209,595,156 (3,049) | `codex-agent` | no |
| `pi` | `system` | `pi-build` (4) | `INSTALL janis`, `ripgrep`, `fd`; 5 `SOURCE`; `pi --version` | 3/5/0 | 62,342,829 (7,778) | `pi-runtime`, `bhop`, `slopyard` | no |
| `mojo` | none | `mojo-build` (3), `mojo-runtime` (2) | `INSTALL cc`, config `FILE` | 5/1/0 | 101,089,701 | `mojo-gpu` | no |
| `llvm` | none | `llvm-cc` (1) | `INSTALL cc`, 3 `SOURCE` licences | 3/5/0 | 127,367,889 | nobody | no |

### 2.3 The other 47

Packages holding their build, by base: `tools-build` 20 (`bc`, `bzip2`, `dte`, `flex`, `jq`, `lz4`, `meson`, `pigz`, `sbase`, `sqlite`, `tar`, `tmux`, `tree`, `unzip`, `wabt`, `xxd`, `xz`, `yacc`, `zip`, `zstd`); `system-tools` 11 (`base64`, `janis`, `less`, `libevent`, `libterminfo`, `llvm-runtimes`, `mandoc`, `quickjs`, `toybox`, `typescript`, `vi`); `system-build` 4 (`curl`, `gzip`, `nena`, `zlib`); `rust-build` 4 (`cbindgen`, `fd`, `protox`, `ripgrep`); `system` 2 (`emacs`, `python`); `cmake-build` 1 (`sdl2`). `llvm-runtimes` is not a view: `FROM system-tools`, one `SOURCE`, three `SLOP` rows (`68cad571`, "libc++, libc++abi and libunwind built inside Dolly"). Data or script: `dolly-docs`, `parakeet`, `qwen3.5-2b`, `minicpm5-2b`, `ps`.

### 2.4 The inventory's numbers against the tree

| Inventory (79 at `d89bca74`) | Here (77) | Why |
| --- | --- | --- |
| 22 views | 21 | `javascript` was a view of `typescript-build`; it is three builds now. 22 = 20 strict + `pkgconf` + `speech-to-text`, the loose rule above. |
| 9 `COPY` | 9 | same nine |
| 39 builds | 42 | `quickjs`, `janis`, `typescript` |
| 9 data | 5 | `qwen3.5-4b` and its four shards went; `ps` came |

So the inventory's counts are right for its tree under the loose rule; the copy investigation's strict rule (20 + 4 roots) differs by `pkgconf`, `speech-to-text`, `llvm` (three `SOURCE` rows for licences) and the four `COPY` packages that run a `SLOP`.

## 3. Each view outside the base images: the build and what is entangled

Language facts used: a package's build keeps nothing of its `FROM` or `INSTALL` (`src/dollyfile.c:1401`, `docs/dollyfile.md:201-202`); a toolchain keeps the files of what it installs; a package's `INSTALL` rows are installed first by whoever installs it (`:144-147`) and its `REQUIRES HOST` lines must be declared by the installer (`:150-152`); sealing scans every retained executable for stamped modules (`:220-224`).

### 3.1 `openal` of `openal-build`

- **Build.** `demos/zero-ad/Dollyfile-openal-build` (51 lines), `FROM cmake-build`; one `SOURCE`, `dist/static/openal/source.tar`, which `demos/zero-ad/prepare-sources.sh:5-13` packs from the patched checkout (`prepare-openal.sh` fetches OpenAL Soft 1.24.3, `config/source-pins.sh:111-113`, and applies `openal-dolly.patch` at `:15`), the demo's test fixture `demos/zero-ad/test/fixtures/0ad-openal.cpp` as `/tmp/openal/check.cpp`, and four licence files, one of them the fmt 11.1.1 upstream bundles. CMake (`:26-36`): `-DLIBTYPE=STATIC`, every backend `OFF` (PipeWire, PulseAudio, ALSA, OSS, Solaris, SndIO, JACK, PortAudio, SDL2, SDL3, Wave), `-DHAVE_PTHREAD=OFF` (comment `:25`: "the mixer is serial (openal-dolly.patch) and 0 A.D. is not a threaded process"), `-O1`, `-D__STDC_NO_THREADS__=1 -include cstdlib`, utils, examples, tests, HRTF data off. Then `rm -rf /usr/include/AL` (comment `:38`: "Replace bootstrap headers even when normalized source timestamps match"), install, the probe compiled and run (`:41-42`). Exports `HEADER AL`, `LIB openal`, `FOLDER` cmake and licences, `FILE openal.pc` (`:45-49`). Hosts: the opened-toolchain set, no `audio@0`. Snapshot 242,564,258 bytes, 6,553 paths; no duration in the log (1,736 lines).
- **The patch.** `demos/zero-ad/openal-dolly.patch`, 123 lines, five files: under `__dolly__` the event thread is never started (`al/event.cpp`), events are processed inline after every `alcRenderSamplesSOFT` (`alc/alc.cpp`, a `ProcessEvents` hook), and `al::semaphore` is a counter whose `wait` aborts when empty (`common/alsem.cpp`, `.h`). It is Dolly's (born `d45c3c39` as `toolchain/0ad/openal.patch`), not upstream's and not 0 A.D.'s; it is applied at staging, so the recipe never names it.
- **The backend question.** The library is built with no playback backend; a program opens the loopback device and renders samples itself (`alcLoopbackOpenDeviceSOFT`, `alcRenderSamplesSOFT`) and writes them to `audio@0` with `<dolly/audio.h>`: 0 A.D.'s engine does exactly this in `engine.patch:1171-1233` (`dolly_audio_open`, `dolly_audio_get_status`). The client library the program links stamps `audio@0` into the program; the archive stamps nothing. So the package declares `runtime@0` alone (`Dollyfile-openal:5-9`; `edef36bc`; `tasks/20261012-230015-more-packages/TASK.md:149-156`), installs into `default`, and the amy check plays a square wave through loopback with no audio module (`test/amy-browser.mjs:222-229`). The packages task of 10-12 read it the other way ("its programs need `audio@0`, which no image people install into declares", `:104`). Both readings are in the record; the second would hold for a package that carried a Dolly playback backend inside OpenAL Soft, which does not exist. `zero-ad-deps` declares `audio@0` (`:4`) while its own OpenAL probe links `-lopenal -lm` only (`:164`), the same fixture: what that declaration is for could not be told from the recipes.
- **Users and what is entangled.** `openal-build` is `FROM` for two images: the view and `zero-ad-deps` (`Dollyfile-zero-ad-deps:13`), so the whole 0 A.D. chain and its views and copiers stand on it (12 transitive dependents: `openal`, `zero-ad-deps`, `zero-ad-spidermonkey`, `zero-ad-engine`, `zero-ad`, `pkgconf`, `libpng`, `freetype`, `wine-build`, `wine`, `xonotic-build`, `xonotic`). Nothing links `-lopenal` but pyrogenesis and the two probes (the fixture is compiled a second time in `zero-ad-deps:164` and retained for `0ad-openal-browser.mjs`). Nobody installs `openal`. The option set is 0 A.D.'s need (serial mixer, no threads); the view keeps all of the build's output but the `EXPORTS FILE` of `openal.pc` becomes a `FILE` row.

### 3.2 `libuv` of `cmake-build`

- **Whose libuv.** A separate archive: libuv 1.52.1 from `github.com/libuv/libuv` (`config/source-pins.sh:95-97`), under the comment "Match Neovim 0.12.5's upstream dependency pins" (`:90`); staged as `dist/static/neovim/libuv.tar` by `demos/cmake/prepare-sources.sh:3-9` (the `include/` and `src/` trees, the licence, `demos/cmake/libuv/` as `/tmp/libuv/dolly`, `libuv-dolly.mk` as the Makefile) after `prepare-libuv.sh:21-22` applies `libuv-dolly.patch` and copies `libuv/dolly.h` in. CMake 4.4.3 is bootstrapped against it (`--system-libuv --bootstrap-system-libuv`, `Dollyfile-cmake-build:82-84`), so CMake's bundled `cmlibuv` is not built. The CMake archive is also staged under `dist/static/neovim/` (`:76`).
- **The port.** The patch (151 lines, four files): `include/uv/unix.h` includes `uv/dolly.h` on `__wasm64__`; `src/threadpool.c` under `__dolly__` has no pool, queues work on the loop and runs it inline in `uv__work_done`, `uv__work_cancel` without locks; `src/unix/posix-poll.c` calls `uv__dolly_process_cleanup` at loop delete and `uv__io_fork` returns `UV_ENOSYS`; `src/unix/thread.c` `uv_thread_create_ex` returns `UV_ENOSYS`. `dolly.h` (15 lines) adds the poll fields and a `child_poll` timer ("upstream's poll backend and a serial child reaper"). Two Dolly C files, `process.c` and `platform.c`, are built as `dolly-process.o`, `dolly-platform.o` by `libuv-dolly.mk` (27 lines: 12 common and 22 unix upstream units, `-O0 -std=gnu11 -D_GNU_SOURCE`). Born `1f2954b6` 2026-09-07; `f6d5cf79` 2026-10-06 ("libuv's patch tests `__dolly__`"); `ec27f596` 2026-10-08 (stdio pipe as a socket pair). All Dolly's; none of it is CMake's or Neovim's.
- **Build rows.** `Dollyfile-cmake-build:21-48`: `SOURCE`, `tar`, `make -C /tmp/libuv`, two `cp`, a 13-line timer check compiled and run, three `EXPORTS`, one `FILE`, `rm`. The view (`Dollyfile-libuv`) keeps the same three exports and the licence: all of libuv's output, none of CMake's.
- **Users.** CMake (static, inside `cmake-build`); Neovim: `neovim-build:78-79` `REQUIRES HEADER uv`, `LIB uv`, luv built `-DWITH_SHARED_LIBUV=ON` against `/usr/lib/libuv.a` (`:85-90`), Neovim's own CMake the same; the demo's tests (`demos/cmake/test/fixtures/libuv.c`, `libuv-dso.c`); the amy check (`test/amy-browser.mjs:190`). Nobody installs `libuv`. `cmake-build` is `FROM` for 11 recipes and 82 images stand on it; every one of them carries `libuv.a` and the headers (a toolchain keeps its base).

### 3.3 `raylib` and `box3d` of `gamedev-sdk`

- **Build.** `demos/slopyard/Dollyfile-gamedev-sdk` (431 lines), `FROM system` (not `system-tools`; declares `snapshot@0` with the opened set). Two `SOURCE` rows: `raylib.tar` (`src/`, `LICENSE`, `README.md` of the pinned checkout `dbc56a87`, "6.0") and `box3d.tar` (`src/`, `include/`, `LICENSE`, `README.md` of `8441b4a0`, "0.1.0"), packed by `demos/slopyard/prepare-sources.sh:9-21`; four `FILE` bodies: `sdk.mk` (56 lines), `math-compat.c` (13 float and `fmax`/`fmin`/`abs` functions into `/usr/lib/libm.a`), `box3d-platform.c` (111 lines: replaces upstream `timer.c`; inert mutex, semaphore and thread; `b3Hash` copied so hashes match upstream), `dolly-raylib.c`/`.h` (139 lines: the adapter over `display@0` and `input@0`; stubs `tcgetattr`, `tcsetattr`, `getchar` for `PLATFORM_MEMORY`); one `make -f sdk.mk` (`:405-406`). Retains the two source trees (`FOLDER /usr/src/raylib`, `/usr/src/box3d`, `:412-413`), exports `LIB raylib`, `box3d`, `dolly-raylib`, `m`, three headers; keeps `raymath.h`, `rlgl.h`, two licences. Snapshot 172,392,586 bytes, 2,687 paths; log 152 lines, no duration.
- **What `sdk.mk` decides for both.** raylib: five modules (`rcore rshapes rtextures rtext rmodels`; no `raudio`, no `rglfw`), `-std=gnu99 -O2 -D_GNU_SOURCE -DPLATFORM_MEMORY -DGRAPHICS_API_OPENGL_SOFTWARE -DSUPPORT_CUSTOM_FRAME_CONTROL=1 -DSW_FRAMEBUFFER_OUTPUT_BGRA=0 -fno-strict-aliasing -fno-builtin`, and `rtext.c` at `-O0` ("triggers the embedded LLVM backend's current high-optimization memory/trap limit", `:45-47`). Box3D: every `.c` but `timer.c`, `-std=gnu17 -O2 -fno-builtin -U__SIZEOF_INT128__ -DBOX3D_DISABLE_SIMD`, no `-pthread`, `platform.o` from Dolly's file. `libm.a` from `math-compat.c`; `libdolly-raylib.a` from the adapter.
- **Two Box3D builds.** `slopyard` is `FROM gamedev-sdk` and builds Box3D again from the SDK's retained `/usr/src/box3d/src` (`demos/slopyard/src/box3d.mk`, 17 lines): every `.c` including upstream `timer.c`, `-O2 -pthread -D__SSE__ -D__SSE2__`, each unit compiled through a wrapper `box3d-simd.c`, into `/usr/lib/libslopyard-box3d.a`; the game links `-lslopyard-box3d` and not `-lbox3d` (`Dollyfile-slopyard:58-59`); README: "Box3D runs real 3D physics at 60 Hz with a SIMD, pthread build". `bhop` links `-ldolly-raylib -lraylib -lm` (`Dollyfile-bhop:735`) and never names Box3D. So the SDK's `libbox3d.a` has no consumer in the catalog but the `box3d` view's amy check (`test/amy-browser.mjs:231-235`). Two users do want different options: the SDK's single-threaded, SIMD-off Box3D (`runtime@0` only) and Slopyard's `-pthread` one (a program linked with it needs `threads@0`, which `slopyard` declares).
- **The views.** `raylib` keeps the two archives, two headers, `raymath.h`, `rlgl.h` and the licence, declares `display@0` and `input@0` (the adapter's clients), and leaves out `libm.a` (`d237a991`: "measured, its programs link without it"; packages task `:165-169` says the archive "can go from `gamedev-sdk` when `bhop` and `slopyard` next rebuild": it is still there, `:75-76, 418`). `box3d` keeps the archive, the header folder, the licence. Neither keeps the source trees. Nobody installs either; `bhop` and `slopyard` are `FROM gamedev-sdk` (4 images stand on it).

### 3.4 `llama` of `local-llm-build`

- **Build, two images.** `llama-build` (`FROM cmake-build`): `source.tar` packed by `demos/local-llm/prepare-local-llm.sh` from llama.cpp `@093a2f86` (`source-pins.sh:179-181`) with Dolly's own `demos/local-llm/CMakeLists.txt` in place of upstream's at the root, Dawn's WebGPU headers, a one-line stub `emscripten/emscripten.h`, and a `sed` giving `__dolly__` Emscripten's branch in `ggml/include/ggml.h` and `common/common.cpp` ("GGML_MEM_ALIGN 8 (its malloc alignment), no cache or config directory"); CMake `-O1`, targets `llama ggml-webgpu llama-common`; exports six archives under `/usr/lib/dolly-llm/`, `HEADER llama`, the licences. `local-llm-build` (`FROM llama-build`, declares `gpu@0`): `engine.tar` (`main.cpp`, `webgpu.cpp`, `host/gpu/gpu.h`, `gpu-abi.h`), one `c++` line linking the six archives and `-ldolly-gpu` into `/usr/bin/dolly-llama` (`:25-27`); exports the tool and the sources folder. Snapshots 260,634,679 and 271,518,013 bytes. Born as two modules in `2a14ff91` (2026-09-14) with no stated reason for two.
- **The view and its users.** `llama` keeps the tool and the licence folder, declares `gpu@0`: `default` refuses it ("`Dollyfile-llama needs gpu@0`", `tasks/20261012-230015-more-packages/TASK.md:143-146`). `pi-local` copies `/usr/bin/dolly-llama` from `local-llm-build` and the licences from `llama-build` (`Dollyfile-pi-local:15-16`), the two paths the package exports; the task notes "it could `INSTALL` this instead" (`:147-148, 276`). The six archives are no package's; nothing else links them. ggml is compiled a second time inside `speech-build` (the builds-twice task's subject).

### 3.5 `voice` and `speech-to-text` of `speech-build`

`speech-build` (`FROM cmake-build`; declares `buttons@0`, `microphone@0`, `threads@0` with the opened set): `source.tar` is transcribe.cpp `@c63b18e2` with its vendored ggml (the same `sed` for `__dolly__`), Dolly's `speech-to-text.c`, `voice.c`, `hearing.h`; CMake `-O2 -pthread -msimd128`, no precompiled headers ("Threads and SIMD are what let the model keep up with speech", `:22`); the two programs compiled with `cc -pthread -msimd128 -Wall -Werror` and linked statically with `libtranscribe.a` and three ggml archives (`:30-39`). Exports the two tools and the licences; the library is exported by nothing. The two packages keep one tool each and install `parakeet` (135,396,361 bytes); `speech-to-text` adds the Silero VAD file by `SOURCE` and exports it. Users: `speech-to-text-mic` (`FROM system` + `INSTALL speech-to-text`) and `pi-phone` (`FROM pi-runtime` + `INSTALL voice`). Both declare the modules; `default` declares none of `microphone@0`, `buttons@0`, so it refuses both by name.

### 3.6 `zig` of `zig-build`

`zig-build` (`FROM system-build`, 159 lines; hosts `runtime@0`, `http@0`, no `ENTRY`): `zig.tar` (the standard library files listed in `config/zig-sdk-files.txt`, `src/`, `stage1/zig1.wasm`, Dolly's `src/zig/config.zig`) and `wamr.tar` (WAMR `@68b8ed38`'s `core/`, Dolly's `zig1.c`, `wamr-platform.c`, `platform_internal.h`); `cc` builds the WAMR interpreter with 36 units (`:28-96`), which runs `zig1.wasm` to emit `zig2.c` and `compiler_rt.c` for the `wasm64-emscripten` target with the C backend only (`:99-127`); `cc` compiles both into `/usr/bin/zig` (`:132-154`). Exports the tool, `FOLDER /usr/lib/zig`, `ENV ZIG_LIB_DIR`, the licence. The interpreter and `zig1` are build-only and not retained. The view adds `INSTALL cc` ("cc compiles what it emits, so the package brings the compiler") and an inline page with the two invocations that work. The only build-time user of `zig` is `ghostty-build` (`REQUIRES TOOL zig`, `:18`); 118 images stand on `zig-build` transitively, because `ghostty-build` → `display` → `system-tools`.

### 3.7 `session-recover` of `system`

`Dollyfile-system` (27 lines, `FROM system-tools`): three `SOURCE` rows from `dist/static/session-recovery/` (Dolly's own `src/commands/session-recover.c`, `src/session-records.h`, `src/fs-record.h`, staged by `scripts/prepare-image-sources.sh:75-77`), one `cc -O1`, `--help` captured as the page (`:21-24`). The view keeps the tool and the page. 21 recipes are `FROM system`; 51 images stand on it. Nobody installs `session-recover`.

### 3.8 `pkgconf`, `libpng`, `freetype` of `zero-ad-deps`

Covered by the zero-ad investigation §2.1, §2.6 and §5.b. Added here: `pkgconf` is the one view with a build step, `SLOP pkgconf --help > /usr/share/man/cat1/pkgconf.1` (`:11`), the page of a program it does not compile; `libpng` carries `zlib.pc` as a `FILE` because `zero-ad-deps` writes it and `zlib` ships none (`Dollyfile-libpng:6-7, 18`); the three sit on a 418 MB image whose pin moves with any 0 A.D. library.

### 3.9 The `COPY` packages, briefly

The copy investigation covers each (§3.2, §5). Facts the inventory's claims turn on: `nvim` and `lua` are built on `tools-build` for `text-page` and take their files from `neovim-build` (§3.10 below); `display` takes four paths from `ghostty-build`, which is `FROM zig-build`, `REQUIRES TOOL zig`, and compiles `libdisplay.so` with `cc -shared --dolly-kernel-plugin` against `libghostty-vt.a` (`Dollyfile-ghostty-build:85-94`); `rust` and `cargo` take from `rust-build`, which copies `/opt/rust-llvm` from `rust-llvm` (`:15`), installs `posix` for `cmp` (`:16-17`), runs `compiler.slop` and `std.slop` twice so that the second rustc "holds nothing of the seed" and replaces `/opt/rust-sdk/bin/rustc-real` each time (`:38-73`), then builds Cargo with the kept compiler (`:76-88`); `codex` takes from `codex-build` (`FROM rust-build`, `INSTALL protox`, `REQUIRES TOOL protox`, `:10-21`); `pi` from `pi-build` (`FROM system-tools`, `INSTALL typescript`, `REQUIRES TOOL tsc`, `janis`, `patch`, `make`, `:10-29`). `mojo` and `llvm` are the engines task's.

### 3.10 `nvim` and `lua`: what `neovim-build` holds

`demos/neovim/Dollyfile-neovim-build` (255 lines, `FROM cmake-build`, declares `dso@0` with the opened set), seven `SOURCE` rows from `dist/static/neovim/` and six builds, each with a check: Lua 5.1.5 (`luaconf.h` `sed` `/usr/local`→`/usr`, `-O0 -DLUA_USE_POSIX -DLUA_USE_DLOPEN`, `MYLDFLAGS=-rdynamic`; `lua`, `liblua.a`, four headers; `:26-57`); LPeg 1.1.0 (`lpeg.so`, `liblpeg.a`, `re.lua`; `:61-77`); luv 1.52.1-0 by CMake against `/usr/lib/liblua.a` and the system libuv (`libluv.a`, `luv.so`; lua-compat53's licence; `:83-111`); utf8proc 2.11.3 (`libutf8proc.a`; `:114-138`); tree-sitter 0.26.13 (`libtree-sitter.a`; `:139-163`); Neovim 0.12.5 by CMake (`Debug -O0`, `PREFER_LUA=ON`, libintl, unibilium and wasmtime off; `--target nvim`; `:178-218`) and six grammars by CMake each (`:222-253`). The patch `neovim-dolly.patch` (66 lines, README: "keeps children attached to their owner, targets the child PID on cancel, fixes a memory64 terminfo varargs call") is applied at staging. Of the five libraries only static archives are built (`make libxxx.a`, `BUILD_SHARED_LIBS=OFF`), so the `nvim` binary necessarily contains them; `nvim` copies the binary, `/usr/share/nvim`, `/usr/lib/nvim` (the parsers) and nine licence folders, `lua` copies the interpreter, archive, headers, the two modules, `re.lua` and five licences, and fetches `lua-5.1.5.tar.gz` a second time for `doc/lua.1` (`Dollyfile-lua:25-27`). Nobody installs `lua`; `neovim` and `dollyfile-studio` install `nvim`. Lua exists three times in the catalog (5.1.5 here, 5.5.1 built inside `slopyard:26-44`, premake's bundled one: the builds-twice task).

## 4. The inventory's claims in this group, checked

| Claim | Verdict | What was looked at |
| --- | --- | --- |
| "31 of 79 packages hold no build: 22 are `FROM` a build image and compile nothing, 9 are `COPY` rows" | True under the loose rule (§2.4); `pkgconf` runs one `SLOP` (a page) and `speech-to-text` one `SOURCE` (a model) | the 77 recipes; `git show d89bca74 --stat` |
| `pkgconf`, `libpng`, `freetype`: "nothing entangled" | Partly (zero-ad investigation §4): the two CMake builds are upstream's unchanged; pkgconf's `config.h` is the recipe's; both views ship `.pc` files written for other packages; the base is a 418 MB image with twelve builds | `Dollyfile-zero-ad-deps:39-57, 87-88, 121-136` |
| `openal`: "nothing entangled" | Partly: the rows move whole (`:23-49`); but the patch is Dolly's and applied at staging, the probe is the demo's fixture inside the source archive, the options are 0 A.D.'s, `zero-ad-deps` is `FROM` it so 10 images stand beneath, and the library has no consumer but 0 A.D. | §3.1 |
| `libuv`: "`cmake-build`, a port with a 151-line patch" | True; and the port is also two C files, a header and a Makefile, the pin is Neovim's, the archive is staged under `neovim/`, and 82 images stand on `cmake-build` | §3.2 |
| `lua`: "`COPY` from `neovim-build`" | True since `b74634a7` (a view for 24 hours before); the recipe also fetches Lua's archive again for its page; `lpeg.so` and `luv.so` are built for this Lua and `-rdynamic` makes it `dso@0` | `Dollyfile-lua`; `neovim-build:31-37` |
| `raylib`, `box3d`: "`gamedev-sdk`, one `sdk.mk`" (and "a `libm.a` the package already leaves out") | True; and: the SDK retains both source trees for the agents, Slopyard builds its own Box3D with `-pthread` and SSE defines from the SDK's source tree, the SDK's `libbox3d.a` has no consumer, `libm.a` is still in `gamedev-sdk` | §3.3 |
| "`nvim` needs five static libraries in its base" | True: Lua, LPeg, luv, utf8proc, tree-sitter exist only as `.a`; also CMake, libuv (for luv), and `text-page` on another base | §3.10 |
| "`display` needs Zig" | True (`ghostty-build:18`); also `libghostty-vt.a`, uucode, stb_truetype, the font, and a `--dolly-kernel-plugin` link | `Dollyfile-ghostty-build:20-24, 85-94` |
| "`rust` and `cargo` come out of one recipe that replaces the seed compiler in place twice" | True (`rust-build:64-73`); also `/opt/rust-llvm` by `COPY` from `rust-llvm` (`:15`) and `posix` installed for `cmp` (`:17`) | `demos/rust/Dollyfile-rust-build` |
| "`codex` and `pi` need protox and `tsc` in their base" | True: `codex-build:11, 21`; `pi-build:11, 29`; `pi-build` also needs `patch`, `make`, `janis` | the two recipes |
| "`docs/dollyfile.md` … and the rule of 2026-10-12 … recommend views" | Partly: the doc lists the three shapes without rank (`:289-293`); the task ranks ("Cheapest shape first", `:43-44`) | §1.1, §1.2 |
| `llvm-runtimes` "if it is one" | Not a view: it holds its build | `demos/llvm/Dollyfile-llvm-runtimes` |
| "`llama-build`, `local-llm-build`, `speech-build`, `ghostty-build`, `openal-build`, `typescript-build` go" | `typescript-build` has gone (`d8281852`); the rest are as described; `llama-build`'s six archives and `speech-build`'s library are what no package offers today | §3.4, §3.5 |

## 5. What holding its own build would look like, on four cases

Observations, not advice. "Rebuilds" are counted on today's graph (`FROM`, `INSTALL`, `COPY` edges). Sizes are the snapshots in `dist/`. No duration of any of these builds is recorded in `build/image-logs/` (the logs hold no `time`); the durations known are the ones tasks recorded: the eight views of `d237a991` "87 s for the eight", views "2 to 25 s each" (`packages/TASK.md:115`), `quickjs`/`janis`/`typescript` 14.9/4.1/5.2 s, `cmake-build` "1482 s here, alone in the slot" (`more-packages/TASK.md:350-351`), `zero-ad-deps` 284 s.

### 5.a `openal`: a library with a port

Today's rows of `openal-build` with the view's rows appended; the base is `cmake-build` as now:

```text
DOLLY 7
PACKAGE openal
REQUIRES HOST runtime@0                      # the archive stamps nothing; a player links -ldolly-audio itself
FROM    /vX/demos/cmake/Dollyfile-cmake-build <sha>
REQUIRES TOOL cc c++ cmake make ar tar rm    # as openal-build:11-21
SOURCE  /vX/dist/static/openal/source.tar <sha> /tmp/openal/source.tar   # patched tree, licences, the probe
SLOP tar -xf /tmp/openal/source.tar -C /
SLOP cmake -S /tmp/openal/source -B /tmp/openal/build … -DLIBTYPE=STATIC … -DHAVE_PTHREAD=OFF   # openal-build:26-36, unchanged
SLOP cmake --build /tmp/openal/build
SLOP rm -rf /usr/include/AL && cmake --install /tmp/openal/build
SLOP c++ -std=c++17 -O1 /tmp/openal/check.cpp -lopenal -lm -o /tmp/openal/check && /tmp/openal/check
EXPORTS LIB    openal          /usr/lib/libopenal.a
EXPORTS HEADER openal          /usr/include/AL
EXPORTS FOLDER openal-cmake    /usr/lib/cmake/OpenAL
EXPORTS FOLDER openal-licenses /usr/share/licenses/OpenAL
FILE /usr/lib/pkgconfig/openal.pc
```

- **Host modules.** As recorded (`edef36bc`), none beyond `runtime@0`: the library renders to memory; the program that plays links the audio client and is stamped. The other reading (the packages task of 10-12) would apply to a package whose library carried a Dolly backend; such a backend is not in the tree. Under the first reading `default` keeps installing it; under the second it would refuse it as it refuses `llama`.
- **What its users would say.** `zero-ad-deps`: `FROM cmake-build` in place of `FROM openal-build` (`:13`), plus `INSTALL openal`; its probe (`:163-164`) and `pkg-config --exists … openal` (`:159`) work as now, because a toolchain keeps installed files and the package carries `openal.pc`. No other recipe changes. `openal-build` goes; the demo's `0ad-openal-browser.mjs` reads the probe from `zero-ad-deps`, not from `openal-build`, so it is untouched.
- **Simpler.** One toolchain fewer in the 0 A.D. chain (its `ENTRY` and boot route with it); the OpenAL pin appears once, as an `INSTALL` row in `zero-ad-deps`, instead of as a `FROM`; the view's rows and the build's rows are one file; the probe is compiled once if `zero-ad-deps` drops its copy (its test then reads the package's build, or keeps the copy).
- **More complicated or lost.** Nothing of the language is in the way: `cmake-build` has every tool the build needs, as it does for `sdl2`. The option set is chosen once for everyone, and it is 0 A.D.'s (serial mixer, `-O1`, no backends, no pthread); a program wanting a threaded mixer would be a second package or a change for all, and nothing in the tree asks for one. The patch stays applied at staging, a demo's file (`demos/zero-ad/openal-dolly.patch`), unless it moves with the recipe. No manual page exists upstream (`more-packages/TASK.md:377-378`). No `INSTALL` row arrives anywhere: `openal` installs nothing.
- **Who else could use it.** Nothing links `-lopenal` today but pyrogenesis and the two probes; a session can `amy install openal` already.
- **What would rebuild.** `openal`, `zero-ad-deps` and everything on it: `zero-ad-spidermonkey`, `zero-ad-engine`, `zero-ad`, `pkgconf`, `libpng`, `freetype`, `wine-build`, `wine`, `xonotic-build`, `xonotic` (12 images; `zero-ad-spidermonkey` alone is about 15 minutes by the zero-ad investigation).

### 5.b `raylib` and `box3d` out of `gamedev-sdk`

`sdk.mk` splits into its raylib half (modules, flags, `rtext.c` at `-O0`, the adapter) and its Box3D half (flags, `platform.c`); `libm.a` is a decision of its own (the `raylib` view already leaves it out). The base needs `cc`, `ar`, `make`, `mkdir`, `tar` (`gamedev-sdk:15-20`): `system-build` has them, as `zlib`'s build does.

```text
DOLLY 7
PACKAGE raylib
REQUIRES HOST runtime@0
REQUIRES HOST display@0                      # the adapter's clients, as the view declares
REQUIRES HOST input@0
FROM    /vX/Dollyfile-system-build <sha>
SOURCE  /vX/dist/static/gamedev/raylib.tar <sha> /tmp/raylib.tar
FILE /usr/src/dolly/gamedev/raylib.mk        # sdk.mk:27-31, 41-56, 78-82: five modules, rtext.c at -O0, the adapter
FILE /usr/src/dolly/gamedev/dolly-raylib.c   # gamedev-sdk:228-367
FILE /usr/src/dolly/gamedev/dolly-raylib.h   # :368-398
SLOP tar -xf /tmp/raylib.tar -C / && make -f /usr/src/dolly/gamedev/raylib.mk
EXPORTS LIB    raylib       /usr/lib/libraylib.a
EXPORTS LIB    dolly-raylib /usr/lib/libdolly-raylib.a
EXPORTS HEADER raylib       /usr/include/raylib.h
EXPORTS HEADER dolly-raylib /usr/include/dolly/raylib.h
FILE /usr/include/raymath.h
FILE /usr/include/rlgl.h
FILE /usr/share/licenses/raylib/LICENSE
# FOLDER /usr/src/raylib                      # today retained by the SDK "for the game agents": kept here, or not
```

```text
DOLLY 7
PACKAGE box3d
REQUIRES HOST runtime@0                      # single-threaded, SIMD off, inert platform: today's libbox3d.a
FROM    /vX/Dollyfile-system-build <sha>
SOURCE  /vX/dist/static/gamedev/box3d.tar <sha> /tmp/box3d.tar
FILE /usr/src/dolly/gamedev/box3d.mk         # sdk.mk:32-34, 58-69
FILE /usr/src/dolly/gamedev/box3d-platform.c # :117-227
SLOP tar -xf /tmp/box3d.tar -C / && make -f /usr/src/dolly/gamedev/box3d.mk
EXPORTS LIB    box3d /usr/lib/libbox3d.a
EXPORTS HEADER box3d /usr/include/box3d
FILE /usr/share/licenses/box3d/LICENSE
# FOLDER /usr/src/box3d                       # Slopyard's own build reads /usr/src/box3d/src
```

- **What Slopyard, bhop and a session would say.** `bhop`: `FROM system` with `INSTALL raylib` beside its `janis`, `pi`, `sdl2` rows; it links `-ldolly-raylib -lraylib -lm` as now (`:735`). `slopyard`: `FROM system`, `INSTALL raylib`; for its own Box3D it needs the source tree, which today it reads from the SDK's retained `/usr/src/box3d/src` (`src/box3d.mk:1`): either the `box3d` package keeps `FOLDER /usr/src/box3d` (every installer then holds the tree) or `slopyard` takes `box3d.tar` by its own `SOURCE` row. Both games today read the source trees through their Pi agents (packages task `:95`); a package keeping them or a separate source package are the two forms. A session: `amy install raylib` gives what the view gives today. `gamedev-sdk` goes, or stays as `FROM system` + two `INSTALL` rows + the source folders (a toolchain keeps installed files), which is a composition and compiles nothing.
- **Two users wanting different options.** Yes for Box3D (§3.3): the SDK's build serves nobody but the view, Slopyard's `-pthread` SSE build serves Slopyard. A `box3d` package holding the SDK's build keeps that state; a package holding Slopyard's build would declare `threads@0` (its programs link `-pthread`) and `default` would refuse it; two packages would be two names. For raylib the two games want the same build.
- **Simpler.** `sdk.mk` becomes two Makefiles of about the size of their halves; the game images are no longer `FROM` a library image; one pin per library stays as it is (`source-pins.sh:167-173`); `libm.a` and `math-compat.c` go unless something needs them (the view's measurement says raylib programs do not).
- **More complicated or lost.** Two recipes carry what one carried, each with its `FILE` bodies; the source trees need a home; Slopyard's second Box3D stays Slopyard's or becomes a package of its own; `rtext.c` at `-O0` is a limit of the compiler at the time of writing and is chosen once for everyone (whether still needed: not findable without building); no manual page exists upstream.
- **Who else could use it.** `raylib`: anything drawing in software through the adapter; nothing in the catalog beyond the two games. `box3d`: nothing today.
- **What would rebuild.** `raylib`, `box3d`, `bhop`, `slopyard` (4); `gamedev-sdk` goes or becomes a composition.

### 5.c `libuv` out of `cmake-build`

The 28 rows `Dollyfile-cmake-build:21-48` with the view's rows; the base needs `cc`, `ar`, `make`, `cp`, `tar` (`:14-19`): `system-tools` has them.

```text
DOLLY 7
PACKAGE libuv
REQUIRES HOST runtime@0
FROM    /vX/Dollyfile-system-tools <sha>
SOURCE  /vX/dist/static/neovim/libuv.tar <sha> /tmp/libuv/source.tar    # upstream 1.52.1 (Neovim's pin), patched at staging, Dolly's two C files, the Makefile
SLOP tar -xf /tmp/libuv/source.tar -C /
SLOP make -C /tmp/libuv
SLOP cp /tmp/libuv/libuv.a /usr/lib/libuv.a && cp -R /tmp/libuv/source/include/. /usr/include
FILE /tmp/libuv/check.c                      # cmake-build:27-39
SLOP cc -O0 /tmp/libuv/check.c -luv -o /tmp/libuv/check && /tmp/libuv/check
EXPORTS LIB    uv          /usr/lib/libuv.a
EXPORTS HEADER uv          /usr/include/uv.h
EXPORTS HEADER uv-platform /usr/include/uv
FILE /usr/share/licenses/libuv/LICENSE
```

- **Whose libuv, and Neovim's luv.** Upstream's archive at Neovim's pin, not CMake's bundled copy (§3.2); luv and Neovim link the system `libuv.a` (`neovim-build:78-90`), so with `neovim-build` still `FROM cmake-build` nothing changes for them.
- **What `cmake-build` would say.** `FROM system-tools`, `INSTALL libuv`, then the CMake bootstrap as now (`--system-libuv` finds `/usr/lib/libuv.a`, because a toolchain keeps what it installs); the eleven recipes `FROM cmake-build` are unchanged in text.
- **Would CMake then install the package.** Two forms exist in the tree. The `cmake` package today is a view of `cmake-build` with `INSTALL cc` (a program package "brings what its programs start", packages task `:36-38`); CMake has libuv linked in and needs no file of it at run time, so a `cmake` that stays a view needs no `libuv` row. If `cmake` held its own build, it would need `libuv` for the build alone: as an `INSTALL` row (the inventory's "cmake installs libuv and cc", `inventory.md:47`) every `amy install cmake` would bring `libuv.a` and its headers (618,289 bytes) and the row would stand in the record; as a base (`cmake-build` as the composition above) nothing arrives. That is the build-needs question, and `cmake` is the other agent's.
- **Simpler.** `cmake-build` compiles one thing instead of two; `libuv`'s rows are in one file with its exports; the pin is an `INSTALL` row; `demos/cmake/prepare-sources.sh:3-9` and the staged name `dist/static/neovim/libuv.tar` can follow the recipe.
- **More complicated or lost.** The demo's browser test reads its libuv probes from `cmake-build` (`demos/cmake/test/`), and would read the package; the SIGINT probe failure noted on 2026-10-05 (`more-packages/TASK.md:203-205`) belongs to whoever owns it; whether `libuv.a` built on `system-tools` equals the one built in `cmake-build` (same compiler, same flags) is not knowable without building.
- **Who else could use it.** Neovim (through its base), a session program (`amy install libuv` with `cc`, the amy check), anything else that wants an event loop: nothing in the catalog today.
- **What would rebuild.** `libuv`, `cmake-build`, and its 82 transitive dependents: `cmake`, `sdl2`, `tools-build` and its 22 packages, `neovim-build`, `nvim`, `lua`, `neovim`, `llama-build`, `local-llm-build`, `llama`, `pi-local`, `speech-build` and its two, `openal-build` and the 0 A.D. chain, `mojo-llvm`, `rust-llvm` and the Rust chain, `llvm-tablegen` and the LLVM chain, `wabt`, `tmux`, `dollyfile-studio`: more than half the catalog, including toolchains that never link libuv.

### 5.d `nvim`: one entangled `COPY` package

Today `nvim` is `tools-build` for the page and twelve `COPY` rows from `neovim-build` (`:8-28`). A `nvim` holding Neovim's build needs, at build time: `liblua.a` and headers, `liblpeg.a`, `libluv.a` (built on libuv), `libutf8proc.a`, `libtree-sitter.a`, CMake, libuv, and `text-page` (mandoc) for the page. No base holds all of it: `tools-build` has CMake, libuv and `text-page` and none of the five libraries; `neovim-build` has the five and no `text-page`. Two forms are visible in today's language.

**(i) One recipe holds everything.** `nvim` is `FROM tools-build` and carries `neovim-build:26-253` (seven `SOURCE` rows, six builds, the parsers, about 230 rows) plus the page rows and today's exports; `neovim-build` goes. Then `lua` either holds Lua's build again (`neovim-build:26-57`, 32 rows; Lua 5.1.5 built twice in the catalog, once more than today) or `nvim` installs `lua` for its build, which by the rule makes `lua` a row of `nvim`: `neovim`, `dollyfile-studio` and every `amy install nvim` get `lua` (3,349,279 bytes, `dso@0`, which both images and `default` declare). Licences: the nine folders are then `FILE`/`FOLDER` rows of the package's own build, no `COPY`.

**(ii) The libraries first.** Five packages holding their builds, as `libevent` and `libterminfo` do for `tmux`: `lua` (`FROM system-tools`, `neovim-build:26-57`); `utf8proc` and `tree-sitter` (`FROM system-tools`, `:114-163`, 25 rows each; the 10-12 ruling called them "portable C with one consumer", `:83`); `lpeg` (needs Lua's headers to build: `FROM` a base holding `lua`, or `INSTALL lua`, which is also right at run time for a Lua module); `luv` (needs Lua, libuv and CMake: `FROM cmake-build` holds the last two, Lua by `INSTALL` or another base). Then a base `neovim-build` that is `FROM tools-build` with five `INSTALL` rows and compiles nothing (the `tools-build` pattern, `demos/tools/Dollyfile-tools-build:10-16`), and:

```text
DOLLY 7
PACKAGE nvim
REQUIRES HOST runtime@0
REQUIRES HOST dso@0                          # nvim loads parsers; as today
FROM    /vX/demos/neovim/Dollyfile-neovim-build <sha>    # the composition: tools-build + lua, lpeg, luv, utf8proc, tree-sitter
REQUIRES HEADER lua luv treesitter utf8proc
REQUIRES LIB lua lpeg luv treesitter utf8proc lua-lpeg lua-luv
REQUIRES TOOL cmake text-page gzip tar sh sleep timeout
SOURCE  /vX/dist/static/neovim/neovim.tar.gz <sha> /tmp/neovim/source.tar.gz
SLOP gzip -dc /tmp/neovim/source.tar.gz | tar -xf - -C /
SLOP cmake -S /tmp/neovim/source -B /tmp/neovim/build … -DPREFER_LUA=ON … -DLUA_LIBRARY=/usr/lib/liblua.a   # neovim-build:180-185
SLOP cmake --build /tmp/neovim/build --target nvim && cmake --install /tmp/neovim/build
FILE /tmp/neovim/check.lua                   # :189-209
SLOP timeout 60 nvim --clean --headless -l /tmp/neovim/check.lua
SOURCE  /vX/dist/static/neovim/parsers.tar <sha> /tmp/neovim-parsers/source.tar
… the parsers' rows (:222-250)
SLOP text-page /tmp/neovim/source/src/man/nvim.1
FILE /usr/share/man/cat1/nvim.1
EXPORTS TOOL nvim
EXPORTS FOLDER nvim-runtime   /usr/share/nvim
EXPORTS FOLDER nvim-libraries /usr/lib/nvim
FILE /usr/share/licenses/neovim/LICENSE.txt … (and the libraries' licences: by FILE from the staged archive, or by installing the packages)
```

- **What its users would say.** `neovim` and `dollyfile-studio`: `INSTALL nvim`, unchanged. The licences of the statically linked libraries: today nine `COPY` rows; in (ii) the texts travel with the library packages, which `nvim` does not install (it linked them), so `nvim` carries the texts itself (as `zero-ad` does by `COPY` and `llvm` by `SOURCE`) or installs the five packages, bringing their archives and headers into every installer (sizes unknown; `lua` is 3.3 MB).
- **Simpler.** The twelve `COPY` rows and the `neovim-build` pin written twelve times become declaration rows and one `FROM`; `REQUIRES LIB lua` becomes possible for a consumer; Lua's archive is fetched once (`lua`'s recipe fetches it today only for `doc/lua.1`); each library has one place and one pin; `lua` holds its own build.
- **More complicated or lost.** Form (i): one 260-row recipe and Lua built twice or `lua` a row of `nvim`. Form (ii): five more recipes and at least one more base (`neovim-build` as a composition; `lpeg` and `luv` need Lua at build, so a `lua-build` base or `INSTALL lua` rows); the `lua` package today bundles `lpeg.so` and `luv.so` ("the two modules exist only for this Lua"), which `lpeg` and `luv` packages would take out of it or duplicate; luv needs libuv, which is `cmake-build`'s today (§5.c). In both forms the flags (`-O0` throughout, `-rdynamic`, `LUA_USE_DLOPEN`) are chosen once for everyone; the patch stays applied at staging. The page is formatted on `tools-build` in both.
- **Who else could use it.** `lua`: a session (the amy check); `utf8proc`: NetSurf inside `wine-build` has its own copy (inventory); `tree-sitter`, `luv`, `lpeg`: nothing else today.
- **What would rebuild.** `nvim`, `lua`, `neovim`, `dollyfile-studio` (4), plus the new packages and base; `neovim-build` goes or becomes the composition.

**`display`, in short.** Its own build is `ghostty-build:10-104` with `FROM zig-build` (which has `zig` and `cc`; `make`, `ar` and `tar` come from `system-build`), the two tarballs, `display.c`, `stb_truetype.h`, the font, the Makefile, and `EXPORTS LIB display`, `ENV DISPLAY`, the `/etc/termcap` body; `ghostty-build` goes, and whether `libghostty-vt.a` and `/usr/include/ghostty` stay exported (today they are, and "the display plugin is its one consumer") is the package's choice. Six tests and scripts name `ghostty-build` (`test/dollyfile-graph.test.mjs:140, 155, 159`, `test/dolly.artifacts.mjs:229`, `test/dollyfile-catalog.test.mjs:18`, `test/host-modules.test.mjs:29`, `test/zig-sdk.artifacts.mjs:22`, `scripts/prepare-image-sources.sh:58, 125, 209`). Rebuilds: 115 images (`display` is in `system-tools`).

## 6. What could not be found out without building, or asking the owner

- The build time and peak memory of `openal-build`, `gamedev-sdk`, `cmake-build`'s libuv half, `neovim-build`, `speech-build`, `llama-build`, `zig-build`, `ghostty-build`: no log holds a duration; only `zero-ad-deps` and the javascript split were timed.
- Whether a view's build (restoring a 240 MB base to keep 34 paths) costs more or less than a `COPY` of selected paths: not measured anywhere (the copy investigation's open point).
- What `zero-ad-deps` declares `audio@0` for, since its OpenAL probe links no audio client; whether sealing would fail without it.
- Whether raylib's `rtext.c` still needs `-O0` on today's compiler, and whether a program linked with Slopyard's `-pthread` Box3D or the SDK's serves bhop: bhop uses neither.
- Whether `libuv.a` built `FROM system-tools` is byte-identical to the one built in `cmake-build`, and whether CMake's bootstrap would differ on a composed base.
- Whether any program needs `libghostty-vt.a` besides `libdisplay.so`, and whether the kernel-plugin link has requirements a package base lacks (AGENTS.md: "a separate internal contract").
- The sizes of the five Neovim libraries' archives and of llama.cpp's six (the snapshot manifests list paths without sizes); hence what an `INSTALL` of them would add to an installer.
- Why `llama-build` and `local-llm-build` are two images (`2a14ff91` says nothing), and why `gamedev-sdk` holds Box3D when the game that uses Box3D builds its own.
- What "leaves an expensive builder as it is" was meant to say (`docs/dollyfile.md:292`), and whether the 10-05 and 10-12 rulings ("one consumer", "portable C … stays") still stand for the owner after his words of 10-13.
- Whether the owner wants a build base per set of tools (`tools-build`'s pattern) or a way for a package to name a build-only need: the open question of [build-needs](../20261013-144754-build-needs/TASK.md), which every case in §5 meets.