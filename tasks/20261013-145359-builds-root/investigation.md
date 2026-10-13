# The base images and their views: the investigation

Read at `/home/daug/dev/dolly/work/rust` (`integrate/round-1013`, head `96832f4d`, 2026-10-14; the same commits as `main`). Nothing was built or run. Every number comes from `git`, `grep`, two scratch scripts over the recipe text (a `FROM`/`INSTALL`/`COPY` graph and a per-source pin cascade), the files, and the snapshot sizes in `work/rust/dist/`. Line numbers are of this tree unless a commit is named. Quotes are marked. No verdict is given.

## Summary (findings, no advice)

1. The three-way cut `system-build` / `system-tools` / `system` is five weeks old and has kept its shape since `2c441d4b` and `c4a8cc6d` (2026-09-13, both without a message body). `system-build` was born four days earlier (`192833e2`) to break a cycle: its comment read "Bootstrap independently of system, which imports the source-built Rust tools."
2. sbase, Git, awk and Samurai sit in `system-tools` by one explicit decision, `6d533a7e` (2026-09-30): "sbase builds the remaining utilities in system-tools, so system-build stays the compiler and basic build commands." It reverted `0b6d11ec` of the same day, which had put sbase in `system-build` "right after make". Every record since repeats the placement as given (more-packages 10-05: "packaging them is stage 2 of the lean base, with a catalog rebuild").
3. The bootstrap order that the recipes force is short: seed → engine → `cc`/`c++`/`ld`/`ar` → Slop → 18 commands → `tar` → Make → libc++. Everything `system-tools` builds needs only those tools plus `zlib`/`curl` for Git and sbase's own `ln` for `/bin/sh`; sbase is `system-tools`' first step, so that is proven for sbase and read for the rest.
4. Counted over 130 recipes: `system-build` 10 direct `FROM`, 119 transitive, 126 by any pin (`FROM`, `INSTALL` or `COPY`); `system-tools` 23 / 101 / 113; `system` 21 / 31 / 51; `cmake-build` 11 / 47 / 82; `tools-build` 22 / 22 / 25. At the reflection's tree (133 recipes) the same counts are 122 / 130 and 104 / 117, so "104 of 133" and "122" are the transitive-`FROM` figures.
5. A change to one core command's source (`cat.c`, `help.c`, `test.c`) repins 127 images; to Git's archive, `amy.c`, `xargs.c` or sbase's pin 114; to `session-recover.c` 52; to libuv or CMake 83; to `nena.c` 2; to any seed file (the engine, a header) all 130. Four single-command changes of that kind landed in the last 14 days (`ls -l`, `touch -t`, `test -x`, `help` at 80 columns), each a catalog repin.
6. The views: `core`, `cc`, `make` of `system-build`; `posix`, `ninja`, `git`, `amy`, `transfer` of `system-tools`; `session-recover` of `system`; `cmake`, `libuv` of `cmake-build`; `zig` of `zig-build`. `default` installs eight packages. `git`, `make`, `less`, `session-recover`, `zig`, `cmake` and `libuv` are installed by no recipe.
7. The inventory's claims are mostly true. "Needs Make before a package can exist" is partly true (`ps` and `nena` need none; Make is built by `cc` rows; its only consumer inside the root is libc++, since 2026-10-08). "`rust-build` never sees `system-tools`" is true of its `FROM` chain and false of its pins and files (`INSTALL posix`, `COPY` from `rust-llvm`). "No base holds pkg-config" is false (`zero-ad-deps`, a toolchain with five `FROM` dependents, builds and keeps pkgconf).
8. Written out, a `git` package holding its build is `FROM system-build` with `INSTALL zlib` and `INSTALL curl`; since `2283e960` those two rows arrive with `amy install git` (zlib adds 275 KB; `default` already holds curl). A Git patch would then repin `git` plus its installers: 1 today, 114 again if `system-tools` keeps installing it.
9. `cmake-build` as a composition meets a cycle (`cmake` is `FROM cmake-build` and installs `cc`), so `cmake` would hold its build `FROM system-tools`, and `cmake-build` would restore `cc`'s 126 MB by `INSTALL` over the identical files it already holds from `system-build` (the record skips a row only when it holds it: `docs/dollyfile.md:144-145`; the limit was recorded on 2026-10-05).
10. Not in the record: the reasons for the 09-06/09-09/09-13 splits (no message bodies); the owner's "stable and reusable" sentence (the brief's, not found in `tasks/`); whether Git, Samurai and awk build `FROM system-build` alone (reading says yes: `cc`, `ar`, `mkdir`); any size or time of a split shape.

---

## 1. History

### 1.1 One recipe (DOLLY 1, 2026-08-31)

`9e013dd9`: one `Dollyfile` (`IMAGE default`, 223 lines, 48 `RUN` rows) built, in order, `tar`, 15 commands and `download`, GNU Make (one `cc` row over 38 sources), Zig (a prebuilt `zig.wasm`), Ghostty, QuickJS, Pi, awk, sbase, curl, zlib and Git, each archive by `RUN make -f /usr/src/dolly/startup.mk`. The only other recipe was `Dollyfile-gamedev`. Its doc had `EXTENDS` ("fetches and executes the parent at that exact row"). No message body.

### 1.2 Modules (DOLLY 2, 2026-09-03)

`c4dbe3ad`: `Dollyfile` became `USE HOST /modules/default.dm` plus `ENTRY /bin/slop`, with the comment "The runtime selects one aggregate. Its implementation and dependencies are private to that module rather than repeated as root-level assertions." `default.dm` was 14 `USE` rows, in this order: `bootstrap`, `core-tools`, `download`, `tar`, `make`, `zig`, `ghostty`, `cpp`, `ninja`, `zlib`, `curl`, `git`, `awk`, `sbase`, then thirty re-exports ("This is both a runtime and an SDK"). The `.dm` files for sbase, git, make, awk, ninja and agent-tools were all born in this commit (`git log --diff-filter=A`).

### 1.3 `system`, then `system-build` (2026-09-06 and 09-09)

- `8e270ae4` (09-06, "Separate reusable runtime images from tools and startup policy", no body): `Dollyfile-system` born as `USE default.dm` plus `ENTRY /bin/foreground -i /bin/slop`.
- `192833e2` (09-09, "Ship source-built ripgrep in the shared system image", no body): `Dollyfile-system-build` born as `USE default.dm` plus four `COPY FROM ghostty-build` rows for the display, with the comment: "Bootstrap independently of system, which imports the source-built Rust tools." `system` became `FROM system-build` plus `COPY` of `rg` and `fd` out of the Rust images. So the first root/base split exists to let the Rust chain build on an image that does not copy from the Rust chain.

### 1.4 The three-way cut (2026-09-13)

`2c441d4b` ("Separate compiler builders from the interactive system image", no body, 37 files) and `c4a8cc6d` the same day ("Build CMake and game producers from a headless C and C++ tools image", no body):

- `system-build` became `USE bootstrap.dm, core-tools.dm, tar.dm, make.dm, cpp.dm` with `ENTRY /bin/slop` and no display (`2c441d4b:Dollyfile-system-build`). `cpp.dm` then only unpacked libc++'s headers; the archives were the seed's ("The frontend and genuine Emscripten libc++/libc++abi archives belong to the externally prepared process SDK", `2c441d4b:modules/cpp.dm`).
- `system-tools` was born as `FROM system-build` plus `USE default.dm` plus `ENTRY /bin/slop` (`c4a8cc6d:Dollyfile-system-tools`): the rest of `default.dm` (download, zig, ghostty, ninja, zlib, curl, git, awk, sbase) without a display.
- `system` became `FROM system-build`, `USE default.dm`, the display `COPY` rows and `rg`/`fd`.
- `cmake-build` was born `FROM system-tools` with `libuv.dm`, `posix-shell.dm`, `cmake.dm` and the comment that is still its line 10 today: "Keep the expensive bootstrap reusable across source-build workspaces."

