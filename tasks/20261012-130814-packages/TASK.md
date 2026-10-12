# Everything that makes sense is a package amy installs

- STATUS: OPEN
- PRIORITY: 305
- TAGS: packages,amy,images

Owner (2026-10-12): "Break out everything (that makes sense) into packages
that are installable with amy."

Done when: the list is here with a decision per row, the packages exist,
install into `default` with `amy`, and run.

State (2026-10-12): the list is below; fifteen packages were made and
tested in Chromium and Firefox, and amy's test now installs and uses the
catalog's packages on `default`, or names the test that does; what is open
is "Left" and "Held for a catalog round". [`package-needs`](../20261007-003116-package-needs/TASK.md),
[`lean-game-images`](../20260930-231300-lean-game-images/TASK.md) and
[`qwen-shards`](../20261008-234448-qwen-shards/TASK.md) are closed into this
task: what they left is under the same two headings.

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
- A **library package installs no compiler** (ruling of 2026-10-07 for `zlib`
  and `sdl2`); a **program package brings what its programs start** (`rust`
  and `cmake` install `cc`, and now `zig` does).
- Not a package: a demo's own program and data (a game is opened at its
  route); a build stage (`*-build`, `rust-llvm`, `llvm-tablegen`); a
  host-module set without files (`gpu-sdk`, `audio-sdk`: a package cannot add
  a module to a booted image).
- Cheapest shape first: a thin `PACKAGE` over the image that builds the
  program (`FROM` and `EXPORTS`) adds no image input and rebuilds nothing.

## The list (every recipe, main `caf7ed97`)

What each image builds and keeps, the package that offers it, and the
decision for what no package offered. Sizes are the files' bytes in the built
snapshots.

### Core

| Built in | Keeps | Package | Decision |
| --- | --- | --- | --- |
| `system-build` | compiler, headers, libc, libc++, every host client library and header (GPU, audio, microphone, buttons, …) | `cc` | offered |
| `system-build` | Slop and 19 commands, `tar` among them | `core` | offered |
| `system-build` | GNU Make (385 KB) | `cc`, and **`make`** | made: Make without the 126 MB compiler, for rules that compile nothing |
| `system-build` | `/bin/dollyfile` | `amy` | offered |
| `system-tools` | sbase's 44 tools, awk, find, xargs and the like, `sh` | `posix` | offered |
| `system-tools` | Git, its HTTP helpers, diff, patch | `git` | offered |
| `system-tools` | Samurai as `ninja` (133 KB) | **`ninja`** | made |
| `system-tools` | `download`, `upload` (60 KB) | **`transfer`** | made; `default` still copies the four files (held) |
| `system-tools` | `amy` | `amy` | offered |
| `system` | `session-recover` (55 KB) | **`session-recover`** | made |
| `zig-build` | Zig (8.2 MB) and its library (52.2 MB, 1,443 files) | **`zig`** | made; installs `cc`, which compiles the C it writes |
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
| `cmake-build` | libuv, Dolly's port (313 KB, headers 191 KB) | **`libuv`** | made |
| `neovim-build` | Neovim, runtime, parsers | `nvim` | offered |
| `neovim-build` | PUC Lua 5.1 (2.3 MB), `liblua.a`, headers, `lpeg.so`, `re.lua`, `luv.so` | **`lua`** | made: an interpreter a session runs; the two modules exist only for this Lua |
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
| `gamedev-sdk` | raylib with Dolly's adapter (1.2 MB) | **`raylib`** | made |
| `gamedev-sdk` | Box3D (1.9 MB, headers 245 KB) | **`box3d`** | made |
| `gamedev-sdk` | the sources of both (17.5 MB) | - | stay: what the game agents read |
| `speech-build` | `speech-to-text` (3.8 MB), with Silero VAD | **`transcribe`** | made; the `speech-to-text` image is `system` and this package |
| `speech-build` | `voice` (3.8 MB) | **`voice`** | made; the `pi-phone` image is `pi-runtime` and this package |
| `speech-to-text`, `pi-phone` | Parakeet TDT-CTC 110M (135 MB), downloaded by both | **`parakeet`** | made: the same rows in two recipes |
| `slopyard`, `bhop`, `classicube-build`, `rts-build`, `gpu-fluid`, `xonotic-build`, `zero-ad*` | the games and their data, Lua 5.5 inside Slopyard, gmqcc | - | stay: demo programs opened at their routes; they become packages with the lean base (held) |
| `closed-source-agent` | `anykey`, `secretenv` | - | stay: the demo is the program |
| `dollyfile-studio` | `dollyfile-lint`, `dollyfile-build` | - | stay: they are Studio |
| `llama-build`, `local-llm-build`, `pi-local` | llama.cpp, `dolly-llama` | - | stay: one consumer, needs `gpu@0` |
| the six model recipes | Qwen3.5-2B, MiniCPM5-2B, Qwen3.5-4B in four shards | themselves | offered; the four shards are held |
| `openal-build` | OpenAL Soft, Dolly's port | - | stays for now: a package by the rule, but its programs need `audio@0`, which no image people install into declares (held, item 6) |
| `zero-ad-deps` | pkgconf (146 KB) | **`pkgconf`** | made: `pkg-config` is what a build asks for a library |
| `zero-ad-deps` | libpng (262 KB), FreeType (903 KB, headers 878 KB), which `xonotic-build` and `wine-build` copy with the same rows | **`libpng`**, **`freetype`** | made |
| `zero-ad-deps` | Ogg, Vorbis, fmt, libxml2 | - | stay: upstream's CMake builds them here unchanged, one consumer |
| `zero-ad-deps` | ICU, libsodium, ENet, Boost's headers (150 MB) | - | stay: one consumer; ICU's data file is 0 A.D.'s, ENet's transport is 0 A.D.'s relay |
| `wine-build`, `wine` | Wine, with GIMP and NetSurf | - | stays: a desktop the image boots into, with files under `/home/dolly` and `/etc`, not a program a session adds |

