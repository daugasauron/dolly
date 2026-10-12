# Everything that makes sense is a package amy installs

- STATUS: OPEN
- PRIORITY: 305
- TAGS: packages,amy,images

Owner (2026-10-12): "Break out everything (that makes sense) into packages
that are installable with amy."

Done when: the list is here with a decision per row, the packages exist,
install into `default` with `amy`, and run.

This task also holds what was left of
[`package-needs`](../20261007-003116-package-needs/TASK.md),
[`lean-game-images`](../20260930-231300-lean-game-images/TASK.md) and
[`qwen-shards`](../20261008-234448-qwen-shards/TASK.md), which are closed into
it: see "Held for a catalog round".

## What makes sense

Written down once, so that the next recipe has a rule to follow:

- A **program** is a package when a person or an agent in a session would run
  it by name: a build tool, an interpreter, a compiler, an editor, an agent.
- A **library** is a package when a program outside its own build would link
  it and building it here took a port: Dolly's glue, a platform file, a
  patch (`sdl2`, `libuv`, `raylib`, `box3d`, `curl`'s libcurl). Portable C
  that `cc` compiles from upstream's archive in seconds stays where its one
  consumer builds it (utf8proc, tree-sitter, LPeg as an archive), until a
  second image uses it: "the same `COPY` rows in two recipes are a missing
  package" (`docs/dollyfile.md`).
- A **data set** is a package when two images hold it or a session would
  fetch it (the models).
- A **library package installs no compiler** (ruling of 2026-10-07, `zlib`
  and `sdl2`); a **program package brings what its programs start** (`rust`,
  `cmake` and now `zig` install `cc`).
- Not a package: a demo's own program and data (a game is opened at its
  route, and those here need `gpu@0` or `audio@0`, which `default` does not
  declare, so `amy` would refuse them by name); a build stage (`*-build`,
  `rust-llvm`, `llvm-tablegen`); a host-module set without files (`gpu-sdk`,
  `audio-sdk`: a package cannot add a module to a booted image).
- Cheapest shape first: a thin `PACKAGE` over the image that builds the
  program (`FROM` and `EXPORTS`) adds no image input and rebuilds nothing.

## The list (every recipe, 2026-10-12, main `caf7ed97`)

What each image builds and keeps, the package that offers it, and the
decision for what no package offered. Sizes are the files' bytes in the
built snapshots (`build/packages-evidence/snapdu.mjs`, scratch).

### Core

| Built in | Keeps | Package | Decision |
| --- | --- | --- | --- |
| `system-build` | compiler, headers, libc, libc++, every host client library and header (GPU, audio, microphone, buttons, …) | `cc` | offered |
| `system-build` | Slop and 19 commands, `tar` among them | `core` | offered |
| `system-build` | GNU Make (385 KB) | `cc`, and **`make`** | new: Make without the 126 MB compiler, for rules that compile nothing |
| `system-build` | `/bin/dollyfile` | `amy` | offered |
| `system-tools` | sbase's 44 tools, awk, find, xargs and the like, `sh` | `posix` | offered |
| `system-tools` | Git, its HTTP helpers, diff, patch | `git` | offered |
| `system-tools` | Samurai as `ninja` (133 KB) | **`ninja`** | new |
| `system-tools` | `download`, `upload` (60 KB) | **`transfer`** | new; `default` still copies the four files, see held |
| `system-tools` | `amy` | `amy` | offered |
| `system` | `session-recover` (55 KB) | **`session-recover`** | new |
| `zig-build` | Zig (8.2 MB) and its library (52.2 MB, 1,443 files) | **`zig`** | new; installs `cc`, which compiles the C it emits |
| `ghostty-build` | `libdisplay.so`, the font | `display` | offered |
| `ghostty-build` | `libghostty-vt.a`, its headers | - | stays: the display plugin is its one consumer |
| `gpu-sdk`, `audio-sdk` | nothing of their own: `system` and a `REQUIRES HOST` line | - | stay: their client libraries and headers are in `cc`; a package cannot add `gpu@0` or `audio@0` to a booted image |
| `zlib`, `gzip`, `curl`, `less`, `display`, `dolly-docs` | their own builds | themselves | offered |

No image builds an archiver besides `tar` (in `core`) and `gzip`: nothing to
break out there.

### Demos

| Built in | Keeps | Package | Decision |
| --- | --- | --- | --- |
| `cmake-build` | CMake | `cmake` | offered |
| `cmake-build` | libuv, Dolly's port (313 KB, headers 191 KB) | **`libuv`** | new |
| `neovim-build` | Neovim, runtime, parsers | `nvim` | offered |
| `neovim-build` | PUC Lua 5.1 (2.3 MB), `liblua.a`, headers, `lpeg.so`, `re.lua`, `luv.so` | **`lua`** | new: an interpreter a session runs; the two modules exist only for this Lua |
| `neovim-build` | utf8proc, tree-sitter, `liblpeg.a`, `libluv.a` | - | stay: portable C with one consumer |
| `emacs` | Emacs, etags | itself | offered |
| `typescript-build` | QuickJS, Janis, TypeScript | `javascript` | offered |
| `pi-build` | Pi | `pi-coding-agent` | offered |
| `codex-build` | Codex | `codex-cli` | offered |
| `rust-sdk`, `rust-llvm`, `rust-build` | rustc and its SDK, Cargo | `rust`, `cargo` | offered |
| `rust-build` | ripgrep, fd, protox, cbindgen | themselves | offered |
| `llvm-tablegen`, `llvm-build`, `llvm-cc` | the compiler built in Dolly | `llvm` | offered; the tblgen tools are a build stage |
| `python` | CPython, pip, libffi | itself | offered |
| `sdl2` | SDL2 | itself | offered |
| `gamedev-sdk` | raylib with Dolly's adapter (1.2 MB) | **`raylib`** | new |
| `gamedev-sdk` | Box3D (1.9 MB, headers 245 KB) | **`box3d`** | new |
| `gamedev-sdk` | the sources of both (17.5 MB) | - | stay: what the game agents read |
| `speech-build`, `speech-to-text`, `pi-phone` | `speech-to-text`, `voice` (3.8 MB each), Parakeet (135 MB), Silero VAD | see below | |
| `slopyard`, `bhop`, `classicube-build`, `rts-build`, `gpu-fluid`, `xonotic-build`, `zero-ad*` | the games and their data, Lua 5.5 inside Slopyard, gmqcc | - | stay: demo programs opened at their routes |
| `closed-source-agent` | `anykey`, `secretenv` | - | stay: the demo is the program |
| `dollyfile-studio` | `dollyfile-lint`, `dollyfile-build` | - | stay: they are Studio (`build@0`) |
| `llama-build`, `local-llm-build`, `pi-local` | llama.cpp, `dolly-llama` | - | stay: one consumer, needs `gpu@0` |
| the six model recipes | Qwen3.5-2B, MiniCPM5-2B, Qwen3.5-4B in four shards | themselves | offered; the four shards, see held |
| `openal-build` | OpenAL Soft | - | stays: 0 A.D.'s build stage; its programs need `audio@0` |
| `zero-ad-deps` | pkgconf, libpng, FreeType, Ogg, Vorbis, fmt, libxml2, ICU, libsodium, ENet, Boost headers | - | packages by the rule (`pkgconf` a program; the libraries have a second consumer in Xonotic and Wine, which `COPY` them); not made: this tree cannot stage the image they would be kept from |
| `wine-build`, `wine` | Wine | - | not made here for the same reason |