The only recorded reasons are the two subjects and that comment: compiler builders headless, the system image interactive, CMake's bootstrap expensive and reused.

### 1.5 The core/demo split and sbase's placement (2026-09-30)

- `f2186a60`: "The core stays at the top level: the runtime, host modules, minimal POSIX userspace and the system-build, system-tools, ghostty-build, system, default, gpu-sdk and audio-sdk images". `cmake-build` moved to `demos/cmake/`.
- `0b6d11ec` ("Build the POSIX file and text commands from upstream sbase"): "sbase's own unchanged Makefile now builds the file and text commands in system-build, right after make, as one module instead of thirteen. This replaces the in-house ls, cp, mv, cat, echo, touch, pwd, test/[, tail, tee, du, dd, install, printenv, uname and which".
- `6d533a7e`, the same day ("Restore Dolly's core tools before Make and move sbase to system-tools"): "Upstream sbase replaced Dolly-owned tools whose semantics were deliberate (core-tools.dm, make.dm and docs/slop.md at 4340d03): core-tools.dm again builds pwd, the /bin/cd compatibility command, cat [-n], echo, touch, ls [--color[=WHEN]], test and [ (with !, -a, -o and parentheses; -x means a regular file and -r/-w that the path exists, since Dolly has no permission bits), mv and cp with plain cc before make. … sbase builds the remaining utilities in system-tools, so system-build stays the compiler and basic build commands."
- `776c64d4`: "The core chain no longer depends on a Rust image: system stops copying rg and fd. … posix-shell moves into system-tools, so POSIX scripts find /bin/sh in every core image".
- `tasks/20260930-100000-audit-36/TASK.md` (Progress 2026-10-01): the in-house commands "exist for build ordering (`6d533a7`): system-build needs them before Make, and sbase is built later with Make in system-tools. Compiling sbase's single-file tools directly with `cc` in system-build would remove most of them"; and its Note: "`agent-tools.dm` is built in `system-tools` after `sbase.dm`, so build order is not why those seven commands are in-house; … `test/commands.test.mjs` pins in-house behaviour".
- `tasks/20261001-123500-bootstrap-boundary/TASK.md:138-147` ("Fit with audit-36"): "`core-tools.dm` exists because `system-build` needs `ls`, `cp`, `mv`, `test`, `cat`, … before Make, and sbase is built by Make in `system-tools`. With Slop and `cc` available from the second module, a `system-build` recipe can compile sbase's single-file tools plus `libutil`/`libutf` directly with `SLOP cc` … and most of `core-tools.dm`'s 1,180 inline lines can go. That is a separate change". Not done; the task closed with "folding sbase into system-build continues in `20260930-100000-audit-36`", which closed into `userspace-gaps` without it.

### 1.6 The display, the seed boundary and Phase 3 (2026-10-01)