## Made (2026-10-12, branch `core/packages`)

Each is a thin recipe over the image that builds the program; the fifteen
images built in 2 to 25 s each and no other image changed, except
`speech-to-text` and `pi-phone`, which now install theirs (26 s and 38 s).
The catalog goes from 33 packages to 48 and the domain's index from 32 rows
to 47 (`config/domain-pages-images.txt`); the GitHub Pages site gains `ninja`,
which NumPy needs beside `python` and `cc` there.

| Package | Snapshot bytes | Tested, in Chromium and Firefox |
| --- | ---: | --- |
| `ninja` | 387,072 | on `default`: the command is absent; `amy install`; a build file runs; `man ninja` |
| `make` | 595,184 | absent; install; a rule runs; `cc` is still absent |
| `lua` | 3,454,961 | absent; install; LPeg and luv load and a script prints its result |
| `session-recover` | 291,860 | absent; install; its usage; a missing file fails with status 1 |
| `zig` | 186,887,937 | absent, and so is `cc`; install brings both; the two invocations of `man zig`: a function linked into a C program, and a program with the standard library |
| `transfer` | 294,148 | install into `default`, `amy files` lists `/bin/upload`, `download --help` |
| `libuv` | 746,685 | with `cc`: a timer on a loop compiles, links `-luv` and fires |
| `raylib` | 1,982,270 | with `cc`: a frame is drawn and shown through Dolly's adapter |
| `box3d` | 2,369,945 | with `cc`: a body dropped for sixty steps has fallen |
| `parakeet` | 135,396,361 | install into `default`: the model is there |
| `transcribe` | 140,729,934 | the `speech-to-text` image hears the sample sentence as before; `default` refuses the package, naming `microphone@0` |
| `voice` | 139,491,289 | the `pi-phone` image passes its phone test (Chromium only, as before) |
| `pkgconf` | 420,925 | with `cc`: `pkg-config` does not know libpng until its package is there; `man pkgconf` |
| `libpng` | 1,125,307 | with `cc`: a program compiled and linked with the flags `pkg-config` gives, and run |
| `freetype` | 2,923,260 | with `cc`: the same, and FreeType loads the terminal's font |

- `node test/amy-browser.mjs`: every case passes in both browsers. "amy
  tools" is new (20 s): fourteen packages, each absent from `default`,
  installed alone and used; besides tonight's these are `gzip`, `javascript`,
  `nvim`, `emacs`, `ripgrep`, `fd`, `protox`, `cbindgen` and
  `pi-coding-agent`, which had no check there (`package-needs`: all nine
  work alone), then `dolly-docs` and `transfer`. "amy programs" gains `zlib`
  and the libraries. The file now
  fails, by name, for a package that no case installs, unless its list says
  where the package is tested: a new package comes with its check.
- `node test/site-browser.mjs`, `default-browser.mjs`, `man-browser.mjs`:
  pass in both browsers on the grown catalog.
- `node demos/speech/test/speech-browser.mjs chromium|firefox`: passes;
  "speech packages" is new.
- `node --test 'test/*.test.mjs' 'demos/**/*.test.mjs'`: 424 pass.
- Logs: `build/packages-evidence/` (not committed).

Found on the way:

- `zig --help`, `zig version`, `zig run` and `zig fmt` end in a panic: this
  zig is built with the C backend only. The package's manual page holds the
  two invocations that work, measured in a session; a program with the
  standard library has to name its target, or zig looks for a libc by
  starting a compiler it does not know.
- `zero-ad-deps` was a cache hit here once its one source archive
  (`dist/static/zero-ad-build/deps.tar.gz`, 31 MB) was taken from the
  integration tree; nothing of 0 A.D. was rebuilt.
- `gamedev-sdk` writes a `/usr/lib/libm.a` of thirteen math functions. A
  raylib program links and runs without it, with `-lm` and `-fno-builtin`
  (measured), so the `raylib` package leaves it out and `-lm` in a session
  stays the libc's. The archive can go from `gamedev-sdk` when `bhop` and
  `slopyard` next rebuild.
- `llvm-runtimes` is a package whose description starts "build-only": it is
  in `amy list` and nobody installs it.

## An accident with a shared file (2026-10-13, 00:01 to 00:13 JST)