- `10aef56d`: "modules/display.dm copies libdisplay.so, its font and licenses from ghostty-build. system-tools and rust-sdk use it; images built on them inherit it … Every image except system-build and zig-build, which the display is built from, enters foreground -i slop." This is why `INSTALL display` is `system-tools`' last row (`:447`).
- `62bec931`: Slop, the four proxies, `mkdir` and `rm` left the seed for recipes (the slop-and-run investigation holds the record; the owner's request was "the core should be as small as possible, with everything else modular", `bootstrap-boundary:7-10`).
- `5ec4783c` (Phase 3): "61 single-use modules fold into their recipes and the shared ones become packages (zlib, curl, gzip, display, pi-coding-agent, nvim …)". The diff changed 1,979 rows of `Dollyfile-system-build` and 390 of `Dollyfile-system-tools`; `zlib`, `gzip`, `curl` and `display` became `INSTALL` rows of `system-tools` (`:215-217`, `:447`).

### 1.7 The views (2026-10-05 to 10-13)

| When | Commit | What, in its own words |
| --- | --- | --- |
| 10-05 | `8bfcd884` | "cmake: CMake kept from cmake-build (FROM and EXPORTS only)"; the doc gained "A package holds its build … or keeps the outputs of the toolchain that built them, with `FROM` and only `EXPORTS` (`cc`, `cmake`)" (`docs/dollyfile.md:289-293`). |
| 10-05 | `d4ab4f63` | "Every application and toolchain carries 135.5 MB of C/C++ toolchain and the recipe engine because every image starts from system-build. A recipe without FROM keeps only what it installs, so the lean base needs no engine change: core: Slop and its 18 commands, kept from system-build (1.0 MB). cc: … (135.8 MB). amy: amy and the engine it runs, kept from system-tools. minimal: core and display, 10.4 MB against system's 160.4 MB". |
| 10-05 | `tasks/20261005-131645-more-packages/TASK.md:145-148` | "Git, sbase, awk, Ninja, the agent commands: every image built on `system-tools` has them and none wants one alone; packaging them is stage 2 of the lean base, with a catalog rebuild." And: "Lua 5.1 and libuv: private dependencies of Neovim and CMake, one consumer each through `FROM`." Also `:180-183`: "images built on `system-build` hold the files of `core`, `cc` and `amy` without their rows, because they are the builders those packages are kept from." |
| 10-06 | `9d9064b3` | "default was the toolchain image with a start-up script: 160.6 MB, 84% of it the C/C++ compiler. It is now composed from packages … 14.3 MB … Two packages keep what system-tools builds, so the old environment is an install away: posix (sbase, awk, Dolly's find, xargs and the like, sh) and git (Git, diff, patch)." Owner request (`tasks/20261005-222449-small-default`): "merge the default and minimal image, make default smaller and show some startup text describing how to use amy." |
| 10-08 | `5cc9db78` | "The seed no longer carries Emscripten's archives of the three …: the root recipe builds them with the flags of Emscripten's own build … before the first C++ program. … Every recipe is repinned: the root recipe changed." Make's only consumer inside the root dates from here (`Dollyfile-system-build:464`). |
| 10-12 | `d237a991`, `491d2025` | "Each is a thin PACKAGE over the image that already builds the program: no image input is added and no other image rebuilds (87 s for the eight)." `ninja`: "default lost the compiler and Samurai when it became a composition (9d9064b3); cc came back as a package, ninja did not." |
| 10-12 | `tasks/20261012-130814-packages/TASK.md:43-44, 272-281` | "Cheapest shape first: a thin `PACKAGE` over the image that builds the program (`FROM` and `EXPORTS`) adds no image input and rebuilds nothing." Held: "The builds move into the packages (`lean-game-images`, stage 2). … 83 of 97 images still carry `system-tools`. The inversion is that each package holds its build (`FROM system-build`) and `system-tools` installs them, as it installs `zlib`, `gzip`, `curl` and `display` today: about 600 recipe lines move, none are added, one round." |
| 10-12 | `tasks/20261012-230015-audit-fable/packages.md` | Finding 11: "`system-tools` and `system` are one base … `system` adds `/usr/bin/session-recover` and its page, 55,623 bytes". Finding 12: "Smallest first step: on a branch, build `posix` `FROM system-build` with the moved rows and compare `/bin/*` bytes with today's `posix` snapshot; identical bytes prove the move before the round." Under "What is right": "Thin view packages over the builders: zero rebuild cost per new package was what let fifteen land in one night." |
| 10-13 | `4b313b9c` | "tools-build, what the packages are built on: cmake-build with mandoc … A package built FROM it keeps none of it, so the formatter is no row of the package and nothing installs mandoc for a page." |
| 10-13 | `cf5d874c` | "Dollyfile-system-build held 23 C programs in FILE bodies … 1,796 of its 2,248 lines. Each is now src/commands/NAME.c … so every compile row is as it was. … Every recipe that descends from the root is repinned." |
| 10-13 | `ac4c05d3`, `a182787a`, `1240e208`, `2283e960` | `ps` ("a Slop script of the recipe … Images to rebuild: ps (new) and default"); `nena` (changes the seed: "every image is stale"); `default` installs `transfer` in place of four `COPY` rows; by-reference installs ("every image rebuilds"). |

The owner's statements on the chain, as recorded: "the core should be as small as possible, with everything else modular" (10-01); "Make more things into packages, it works really nicely." (10-05); "merge the default and minimal image, make default smaller" (10-06); "Break out everything (that makes sense) into packages that are installable with amy." (10-12); "complete rebuilds is a problem. This is intentional, this way is robust and reliable but changing stuff does mean rebuilding a lot of stuff. That is also why I want to get the core parts right." (10-13, `tasks/20261013-142800-direction/TASK.md:12-16`). The sentence the brief quotes about the core things becoming "stable and reusable" is not in `tasks/` (grep); the lean-game-images task records an earlier owner decision that the small `default` overtook: "games that never compile at runtime may drop the 135 MiB toolchain; developer images keep it" (`:20`).

### 1.8 Why `cmake-build` is a base and CMake not only a package

- The base came first (`c4a8cc6d`, 09-13) with its reuse comment; the package came 22 days later as a view (`8bfcd884`), measured at 87,925,226 bytes against the base's 248,580,212 (more-packages table).
- Its dependents need CMake and the compiler together in one `FROM` base: 12 recipes `REQUIRES TOOL cmake` (`grep`), all toolchains or packages built `FROM cmake-build` or below it.
- The language reason is recorded on `tools-build` and in the build-needs task: a package's `INSTALL` rows are installed by whoever installs the package, so a build-only tool "cannot be an `INSTALL` row: it would arrive with the library" (`tasks/20261013-144754-build-needs/TASK.md:18-21`); `sdl2`, a package `FROM cmake-build`, would otherwise carry `cmake` and `cc` into its six installers. The 2026-10-12 rule "a program package brings what its programs start (`rust` and `cmake` install `cc`)" (`packages:36-38`) is why `cmake` installs `cc` (`demos/cmake/Dollyfile-cmake:8`).

## 2. What each base is today

### 2.1 The five bases

**`Dollyfile-system-build`** (476 lines; `TOOLCHAIN`; `runtime@0`, `http@0`; no `FROM`, no `ENTRY`). What it holds, in row order:

| Rows | What | Needs |
| --- | --- | --- |
| `:9-35` | 25 `SOURCE` rows for headers the seed already holds (the module-sdks investigation, 1.9) | the broker |
| `:37-74` | 26 `EXPORTS HEADER`, 3 `EXPORTS LIB`, `EXPORTS FOLDER process-sdk`, `clang-headers`, `EXPORTS FILE compiler`, `kernel-plugin-abi` | |
| `:84-91` | `cc`, `c++`, `ld`, `ar`: 4 `SOURCE`, 4 `RUN` of the seed compiler | the seed only |
| `:111-115` | Slop: 1 `SOURCE`, 1 `RUN`, `EXPORTS TOOL slop`, `ENV SHELL` | libc and `runtime.h` (`:108-109`) |
| `:120-228` | 18 commands (`foreground help man pwd cd cat echo touch clear ls stat file test [ mv cp mkdir rm`): 18 `SOURCE`, 18 `SLOP cc`, 18 `EXPORTS TOOL` | Slop and `cc` |
| `:232-256` | manual pages: `mkdir -p`, a Slop `for` over 23 names, a `FILE` body for `test.1`, `cp` for `[.1` | `mkdir`, `cp`, the commands' `--help` |
| `:264-271` | `tar`: `SOURCE`, `SLOP cc`, `EXPORTS`, page | `cc` |
| `:280-408` | GNU Make 4.4.1: `REQUIRES TOOL cp mkdir tar`; 2 `SOURCE` (the archive and `make-amalgamation-dolly.c`); `tar -xf`; `mkdir -p`; 7 `SLOP cc -c` (parts 1-7); 1 link; `EXPORTS TOOL make`; `make --version`; page; `FOLDER /usr/share/man`; licence | `tar`, `cc`, `mkdir`; not Make |
| `:414-476` | libc++, libc++abi, libunwind from Emscripten's pinned source: `REQUIRES process-sdk c++ cc ar make`; 4 `SOURCE`; 2 `tar`; a 31-line `FILE` Makefile; `mkdir`; `make -C /tmp/cpp -j2`; `EXPORTS HEADER cpp`, `LIB c++`, `c++abi`, `ENV CXX` | Make, `c++`, `cc`, `ar` |

Totals: 57 `SOURCE`, 44 `SLOP`, 5 `RUN`, 67 `EXPORTS`, 7 `FILE`. Comments at `:82-83` and `:106-107` still say `COMPILEC`. Snapshot in `dist/`: 127,321,262 bytes (`dist/dolly-images.mjs` names this tree's pin `4b852e08…` 139 times, so the sizes below are of the current chain). Dependents: 10 direct `FROM` (`cc core curl gzip make nena rust-sdk system-tools zig-build zlib`), 119 transitive `FROM`, 126 by any pin: every recipe except `dolly-docs`, `parakeet`, `ps`.

**`Dollyfile-system-tools`** (449 lines; `TOOLCHAIN`; `runtime display input download http upload`; `FROM system-build` `:10`; `ENTRY` `:449`):

| Rows | What | Needs beyond `system-build` |
| --- | --- | --- |
| `:12-94` | sbase `c546c3a5`: `REQUIRES libc ar cc make mv rm tar`; `SOURCE sbase.tar`; `tar`; a 12-line `FILE dolly.mk` naming 44 tools and `include Makefile`; `make -C /tmp/sbase -f dolly.mk CFLAGS=-O2 ARFLAGS=rc RANLIB=:`; 44 `EXPORTS TOOL`; licence; `rm` | nothing (sbase's Makefile rules run `$(CC)`, `$(AR)`, `$(RANLIB)`, `rm`, `cp`: read from `dist/static/default/sbase.tar`) |
| `:96-156` | `download`, `upload`: two `FILE` C bodies, `cc`, `EXPORTS`, pages | `download.h`, `upload.h` (seed) |
| `:163-214` | Samurai 1.3 as `ninja`: 2 `SOURCE` (archive, `samurai-unit-dolly.c`); a 29-line `FILE` Makefile (13 parts, part 12 at `-O0`); `tar`; `make`; `EXPORTS ninja`; `cp samu.1`; licence | nothing (`cc`, `cp`) |
| `:215-217` | `INSTALL zlib`, `gzip`, `curl` | |
| `:218-354` | Git 2.55.0: `REQUIRES mkdir`, `LIB curl z`, `HEADER curl zlib`; `SOURCE git.tar`; `tar`; `FILE /etc/gitconfig`, `/home/dolly/.gitconfig`; a 100-line `FILE` Makefile (`CPPFLAGS` of 40 `-D` flags, `-O0` "optimized for deterministic browser cold-build latency", `DEFAULT_PAGER="$(command -v less \|\| command -v cat)"`); `make`; `EXPORTS git`; `--version`; page; 2 `FILE` helpers; `FOLDER` templates; licence; `rm` | `zlib`, `curl` (its Makefile runs `mkdir -p`, `cc`, `ar`) |
| `:355-384` | awk: `SOURCE awk.tar`; `tar`; a 10-line `FILE` Makefile (`maketab` then `proctab.c`); `make`; `EXPORTS awk`; licence; `rm` | nothing |
| `:388-440` | 16 commands: `REQUIRES TOOL git` (`:388`, because `diff` and `patch` run it); 18 `SOURCE` (`run-program.h`, 16 `.c`, `version.h`); an 8-line `FILE` Makefile (`NAMES := install du rev command xargs find env time timeout realpath diff patch hostname tty nproc amy`, each `cc -O2`, each page from `--help`); `make`; 16 `EXPORTS TOOL`; `rm` | nothing |
| `:442-446` | `ln -s slop /bin/sh`; `EXPORTS sh`; page; `FOLDER /usr/share/man` | sbase's `ln` |
| `:447` | `INSTALL display` | |

Totals: 23 `SOURCE`, 27 `SLOP`, 66 `EXPORTS`, 15 `FILE`, 4 `INSTALL`. Snapshot 150,959,744 bytes (23,638,482 more than `system-build`). Dependents: 23 direct `FROM`, 101 transitive, 113 by any pin. Not in its pin closure: `cc core curl display dolly-docs ghostty-build gzip make nena parakeet ps rust-sdk system-build zig zig-build zlib`.

**`Dollyfile-system`** (27 lines; `TOOLCHAIN`; adds `snapshot@0`; `FROM system-tools` `:11`): 3 `SOURCE`, `cc -O1 … -o /usr/bin/session-recover` (`:21`), `EXPORTS TOOL`, page, `rm`, `ENTRY`. `REQUIRES libc cc rm` only (`:13-15`). Snapshot 151,004,084 (44,340 more than `system-tools`; the audit measured 55,623 on 10-12). Dependents: 21 / 31 / 51.

**`demos/cmake/Dollyfile-cmake-build`** (100 lines; `FROM system-tools` `:11`): libuv 1.52.1 (`SOURCE :21`, `tar`, `make -C /tmp/libuv :23`, two `cp :24-25`, a `FILE` check program run at `:40-41`, `EXPORTS LIB uv`, `HEADER uv`, `uv-platform :43-45`, licence; needs `make cp tar cc` `:14-19`); CMake 4.4.3 (25 `REQUIRES` rows `:50-74`: `cpp c++ c++abi uv curl z`, tools `c++ sh gzip mkdir cat dirname diff echo false grep printf pwd sed test tr true uname which`; `SOURCE :76`; `gzip -dc | tar :77`; a 12-line `FILE build.slop` running upstream's `bootstrap --system-libuv --system-curl --system-zlib` at `-O0` and `make cmake` `:79-91`; `slop -e :92`; `EXPORTS TOOL cmake`, `FOLDER cmake-data :94-95`; licence); `ENTRY :100`. Snapshot 239,173,097 (88,213,353 more than `system-tools`). Dependents: 11 direct (`cmake libuv llama-build llvm-tablegen mojo-llvm neovim-build openal-build rust-llvm sdl2 speech-build tools-build`), 47 transitive, 82 by any pin.

**`demos/tools/Dollyfile-tools-build`** (49 lines; `FROM cmake-build` `:16`; `INSTALL mandoc` `:17`): compiles nothing; writes `/usr/bin/text-page`, a 7-line Slop script over `mandoc -T utf8 | awk` (`:29-36`), exports it, checks a page with a non-ASCII letter (`:40-47`), `ENTRY`. Its comment (`:10-15`) is the record of the build-needs problem. Snapshot 239,927,344. Dependents: 22 direct (every `demos/tools/` package but `mandoc`, `toybox`, `base64`, `vi`; plus `lua`, `nvim`, `tmux`, `meson`, `wabt`, `flex`, `yacc`), 22 transitive, 25 by any pin.

**`Dollyfile`** (`default`, 56 lines; `APPLICATION`; 12 host lines; no `FROM`): `INSTALL core posix display curl amy nena transfer ps` (`:20-27`), `REQUIRES TOOL foreground test echo`, `init.slop`, `.dollyrc` (names `amy install cc`, `git`, `python`), `ENTRY`. Snapshot 14,307,460. Nothing builds on it (`zero-ad` is a root composition of `core posix display curl transfer` plus 13 `COPY` rows).

### 2.2 The views and the other packages on these bases

| Package | Base | Lines | Keeps | Installed by | Snapshot (bytes) |
| --- | --- | ---: | --- | --- | ---: |
| `core` | `system-build` | 49 | `EXPORTS TOOL` ×20 (`slop`, the 18, `tar`), `ENV SHELL`, 20 `FILE` pages | `default`, `zero-ad` | 987,683 |
| `cc` | `system-build` | 30 | compiler, `process-sdk`, `clang-headers`, `libc`, `compiler-rt`, `kernel-plugin-abi`, `cc c++ ld ar make`, `CC CXX AR`, 5 pages, 3 licences | `cmake llvm meson mojo python rust zig` (7) | 126,163,965 |
| `make` | `system-build` | 11 | `make`, page, licence ("the cc package holds the same file") | none | 466,903 |
| `posix` | `system-tools` | 128 | 59 `EXPORTS TOOL` (44 sbase, awk, 13 agent commands, `sh`), 61 `FILE` pages, 2 licences | `default`, `rust-build`, `zero-ad` | 3,327,936 |
| `ninja` | `system-tools` | 11 | `ninja`, page, licence | `meson`, `python` | 258,788 |
| `git` | `system-tools` | 20 | `git diff patch`, `/etc/gitconfig`, 2 helpers, templates, licence, 3 pages | none | 10,134,515 |
| `amy` | `system-tools` | 13 | `amy`, `dollyfile`, 2 pages (`http@0`, `packages@0`) | `default` | 298,744 |
| `transfer` | `system-tools` | 14 | `download`, `upload`, 2 pages | `default`, `zero-ad` | 165,752 |
| `session-recover` | `system` | 10 | the tool, page | none | 163,576 |
| `zig` | `zig-build` | 28 | `zig`, `/usr/lib/zig`, `ZIG_LIB_DIR`; `INSTALL cc` | none | 60,649,882 |
| `cmake` | `cmake-build` | 14 | `cmake`, `cmake-data`, 2 licences; `INSTALL cc` | none | 87,828,405 |
| `libuv` | `cmake-build` | 12 | `uv`, 2 headers, licence | none | 618,289 |

On the same bases but holding a build: `zlib` (`FROM system-build`, 3 `SLOP`, installed by 7), `gzip` (`FROM system-build`, `INSTALL zlib`, by 2), `curl` (`FROM system-build`, 5 `SLOP`, by 4), `nena` (`FROM system-build`, one `cc`; by `default`), `less`, `mandoc`, `llvm-runtimes`, `libevent`, `libterminfo`, `toybox`, `base64`, `vi`, `quickjs`, `janis`, `typescript` (`FROM system-tools`), `sbase` and `tar` (`FROM tools-build`, each unpacking `sbase.tar` for 8 and 1 tools). `display` is a root of four `COPY` rows out of `ghostty-build` (installed by 4). `ps` is a root with a `FILE` script and no `FROM`.

### 2.3 The order the bootstrap needs, with the rows

1. Seed (`dolly.data`): compiler, process sysroot and client archives, 33 headers, `dollyfile.c`, `sha256.h`, `fs-record.h`, `bootstrap`, the kernel-plugin contract (`toolchain/CMakeLists.txt:83-96`).
2. `bootstrap` compiles `/bin/dollyfile` with the seed compiler (`src/process/bootstrap.c:37-57`) and runs `/etc/dolly/recipe.locator` (`:103-114`). Comment `:35-36`: "The engine is the only program compiled before the root recipe runs; the recipe builds everything else, with COMPILEC until Slop exists."
3. `cc c++ ld ar` by `RUN` of the seed compiler (`system-build:88-91`): no shell exists.
4. Slop by `RUN` (`:112`); from here `SLOP` works (`docs/dollyfile.md:128-132`).
5. 18 commands by `SLOP cc` (`:138-210`): the first `mkdir`, `cp`, `rm` the recipe can use come here (the 2026-10-01 table: "`make.dm` needs `mkdir`; `core-tools.dm`, `tar.dm`, `cpp.dm`, `session-recovery.dm` need `rm`", `bootstrap-boundary:66`).
6. Pages: `mkdir -p` and a Slop `for` (`:232-238`); `cp` (`:256`); `rm` (`:258`).
7. `tar` by `cc` (`:265-267`): the first archive can be unpacked after this.
8. Make: `tar -xf` (`:287`), `mkdir` (`:290`), eight `cc` rows (`:293-392`); `REQUIRES TOOL cp mkdir tar` (`:280-282`).
9. libc++: `tar` ×2, a Makefile, `make -C /tmp/cpp -j2` (`:425-464`); `REQUIRES TOOL make` (`:418`). The first C++ link is possible after this.
10. `system-tools`: sbase by `tar` and `make` (`:21-42`; sbase's own rules need `cc ar rm cp`, `dolly.mk` needs `mv`); `download`/`upload` by `cc` with seed headers; Samurai by `make`; `zlib`, `gzip`, `curl` (each `FROM system-build`: `zlib` `make ar cc tar`, `gzip` `cc` and zlib, `curl` `make tar cc ar` and `http.h`); Git by `make` with `-lz -lcurl`; awk by `make`; the 16 commands by `make` (`cc`); `sh` by sbase's `ln`; `display` (a `COPY` out of `ghostty-build` ← `zig-build` ← `system-build`: Zig needs `cc tar`; Ghostty needs `zig make ar cc tar` and `display.h`, `input.h`).
11. `system`: `session-recover` by `cc` (`REQUIRES cc rm` only).
12. `cmake-build`: libuv by `make cp tar`; CMake's bootstrap by `sh`, `c++`, `gzip`, `diff` and 14 sbase tools (`:57-74`).
13. `tools-build`: `mandoc` (`FROM system-tools`, `INSTALL zlib`, needs `awk cc cp grep gzip make mkdir tar`); `text-page` needs `basename awk mandoc test`.

What nothing below `system-build` needs from `system-tools` to build: `system-tools`' own builds. The tools its `REQUIRES TOOL` rows name are `ar cc make mv rm tar mkdir` (`system-build`'s), `ln` (sbase's, for `sh`), `git` (its own, for `diff`/`patch`). Git's Makefile uses `$(file <…)` (Make's), `mkdir -p`, `cc`, `ar`; Make's recipe shell is `/bin/slop` (`EXPORTS ENV SHELL`, `system-build:115`), and `/bin/sh` is made last (`:443`). None of its archives is gzipped.

## 3. Counted

**Of 130 recipes** (20 applications, 33 toolchains, 77 packages; `scripts/recipe-files.mjs`):

| Base | Direct `FROM` | Transitive `FROM` | By any pin (`FROM`+`INSTALL`+`COPY`) |
| --- | ---: | ---: | ---: |
| `system-build` | 10 | 119 | 126 |
| `system-tools` | 23 | 101 | 113 |
| `system` | 21 | 31 | 51 |
| `cmake-build` | 11 | 47 | 82 |
| `tools-build` | 22 | 22 | 25 |
| `zig-build` | 2 | 2 | 118 (through `display`) |
| `rust-build` | 5 | 5 | 24 |
| `zero-ad-deps` | 5 | 5 | 10 |

At the reflection's tree `d89bca74` (133 recipes; extracted with `git archive`, same script): `system-build` 10 / 122 / 130, `system-tools` 20 / 104 / 117, `system` 25 / 35 / 56, `cmake-build` 11 / 47 / 82, `tools-build` 22 / 22 / 25.

**Installed by `default`**: `core posix display curl amy nena transfer ps` (8). Most-installed packages catalog-wide: `zlib` 7, `cc` 7, `janis` 6, `sdl2` 6, `python` 5, `display` 4, `curl` 4, `posix` 3.

**What a change to one file repins** (pin closure from the recipe that `SOURCE`s it, the recipe included; seed files change the image build ID instead):

| File (staged path) | Pinned by | Images |
| --- | --- | ---: |
| `src/commands/cat.c`, `foreground.c`, `cc.c`, `tar.c`, `src/slop.c`, `make-4.4.1.tar`, `libcxx.tar`, the musl licence | `system-build` | 127 |
| `src/commands/amy.c`, `xargs.c`, `git.tar` (a Git patch), `awk.tar`, `samurai.tar` | `system-tools` | 114 |
| `sbase.tar` (sbase's pin) | `system-tools`, `sbase`, `tar` | 114 |
| `src/commands/session-recover.c` | `system` | 52 |
| `src/commands/gzip.c`; `src/libcurl-fetch.c`; `zlib.tar` | `gzip`; `curl`; `zlib` | 116; 116; 117 |
| `ghostty.tar`; `zig.tar` | `ghostty-build`; `zig-build` | 117; 119 |
| `libuv.tar`, `cmake.tar.gz` | `cmake-build` | 83 |
| `mandoc-1.14.6.tar.gz` | `mandoc` | 27 |
| `src/commands/nena.c` | `nena` | 2 |
| `src/dollyfile.c`, any `include/dolly/*.h` or `host/*/*.h`, a client, a WAT | the seed | 130 |

Examples of each in the last 14 days: `83a116a5` (`help.c` at 80 columns: "the catalog is repinned"), `5eafdf7e` (`test -x`), `b97bddd3` (`touch -t`), `b1244f1d` (`ls -l`), `5cc9db78` (libc++) on the root; `c6e8ac47` (Git's pager), `7ae80700` (amy's index) on `system-tools`; `276e0187` (display cursors) through `display`'s pin in `system-tools:447`; `2283e960`, `a182787a`, `706afa45` on the seed.

## 4. The claims, checked

**Inventory.**

- "`system-build` holds the seed's compiler, Slop, 19 commands, `dollyfile`, libc++ and Make; `core`, `cc` and `make` are views of it." **True.** 18 commands plus `tar` (`:138-210`, `:265-267`); also the four proxies and 26 header exports. The three packages have `FROM system-build` and only `EXPORTS`/`FILE` rows.
- "the bootstrap root, which needs Make before a package can exist." **Partly.** `ps` has no `FROM` and no build; `nena` is `FROM system-build` and uses `cc` alone; `zlib`, `curl`, `gzip` use Make or not. Make itself is built by eight `cc` rows (`:293-392`) and needs no Make. Inside the root, Make's one consumer is libc++ (`:464`), since `5cc9db78` (10-08); before that the root only ran `make --version`. Outside, 55 recipes `REQUIRES TOOL make`.
- "`system-tools` compiles sbase, Samurai, Git, awk and 16 Dolly commands and installs `zlib`, `gzip`, `curl` and `display`; `posix`, `ninja`, `git`, `amy` and `transfer` are views of it." **True**, plus `download` and `upload` from `FILE` bodies (`:99-156`) and the `sh` link. `less`, `mandoc`, `llvm-runtimes` and seven others are also `FROM system-tools` and hold builds.
- "One Makefile there builds 16 commands for three packages." **True**: `NAMES` at `:411`; `posix` exports 13, `git` 2 (`diff`, `patch`), `amy` 1.
- "104 of 133 images are built on it." **True** at `d89bca74` as transitive `FROM`; 101 of 130 here; 117 of 133 (113 of 130) by any pin.
- "`cmake-build` compiles libuv and CMake; 11 recipes are `FROM` it." **True** (`:21-48`, `:50-98`; 11 direct in both trees).
- "a base installs and compiles nothing, a package holds its build" as the proposed shape. A proposal; section 5 writes it out. One base of that shape exists (`tools-build`, which writes one script); its own base compiles two things.
- "`rust-build` never sees `system-tools`." **Partly.** Its `FROM` chain is `rust-sdk` → `system-build` (`demos/rust/Dollyfile-rust-build`); it `INSTALL`s `posix`, whose files are `system-tools`' build products and whose pin follows `system-tools`', and `COPY`s `/opt/rust-llvm` out of `rust-llvm`, which is `FROM cmake-build` → `system-tools`. It is in `system-tools`' pin closure. The consequence drawn, "nothing holds Rust with Python and `patch`": `zero-ad-spidermonkey` (a toolchain `FROM zero-ad-deps`, `INSTALL python cargo cbindgen`, `:17-20`) holds all three; nothing is `FROM` it (it is a `COPY` source).
- "no base holds pkg-config." **False** for toolchains: `zero-ad-deps` builds pkgconf and has five `FROM` dependents; `pkgconf` is its view. **True** of the five core bases (grep: `pkgconf`/`pkg-config` appear in eight `demos/zero-ad/` recipes only).
- "Whether Samurai, Git and awk build with `system-build`'s tools alone … not run." Confirmed by reading (section 2.3); not run here either.
- "sbase 3× (`sbase`, `tar`): one archive, three tool lists." **True** (`sbase.tar` in three recipes; 44, 8 and 1 tools, disjoint).

**Reflection, section 5.**

- "`system-tools` has 104 `FROM`-descendants of 133 (`system-build` 122)." **True** at its tree, as transitive `FROM`. By pins: 117 and 130.
- "it holds sbase, git, awk, samurai, sixteen commands, download and upload in 449 lines, and `INSTALL display` at `:447`, so the terminal emulator is an input of every compiler build." **True** of the rows; `display`'s pin reaches 115 images (its four installers' closures), every `FROM system-tools` descendant among them. `ghostty-build` and `zig-build` are the two compiler images it does not reach.
- "`posix`, `git`, `ninja`, `transfer`, `amy` are views of it; `system` is `system-tools` plus one `SLOP`." **True; partly**: `system` has three `SLOP` rows and three `SOURCE` rows for one program (`:17-25`).
- "Twenty views over twelve builders." The copy investigation reproduced 20 under a stated rule (its §3.4); its list names 11 distinct builders.
- "`zero-ad-deps` has five `FROM`-descendants and fifteen `COPY` rows into it from `wine-build` and `xonotic-build`." **Partly**: 5 is right; the 15 rows are `wine-build` 8, `xonotic-build` 5, `xonotic` 2 (copy investigation §3.1).
- "The counter-example is in the tree: `demos/tools/` packages each hold their build and `tools-build` is a composition." **Partly**: 20 of the 24 `demos/tools/` packages hold a build (`sbase` and `tar` re-unpack an archive `system-tools` also builds from); `tools-build` compiles nothing and writes a script; it is `FROM cmake-build`, which compiles libuv and CMake.
- "Note that `sbase` is now built twice: in `system-tools:20-42` (viewed by `posix`) and in `demos/tools/Dollyfile-sbase`." **Partly**: three recipes unpack the archive and run its Makefile for three disjoint tool lists; no tool is compiled twice.
- "Invert the base … `system-build` keeps the seed, the compiler and Slop; `sbase`, `awk`, `git`, `ninja`, `transfer`, `amy` are packages `FROM system-build` that hold their builds; `system-tools` is `FROM system-build` plus `INSTALL` rows; `system` is `system-tools` plus `INSTALL display`." A proposal. It omits Make, the 18 commands, `tar` and libc++ from "the seed, the compiler and Slop"; they are the root's rows `:120-476`. `system-tools` already installs `display` (`:447`); `system` adds `session-recover` and `snapshot@0`. The same proposal is stage 2 of lean-game-images (10-05), item 4 of the packages task (10-12) and finding 12 of the audit (10-12); none was built.

## 5. "A base installs and compiles nothing, a package holds its build", on real cases

Observations only. Row counts are from today's recipes. "Rebuilds" are pin closures by the script of section 3.

### (a) `git` holding its build

Today: `Dollyfile-git` (20 lines) is `FROM system-tools` with `EXPORTS TOOL git diff patch` and eight retention rows. The build is `system-tools:218-354` (137 lines) plus `diff.c`/`patch.c` among the 16 (`:401-402`, `:409-417`).

Written out:

```text
DOLLY 7
PACKAGE git
REQUIRES HOST runtime@0
REQUIRES HOST http@0
FROM    /v0.1.3/Dollyfile-system-build <pin>
INSTALL /v0.1.3/Dollyfile-zlib <pin>          # libgit and the helpers link -lz
INSTALL /v0.1.3/Dollyfile-curl <pin>          # git-remote-http(s) link -lcurl
REQUIRES HEADER libc
REQUIRES HEADER curl / zlib; REQUIRES LIB curl / z
REQUIRES TOOL   ar cc make mkdir rm tar
SOURCE  /v0.1.3/dist/static/default/git.tar <sha> /tmp/git.tar
SLOP    tar -xf /tmp/git.tar -C /
FILE    /etc/gitconfig            (body as today)
FILE    /home/dolly/.gitconfig
FILE    /tmp/git/Makefile         (today's 100 lines)
SLOP    CWD /usr/src/git make -f /tmp/git/Makefile
EXPORTS TOOL git
SLOP    git --version;  SLOP git --help > /usr/share/man/cat1/git.1
FILE    /usr/libexec/dolly/git-remote-http;  FILE …-https
FOLDER  /usr/share/git-core/templates;  FILE /usr/share/licenses/git/COPYING
SOURCE  run-program.h, diff.c, patch.c;  SLOP cc -O2 … -o /bin/diff; … /bin/patch
EXPORTS TOOL diff;  EXPORTS TOOL patch;  pages for all three
SLOP    rm -rf /tmp/git /tmp/git.tar /usr/src/git /tmp/agent-tools
```

About 160 rows in one file instead of 20 + 137 + 8 in two. What it needs is all in `system-build` except `zlib` and `curl`, both packages `FROM system-build`. Not needed: sbase, `sh`, `gzip`, Samurai, awk.

- `system-tools` would then say `INSTALL git` (rows `:218-354` and `diff`/`patch` go) if Git is to stay in the toolchains, or nothing. By the recipes, no build needs Git: `REQUIRES TOOL git` appears only in `system-tools:388`, and no `SLOP` row outside `system-tools` starts `git`. `diff` is required by `cmake-build:63` and `llvm-cc`; `patch` by 10 recipes. Whether an opened image's program runs `git` at run time (Codex, Pi, Studio) is not stated by any recipe (the audit's finding 5 marked it "medium").
- `default`: unchanged (it does not install `git`; `.dollyrc:51` says `amy install git`).
- `amy install git` in a session: today restores one 10,134,515-byte snapshot. With the two `INSTALL` rows, "Whoever installs it … installs those rows first … and skips a row its own record holds" (`docs/dollyfile.md:143-145`): `curl` is in `default`'s record at the same pin, `zlib` is not, so `libz.a`, `zlib.h`, `zconf.h` and zlib's licence (275,272 bytes) arrive with Git, which linked them statically. This is the build-needs question (`tasks/20261013-144754-build-needs`), not decided.
- Rebuilds on a Git patch (`scripts/prepare-git.sh` → `git.tar`): today 114. Then: `git` plus its installers' closures: 1 if nothing installs it; 114 if `system-tools` installs it. Rebuilds on a change to `zlib`: today 117; then 117 (`git` joins the closure it was already in through `system-tools`).
- The snapshot: by the retention rules the same files, so about the same bytes; not built.

### (b) `posix` / sbase, and where the bootstrap line runs

The chicken-and-egg does not occur today: sbase's build needs `tar`, `make`, `mv`, `ar`, `cc`, `rm`, `cp` (`system-tools:13-18`; sbase's Makefile rules; `dolly.mk`'s `mv`), all of which `system-build` compiles from `src/commands/*.c` or its own rows before any archive is unpacked: `foreground help man pwd cd cat echo touch clear ls stat file test [ mv cp mkdir rm` (`:138-210`) and `tar` (`:265-267`). The first unpacked archive is Make's (`:287`). So the line already runs after libc++ (`:476`): everything before it is compiled from single C files or from an amalgamation with `cc`; everything after it is upstream archives built by Make. `6d533a7e` drew the line and gave the reason (the in-house tools' "deliberate" semantics); `bootstrap-boundary:138-147` recorded the alternative (compile sbase's single-file tools with `SLOP cc` in the root, "most of core-tools.dm's 1,180 inline lines can go") and it was not taken.

A `posix` holding its build is `system-tools:12-94`, `:355-384`, `:388-440` minus `diff`/`patch`/`amy`, and `:442-446`, moved under `PACKAGE posix` / `FROM system-build` with the view's 59 `EXPORTS` and 61 `FILE` rows kept: about 250 rows in place of 128 + ~190. Its `REQUIRES TOOL` rows are satisfied by `system-build`. `sh` stays with it: `ln` is sbase's.

- `system-tools` becomes `FROM system-build`, `INSTALL posix`, `zlib`, `gzip`, `curl`, (`git`), `ninja`, `transfer`, `amy`, `display`, `ENTRY`: about 15 rows. A toolchain keeps installed files (`src/dollyfile.c:1401`), so its snapshot holds the same programs.
- Which toolchains need sbase in their base: 12 recipes `REQUIRES TOOL sed`, 11 `grep`, 6 `awk`, 6 `sh`, among them `cmake-build:57-74`. So `cmake-build` or its base installs `posix` either way.
- Rebuilds on an sbase pin change: today 114. Then: `posix` and its installers' closures: `default` (1), `rust-build` (24), `zero-ad` (1), and `system-tools` (113) if it installs `posix`: 114 again. The closure shrinks only where the toolchains stop holding sbase, which their `REQUIRES` rows say they do not.
- `sbase` and `tar` in `demos/tools/` are unchanged by this: they are `FROM tools-build` for `text-page`.
- Lost or moved: the 18 in-house commands stay in the root (sbase's build needs them); the "semantics were deliberate" tests (`test/commands.test.mjs`) stay; `posix`'s 61 page rows stay as they are.

### (c) `make`

Today: built by `cc` from an amalgamation (`system-build:284-392`), needing `tar`, `mkdir`, `cp`; not Make. Its consumer inside the root: libc++ (`:464`, since 10-08). Outside: 55 recipes.

A `make` package holding its build is `system-build:276-408` under `PACKAGE make` / `FROM system-build` (about 120 rows; the view has 11). Then the root's libc++ build cannot run `make` unless `system-build` installs `make`, which is `FROM system-build`: a cycle. What the language allows instead, each visible in the tree: (i) libc++ compiled by `cc` rows or a Slop `for` over its ~70 sources, as Make itself is and as the pages are (`:236-238`); (ii) libc++'s rows leave the root for the `cc` package, which then holds a build (`FROM system-build`, `INSTALL make`, the rows `:414-476`) and whose `INSTALL make` row travels with `amy install cc` (today `cc` already keeps Make: `Dollyfile-cc:4-6`); (iii) a root in two images, the second `FROM` the first with `INSTALL make`. Before `5cc9db78` none of this arose: libc++ came from the seed's archives.

- Rebuilds on a Make change: today 127. Then: `make` and its installers' closures; with every toolchain requiring Make, whichever base installs it carries its closure (114 for `system-tools`, 127 for a root that installs it).

### (d) `cmake-build` as `INSTALL libuv`, `INSTALL cmake`

Today `cmake` and `libuv` are views `FROM cmake-build`; `cmake` installs `cc`. A composed `cmake-build` (`FROM system-tools`, `INSTALL libuv`, `INSTALL cmake`, `ENTRY`) cannot install a package that is `FROM` it, so:

```text
PACKAGE libuv        FROM system-tools (or system-build: needs make cp tar cc)
                     SOURCE libuv.tar; tar; make -C /tmp/libuv; cp ×2; the check; EXPORTS ×3; licence
PACKAGE cmake        FROM system-tools; INSTALL libuv; INSTALL cc
                     25 REQUIRES rows; SOURCE cmake.tar.gz; gzip -dc | tar; FILE build.slop; slop -e; EXPORTS cmake, cmake-data; licence
TOOLCHAIN cmake-build FROM system-tools; INSTALL libuv; INSTALL cmake; ENTRY
```

- The 11 dependents keep their `FROM cmake-build` row; only the pin changes.
- What arrives: `cmake`'s `INSTALL cc` and `INSTALL libuv` rows are installed into `cmake-build` first. `system-tools`' record holds `zlib gzip curl display`, not `cc` (a view is never installed into its own builder: more-packages `:180-183`), so the row is not skipped and `cc`'s 126,163,965 bytes are restored over the identical files (`src/dollyfile.c:1429-1431` "merging directories and replacing files"). Not measured: time and kernel memory of that restore (`5d175f65` recorded "an image built FROM 400 MB and INSTALLing 290 MB kept 690 MB of kernel memory").
- `amy install cmake` would also bring `libuv.a` and its headers (618,289 bytes) that CMake linked statically; today the view ships none of libuv but its licence (`demos/cmake/Dollyfile-cmake:13`).
- Rebuilds: a libuv patch today 83 (`cmake-build` and below); then `libuv` → `cmake` → `cmake-build` → 83. A CMake source change today 83; then 83. `tools-build`'s 25 are inside both.

### (e) The 16 commands of one Makefile

`NAMES := install du rev command xargs find env time timeout realpath diff patch hostname tty nproc amy` (`system-tools:411`); 13 go to `posix`, 2 to `git`, 1 to `amy`. As three packages holding their builds, each `SOURCE`s `run-program.h` (a shared source, as `stb_truetype.h` is in four recipes) and its `.c` files; `amy` also `version.h`, and keeps `/bin/dollyfile` by `EXPORTS TOOL dollyfile` as it does today (`Dollyfile-amy:10`; the engine is `system-build`'s). `REQUIRES TOOL git` (`:388`) goes with `diff`/`patch`.

- `amy.c` changed four times since 09-30 (`b60b426a`, `7ae80700`, `f9b2cb49`, `2283e960`); two of them were seed changes as well (all 130). The other two repinned 114 through `system-tools`; as a package holding its build and installed by `default` alone they would repin 2 (`amy`, `default`), if `system-tools` does not install `amy`. No build requires `amy`, `download`, `upload` (grep: `REQUIRES TOOL download` in `bhop`, `upload` in `rts-arena`, `amy` nowhere).

## 6. The owner's long-term goal against this chain: measured

What sits in the path that repins everything, and how often each changed since 2026-09-30 (`git log --since=2026-09-30 --oneline -- PATH | wc -l`):

| Input | Commits | Reach of a change |
| --- | ---: | --- |
| Seed: `toolchain/CMakeLists.txt` 18; `scripts/build.sh` 24; `prepare-process-sysroot.sh` 3; `src/dollyfile.c` 21; `src/process/` 47 (`bootstrap.c` 2); `src/compiler.cpp` 34; `include/dolly/` 18; `host/*/*.h` 23; `host/*/client.c` 14; `host/*/*.wat` 24; `abi/` 46 | | all 130 (image build ID) |
| `src/slop.c` | 35 (34 between 09-30 and 10-06, 1 on 10-13) | 127 (root pin) |
| `src/commands/` | 28 commits; per file: `amy.c` 4, `xargs.c` 3, `nproc.c` 3, `install.c` 3, `curl.c` 3, `run-program.h` 3; `test.c`, `rm.c`, `mkdir.c`, `ls.c`, `help.c`, `du.c`, `rev.c`, `patch.c` 2 each; the rest 0-1 (the "1" of most root commands is `cf5d874c`, which created the files) | 127 for the root's, 114 for `system-tools`', 116 for `gzip`/`curl`'s, 2 for `nena.c` |
| `Dollyfile-system-build` | 80 commits; 50 changed a row other than a pin or a version path (filter: `+`/`-` lines not `FROM/INSTALL/COPY/SOURCE` or `#`); of those, the ones that changed what it builds rather than a header row or a page: `0b6d11ec`/`6d533a7e` (sbase in and out), `5ec4783c` (fold), `efa9f7b1`, `6f0f03ac` (messages of `cc`, `tar`), `b1244f1d` (`ls -l`), `b97bddd3`/`35668d93` (`touch -t`), `411d1cb2`/`b9a2f067`/`fbfc278b` (pages), `5cc9db78` (libc++), `cf5d874c` (sources out), `5eafdf7e` (`test -x`), `83a116a5` (`help`) | 127 each |
| `Dollyfile-system-tools` | 99 commits; 46 changed a row other than a pin; among them `6d533a7e`, `776c64d4` (`sh`), `10aef56d` (display), `5ec4783c`, `b60b426a` (amy), `efa9f7b1` (`xargs -P`, `nproc`, `kill`), `6f0f03ac` (`tail` is sbase's), `411d1cb2`/`0ec6463b` (pages), `0647f58b`/`403d3abb`/`a1284224`/`ef4b01dc` (host lines), `c6e8ac47` (Git's pager), `f9b2cb49` (DOLLY 7) | 114 each |
| `display` (`INSTALL` at `system-tools:447`): `src/ghostty/display.c` 3 (`0095054c`, `56255e61`, `870b6ab4`); `276e0187` (cursors) | | 115 |
| `Dollyfile-system`, `cmake-build` | 94, 90 commits, nearly all pins | 52, 83 |

Which of these a narrower root would have kept out of the path, read from what the recipes require:

- Changes to things no build needs: `amy.c` (4; 2 also seed), Git's pager (`c6e8ac47`, `f3f641cb`), `download`/`upload`. With each as a package holding its build and installed by `default` only, their reach is 2 instead of 114. `REQUIRES TOOL` confirms no build names them.
- Changes to things every build needs: `ls`, `touch`, `test`, `help`, `cat`, `cp`, `mv`, `mkdir`, `rm`, `tar`, Make, libc++, Slop, `cc`. Every toolchain's `REQUIRES TOOL` rows name them; any base that holds them carries its closure; a narrower root moves their rows into packages that every base installs, and the reach stays at the closure of whichever base installs them (127 or 114). This is the class of the four single-command changes of the last 14 days.
- Changes to the seed (headers, clients, the engine, the compiler): 130 in any recipe shape; five new modules since 10-08 each rebuilt all (module-sdks investigation, 2.7).
- Changes to sbase, awk, Samurai, Git's archive: pinned once (`system-tools`), reach 114; with `posix`/`git`/`ninja` holding their builds and `system-tools` installing them, 114; with `system-tools` not installing one of them, that package's installers only, and the toolchains that `REQUIRES` its tools install it themselves.

## 7. What could not be found out

- The reasons for `8e270ae4`, `192833e2`, `2c441d4b` and `c4a8cc6d`: no message bodies; only the two comments quoted in 1.3 and 1.4.
- The owner's sentence about the core things becoming "stable and reusable" (the brief, "said the same evening"): not in `tasks/`; the recorded owner words on the chain are those in 1.7.
- Whether Git, Samurai, awk and the 16 commands build `FROM system-build` alone: by reading yes (their Makefiles call `cc`, `ar`, `mkdir`; sbase's calls `cc ar rm cp`; Make's shell is Slop; no archive is gzipped); not run. The inventory left the same item open.
- Any size, build time or boot time of the split shapes in section 5: nothing was built. The only measurements in the record are the view packages' (`d4ab4f63`, `9d9064b3`, `d237a991`: 87 s for eight views, "no other image rebuilds") and the 2026-10-05 table.
- The cost of `INSTALL cc` restoring 126 MB of identical files into a toolchain that already holds them (5d), and whether the engine's merge treats identical records specially (`src/dollyfile.c:1429-1431` says replace).
- Whether any opened image's program needs Git, `download` or `upload` at run time, which decides whether they can leave `system-tools` without a route breaking: the recipes say nothing; the audit marked Codex "medium".
- Whether compiling libc++'s ~70 sources with `cc` rows or a Slop loop instead of Make (5c, i) is acceptable in time; `5cc9db78` recorded no timing.
- Whether every snapshot size quoted matches this tree's pin: `dist/dolly-images.mjs` names `system-build`'s current pin; the other packages' pins were not checked one by one.
- What the owner meant by "no shortcuts" for a view that costs no rebuild (the 10-12 rule "cheapest shape first" and the audit's "zero rebuild cost per new package was what let fifteen land in one night" both describe the views as the shape that fit the rounds): the record has his 10-13 sentence and no ruling on the views by name.