The snapshots in the worktrees' `dist/` are hard links of one file. Putting a
saved image back into this tree's `dist/` with `cp` wrote through the link:
from 00:01:25 to 00:13:28 `dolly-python-system.snapshot` in `work/rust`,
`work/tmux`, `work/mojo-target` and this tree held the held `python` package
(173,588,803 bytes) under the old metadata. `work/mojo` met the size mismatch
and rebuilt `python` at 00:12:42, to the same bytes as before. The file was
restored through this tree's link from that rebuild: 47,320,780 bytes,
SHA-256 `e43077ab9a258f94…`, which the integration tree's metadata names. Of
the 92 snapshots this tree shares, no other was modified tonight (modification
times and sizes; `default`'s digest too). A test or a build in those trees
that read the `python` image in those twelve minutes failed, or rebuilt it,
for this reason. A snapshot goes into `dist/` by `ln -f` or a rename, never
by `cp`.

## Left (no round needed)

- `xonotic-build` and `wine-build` `INSTALL` `libpng` and `freetype` in place
  of their five and eight `COPY` rows: two image rebuilds (Xonotic's is not
  this tree's to make, Wine's builds Wine, GIMP and NetSurf).
- The model packages installed into `default` were never measured (1.0 to
  1.6 GB each; `package-needs`).
- tmux is another agent's tonight; when it merges, amy's test asks for its
  row.

## Held for a catalog round

The two commits after the cheap part are marked `HELD`. Each is built here
only for the chain it was tested on; merging one changes pins far beyond it,
and in this tree the images behind those pins are stale (with the second,
`amy install rust` answers HTTP 502: its pin cascaded and nothing rebuilt it).

1. **`default` installs `transfer`** (`HELD: default …`) in place of the four
   `COPY` rows from `system-tools`, and is then composed from packages only.
   `zero-ad` is `FROM default`: one more rebuild, of an image this tree
   cannot make. Built: `default` alone, 8 s, 14,380,256 bytes (202 fewer).
   Measured on it, Chromium and Firefox: `default-browser`, `amy-browser`
   (every case), `site-browser`, `man-browser` pass; source suite 424.
   `docs/dollyfile.md` names `default`'s packages and would lack `transfer`:
   the documents are image inputs and were left alone.
2. **`python` installs `cc` and `ninja`** (`HELD: python …`). pip has no
   wheel to fetch for Dolly, so every native package is a source build: by
   the rule above the package brings the compiler and Ninja, and
   `amy install python` is enough for `pip install numpy`. `rust-llvm`,
   `llvm-tablegen` and `zero-ad-spidermonkey` install `python` as a build
   tool, so its pin cascades to 30 of 97 images: the Rust, LLVM, Pi and
   0 A.D. chains. Built: `python` alone, 198 s. What it costs a session:

   | | `python` today | with `cc` and `ninja` |
   | --- | ---: | ---: |
   | snapshot | 47,320,780 bytes | 173,588,803 bytes |
   | `amy install python` on `default`, local server | 0.7 to 0.9 s | 2.6 to 3.0 s |
   | files added | 1,551 | 3,505 |
   | a saved session with it: changes, stored | 47.1 MB, 14.6 MB | 173.4 MB, 49.6 MB |

   Measured on it: `npm run test:demos -- python`, where "python on
   default" is `amy install python` alone with `cc` absent before: Chromium
   200.3 s, Firefox 199.4 s.
   Until the round, `amy install python cc ninja` is what the README, the
   index and the test say, and it works (cheap part).

Designs, not code:

3. **A package names its dependencies instead of holding them** (answers
   `qwen-shards`). Today `INSTALL` inside a package copies the installed
   files into the package's own snapshot:

   | Package | Snapshot | Of which installed |
   | --- | ---: | --- |
   | `cargo` | 499.8 MB | `rust` 463.1 MB |
   | `rust` | 463.1 MB | `cc` 126.3 MB |
   | `llvm` | 253.6 MB | `cc` 126.3 MB |
   | `codex-cli` | 221.0 MB | `ripgrep` 6.2 MB, `fd` 5.7 MB |
   | `cmake` | 214.1 MB | `cc` 126.3 MB |
   | `zig` | 186.9 MB | `cc` 126.3 MB |
   | `pi-coding-agent` | 101.8 MB | `javascript` 28.3 MB, `ripgrep`, `fd` |

   So one package cannot gather what exceeds the 2 GiB an image holds
   (`MAX_SNAPSHOT_BYTES`, one buffer per snapshot). Qwen3.5-4B is 3.01 GB,
   which is why it is four shard packages, and a `qwen3.5-4b` that installed
   the four would be one 3.01 GB snapshot: it cannot be built. The limit is
   real; the four names are not. With dependencies by reference a snapshot
   holds its own files and its `INSTALL` rows, `dollyfile install` installs
   the rows first and skips pins the record holds, and `amy` fetches each
   row's snapshot from `packages@0`. `qwen3.5-4b` is then four rows and a
   description, the shards have none and leave the index, `amy install cargo`
   no longer restores a Rust that is there, and item 2 adds nothing to
   `python`'s snapshot. It changes `src/dollyfile.c`, `src/commands/amy.c` and the
   artifact's receipt: every image rebuilds, one round.
   Until then the four shards stay: Pi's `/local` installs all four itself.
   Removing the model, which the owner named as the alternative, is a
   `pi-local` rebuild that this tree cannot make.
4. **The builds move into the packages** (`lean-game-images`, stage 2).
   `posix`, `git`, `amy`, `ninja`, `transfer`, `make`, `session-recover`,
   `core` and `cc` are views of `system-build`, `system-tools` and `system`:
   83 of 97 images still carry `system-tools`. The inversion is that each
   package holds its build (`FROM system-build`) and `system-tools` installs
   them, as it installs `zlib`, `gzip`, `curl` and `display` today: about
   600 recipe lines move, none are added, one round. A game that never
   compiles is then its own package and a composition (`gpu-fluid`: 161 MB to
   about 11 MB; `minimal` measured 10.4 MB and 0.56 s to a prompt against
   `system`'s 160.4 MB and 2.46 s, 2026-10-05).
5. **The builder supplies the engine** (`lean-game-images`, stage 1), so
   that a composition can be a `FROM` base and `http@0` leaves images whose
   programs do not use it: the kernel, the page and the build scripts, no
   change to the language; a round, one to two days with verification. The
   design is in that task. `gpu-sdk` and `audio-sdk` go when their tests
   open a composition.
6. **`default`'s host list** decides what `amy` can install: it declares
   neither `microphone@0`, `buttons@0`, `audio@0` nor `gpu@0`, so
   `transcribe`, `voice`, and an `openal` or `llama` package are refused
   there by name. Declaring them is a decision about what the page people
   open may ask the browser for, the owner's to make; it rebuilds `default`
   and `zero-ad`.
7. **A failed start names the package** (`package-needs`). `git commit`
   without `-m` says `cannot spawn vi`, and pip without a compiler says
   `Unknown compiler(s)`. Slop's `command not found` could name the package
   from the index's `TOOL` rows; that is `src/slop.c`, the seed. The pager
   half is done (`c6e8ac47`: Git prints straight through without `less`).
