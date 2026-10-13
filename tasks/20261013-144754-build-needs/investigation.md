Read on `main` (2026-10-14, the night's tree) by a Fable agent, read-only. One agent wrote this report in two parts; the other part is [what a library package declares of host modules](../20261013-175624-library-hosts/investigation.md).

# Part A: what a package needs only to build

**Summary (findings, no advice)**

1. `INSTALL` was born on 2026-10-01 as "the missing verb" (`d7e1a516`, design `tasks/20261001-214000-dollyfile-v6/TASK.md:87-89`) and has always meant one thing: import a package's files, exports and environment, and (since `b60b426a`, 10-02) be the row `amy install` executes. The record `/etc/dolly/installed` came for sessions on 10-02 and for builds on 10-06 (`2c0faa22`); by-reference installs on 10-13 (`2283e960`) after the owner's question "They already specify requires etc? No need for new syntax to manage it?".
2. Before 10-13 a package's `INSTALL` row copied the installed package's files into the package's own snapshot (`cargo` 500 MB holding `rust` 463 MB). The one build-only-shaped row of that time, `gzip → zlib` (since `5ec4783c`, 10-01: `gzip` links `-lz` statically), travelled by value then (508,918 bytes against 279,954 today) and travels by reference now. The problem existed in a heavier form; nobody named it.
3. No task or commit before `tasks/20261013-144754-build-needs` proposes, tries or refuses a build-only `INSTALL` row. "build-only" in the record names images (`llvm-build`, `tools-build`) and one package's description (`llvm-runtimes`). The nearest ruling is `tools-build`'s comment: "COPY may not write under /tmp, so a package cannot borrow the formatter from another image for its build alone" (`demos/tools/Dollyfile-tools-build:14-15`).
4. The record holds exactly "INSTALL PATH SHA256" per row (`src/dollyfile.c:1151-1163`): a recipe's site path and its pin, nothing else. The name is derived from the path (`src/commands/amy.c:89-90`). No field says why a row is there.
5. A package must declare the host modules of its rows: `INSTALL` checks a row's hosts against the installing recipe with `install=1` in a package's build as in any other (`src/dollyfile.c:1109-1113`), so a build tool's modules enter the package's manifest and every installer's (`zero-ad-spidermonkey:3-12` declares `dso`, `sockets`, `threads` for Python, Cargo and cbindgen; `meson` declares Python's three).
6. Counted over the 77 package recipes: 30 `INSTALL` rows in 24 packages. 19 are needed at run time by what the package ships (a program it starts, a file it reads), 6 are libraries linked statically (`gzip`, `mandoc`, `pigz`, `sqlite`'s shell, `tmux` ×2), 5 are neither cleanly (`flex → yacc`, `freetype → libpng`, `libpng → zlib`, `janis → quickjs`: a consumer's link; `python → ninja`: the owner ruled it a third party's need).
7. `tmux-panes` (153,484,227 bytes) carries `libevent` (563,165) and `libterminfo` (288,290), 851,455 bytes its one program linked statically; `gzip`'s installers carry `zlib` (275,272); the Rust, LLVM, Mojo and 0 A.D. chains carry `python`'s pin through four toolchains' `INSTALL python` rows.
8. Toolchains that exist to hold build tools: `tools-build` (239.9 MB, 22 packages `FROM` it, made for this on 10-13 with the comment that records the problem), and in the same use `cmake-build` (239.2 MB; `sdl2` and 10 toolchains), `rust-build` (514.1 MB; 4 packages and `codex-build`); the three LLVM toolchains, `pi-build`, `codex-build`, `zero-ad-spidermonkey` install a tool for their own build and, being toolchains, keep it (`src/dollyfile.c:1401`).
9. A "build only" mark would be read in 5 engine places, 3 in `amy`, 1 in the graph, 1 to 2 in the page's parser and view, 4 test files and 2 document sections; the receipt holds no rows (`src/dollyfile.c:1016-1052`) and the index holds none. Pins cascade by recipe text (`docs/dollyfile.md:112-115`), so the rebuild reach of a tool change is the same under a row and under a base; a base adds one image that restores and installs.
10. Not findable without building or asking: whether `libsqlite3.a` references zlib; the size and time of any base under shape (a); whether the owner's "no shortcuts" covers a base per set of tools; whether `flex`'s `yacc` row is a companion or a build need; whether `python → cc` stays (the owner left it, `tasks/20261013-132701-python-ninja/TASK.md:24-27`).

---

## A1. History

### A1.1 How `INSTALL` came to mean what it means

| Date | Commit or task | What it did | In its own words |
| --- | --- | --- | --- |
| 2026-10-01 | `d7e1a516` "Implement Dollyfile 6: roles, INSTALL, transitive exports, packages" | `INSTALL` born; `IMPORT_COPY` beside `IMPORT_FROM`, `IMPORT_INSTALL`; "a package keeps nothing of its FROM base" | design table (`tasks/20261001-214000-dollyfile-v6/TASK.md:87-89`): "new: `INSTALL URL SHA` \| import a package \| 'The missing verb (5): files, exports (ENV as values) and host requirements, anywhere [...]. It is also the row `amy install` executes.'" |
| 2026-10-01 | `5ec4783c` Phase 3 | modules fold; the shared ones become packages; "a package's lines must be declared by its installer" | the first package rows: `gzip → zlib`, `pi-coding-agent → javascript ripgrep fd` (listed by `git ls-tree`/`git show` at that commit) |
| 2026-10-02 | `b60b426a` "Install packages into a running session with amy" | the record born, written by live installs only; "The package host check moves from sealing to the row, before any file is written" | "An amy install is the Dollyfile row INSTALL URL SHA256 executed against the live filesystem" |
| 2026-10-05 | `8bfcd884` | `cmake`, `sdl2`, `rust`, `codex-cli` packages; `codex-cli → ripgrep fd` | |
| 2026-10-06 | `2c0faa22` "Record installed packages in builds as in sessions" | "INSTALL now records its row wherever it runs, after the rows of the packages the package itself installed; a package recipe starts its own record, and COPY never imports the record." | "amy list marked only what the session installed: in default it showed curl, display, gzip and zlib as not installed" |
| 2026-10-07 | `tasks/20261007-003116-package-needs/TASK.md:88-97` | `cmake installs cc` (`3aee12e4`), `rust installs cc` (`69e09fe3`); the ruling | "sdl2 and zlib: by design, needs a compiler, installs none (integrator's ruling 2026-10-07). A library starts nothing, and a package of headers and archives that installed `cc` would drag 2,000 files into every image that only links against it from its own toolchain." |
| 2026-10-12 | `tasks/20261012-130814-packages/TASK.md:36-38` | the rule restated | "A **library package installs no compiler** (ruling of 2026-10-07 for `zlib` and `sdl2`); a **program package brings what its programs start** (`rust` and `cmake` install `cc`, and now `zig` does)." |
| 2026-10-12 | `caf7ed97` (the packages task's `main`) | package rows then: `gzip → zlib`, `cmake → cc`, `codex-cli → ripgrep fd`, `llvm → cc`, `pi-coding-agent → javascript ripgrep fd`, `cargo → rust`, `rust → cc` | |
| 2026-10-13 | `tasks/20261012-230015-package-dependencies/TASK.md:7-9` | the owner's question | "Reflect on how the package dependencies could work with amy, I guess it could work out of the box by just parsing the Dollyfiles? They already specify requires etc? No need for new syntax to manage it?" |
| 2026-10-13 | `2283e960` "SEED: a package names what it installs; whoever installs it installs those rows first" | by reference | "No new syntax. INSTALL in a PACKAGE recipe keeps nothing of the installed package: its files, environment and exports serve the build and the row is recorded, as it always was, in the package's /etc/dolly/installed. For any INSTALL the engine installs the rows of the package's record that the installing record lacks, after the package's own checks and before a file changes. In a session a row whose snapshot is not there ends with status 3: amy fetches and installs it as an install of its own and asks again". What was measured: `cmake` 214,066,460 → 87,956,686 bytes, `zig` 186,887,937 → 60,778,163, `python` 173,588,803 → 47,325,381, `gzip` 508,918 → 279,954 (`:100-108`); "The six went from 855 MB to 206 MB" (`:111`). What was decided against: "`REQUIRES TOOL\|LIB\|HEADER` cannot be the dependencies, measured: 13 packages have such rows, 109 in all. 103 resolve to the toolchain the package is built `FROM` … They describe the build." (`:37-47`) |
| 2026-10-13 | `4b313b9c` "Tools: tools-build, what the packages are built on: cmake-build with mandoc" | the one base made for packages | "A package built FROM it keeps none of it, so the formatter is no row of the package and nothing installs mandoc for a page." Recipe comment (`demos/tools/Dollyfile-tools-build:10-15`): "A package is built FROM it and keeps none of it, so the formatter serves the build and is no row of the package: nothing installs mandoc because a page was formatted with it. (COPY may not write under /tmp, so a package cannot borrow the formatter from another image for its build alone.)" |
| 2026-10-13 | `tasks/20261013-132701-python-ninja/TASK.md:7-10` | the owner on a row | "python shouldn't require ninja. Thats a numpy dependency which has nothing to do with python itself, its a 3rd party thing. It hsould be possible to solve it by manually installing ninja in order to pip install numpy" |
| 2026-10-13 | `3721e1a0` (build-needs filed) | 22 package recipes with rows (the four `qwen3.5-4b` shard rows since gone) | |

The rule "a library package installs no compiler … a program package brings what its programs start" (`packages:36-38`) comes from the 2026-10-07 survey, where `cmake`, `sdl2` and `zlib` installed alone on `default` failed or were unusable (`package-needs:65-86`): `cmake` got `cc`; `sdl2` and `zlib` got a description sentence instead (`:91-97`, `65f64017`).

### A1.2 Was a build-only dependency ever proposed, tried or refused?

Searched: `git log --all -i --grep` for "build-only", "build only", "build dependency", "makedepends", "build requires", "for the build only"; `grep` over `tasks/*/TASK.md` and `docs/*.md` for the same and "BUILD", "INSTALL … build".

- Commits: "build-only" names images (`3848df01` "llvm-build: a build-only image for the compiler's libraries"; `c0ffa73a` the eight build-only toolchains), never a row.
- Tasks: `tasks/20261012-130814-packages/TASK.md:170-171`: "`llvm-runtimes` is a package whose description starts 'build-only': it is in `amy list` and nobody installs it." `tasks/20261012-230015-more-packages/TASK.md:344`: "`FROM tools-build`, a build-only toolchain". `tasks/20260930-223000-dollyfile-design/TASK.md:30`: "`COPY FROM` a build-only image (no `display@0`) is the multi-stage mechanism". Nothing proposes a row that is installed for a build and not recorded.
- The nearest consideration is the `tools-build` comment above: a build-only `COPY` of the formatter was ruled out by "COPY destinations may not be `/tmp`" (`docs/dollyfile.md:116-118`), and a base was made instead.
- The inventory of 2026-10-13 wrote "cmake installs libuv and cc" as a possible shape (`tasks/20261013-142800-generic-builds/inventory.md:47`, cited by the views investigation §5.c), which would make `libuv` a build-only row of `cmake`; the views investigation marks it as this task's question and does not decide.

### A1.3 Before by-reference installs

Between `d7e1a516` (10-01) and `2283e960` (10-13), `INSTALL` in a package recipe restored the installed package's files into the package's own build and **kept them**: the package's snapshot held them (`cargo` 499.8 MB of which `rust` 463.1, `rust` 463.1 of which `cc` 126.3, `cmake` 214.1 of which `cc` 126.3; `packages:247-255`). From 10-06 the row was also recorded. So a tool needed for a build alone, written as a row, would then have put the tool's bytes into the package and, after 10-06, its row into every installer's record. The one row of that kind that existed was `gzip → zlib` (`Dollyfile-gzip:6`, `:15` `cc /tmp/gzip.c -lz -o /bin/gzip`): zlib's 275 KB sat inside `gzip`'s 508,918-byte snapshot until 10-13 and comes by reference since. No task of the period names this as a problem; the packages task of 10-12 names only the size ("one package cannot gather what exceeds the 2 GiB an image holds", `:256-261`).

### A1.4 The owner on dependencies, as recorded

- 2026-10-05: "Make more things into packages, it works really nicely." (`tasks/20261005-131645-more-packages/TASK.md:7`)
- 2026-10-12: "Break out everything (that makes sense) into packages that are installable with amy." (`packages:7`)
- 2026-10-13: the question on dependencies (A1.1) and on `ninja` (A1.1).
- 2026-10-13: "I want to simplify and create as many reusable, good, no shortcuts, packages as possible." and "It seems you just started adding random stuff? It's fine, keep them, but that was not the point." (views investigation §1.5, from `tasks/20261013-142800-generic-builds/TASK.md`)
- 2026-10-13: "complete rebuilds is a problem. This is intentional, this way is robust and reliable but changing stuff does mean rebuilding a lot of stuff. That is also why I want to get the core parts right." (`tasks/20261013-142800-direction/TASK.md:12-16`)
- The owner has not spoken on a build-only row; the task was filed as his question.

## A2. What the engine does today

### A2.1 A package recipe at build

- `FROM` in a package: files restored and exports loaded into `visible`, but `keep = !(package_recipe && mode != IMPORT_COPY)` is 0, so nothing is retained and no export is published (`src/dollyfile.c:1401`, `:1432`, `:1452-1458`); the record is unlinked: "A package recipe starts its own record" (`:1434-1435`).
- `INSTALL` in a package: the artifact is read (`:1365`); its receipt's role must be `PACKAGE` (`:1373-1377`); the pin rule: a record row for the same path at another pin fails "is installed at another pin" (`:1381-1394`); its host list is checked against the package's own `REQUIRES HOST` lines (`read_artifact_receipt`, `install=1`, `:1109-1113`: "needs X: add REQUIRES HOST X"), **so the package must declare the row's modules**; then the rows of the installed package's record that this record lacks are installed first (`install_rows`, `:1330-1350`, `:1395-1399`), each the same way; files are restored for the build (`:1429-1431`) and not kept (`:1432`, `keep` 0); the installed package's rows and then its own row are appended to the record (`record_installed`, `:1186-1198`, called at `:1437` and `:1444`); its `ENV` values apply to the build and are not kept (`:1448-1454`); its exports go into `visible`, not into the package's exports (`:1455-1458`).
- `COPY` in any recipe: files only, kept always (`:1401` with `IMPORT_COPY`), no exports, no hosts, never the record (`:1371`, `:1410`).
- Sealing: every retained regular file that starts with `\0asm\1\0\0\0` is scanned for `dolly.host` records (`:2020-2049`, `:2108-2120`); the record file is in `keep` (`:1197`) and goes into the snapshot.

### A2.2 At install, in a build and in a session

- A build's `INSTALL` (an application or toolchain): the same path with `package_recipe` 0, so `keep` is 1: files, environment names and exports are kept (`:1401`, `:1432`, `:1452`, `:1457`). The installed package's rows are installed first and recorded first; a row the record holds is skipped (`installed_holds`, `:1177-1182`, `:1337`).
- A session (`dollyfile install PATH SHA256`, `install_live`, `:2200-2225`): the booted image's recipe is parsed for its declared hosts (`:2202`); with `nena@0` declared, `/etc/dolly/enabled` is read (`:2207-2214`) and `host_enabled` (`:1063-1069`) counts beside `host_declared` (`:1056-1061`), and the refusal names the command: "needs X: nena enable x" (`:1110-1112`); then `load_artifact(IMPORT_INSTALL, package_recipe=0)` (`:2219`). A row whose snapshot is not in `/etc/dolly/artifacts` ends with `ROW_FIRST` (3) and the message "LOCATOR installs ROW first" before anything changed (`:1329`, `:1341-1346`). `amy` fetches the row's snapshot and installs it as an install of its own, then asks again (`src/commands/amy.c:264-294`: `snapshot_rows` reads the record out of the snapshot, `:193-215`).
- `amy list` prints `NAME installed|- DESCRIPTION` by `find_row` on the record (`amy.c:356-361`); `amy info NAME` prints the description, the package's own `INSTALL` row and installed/not installed (`:363-367`); `amy installed` prints the record's rows (`:348-352`). None prints a package's rows before it is installed; the only time the rows are shown is the engine's "installs … first" line during an install.
- The page's graph does the host check statically for the direct target only (`src/dollyfile-graph.mjs:61-67`) and propagates rows into `record.installs` and the root's `artifacts` (`:69-80`), which every builder reads (`src/image-build.mjs:60, 86`; `src/image-artifact.mjs:68, 94`; `scripts/build-system-snapshot.mjs:49, 109, 183, 194, 227`; `scripts/site-release.mjs:104`; `scripts/update-recipe-pins.mjs:39, 51, 63`; `scripts/serve-checkout.mjs:52`; `scripts/image-definitions.mjs:61, 135, 151`; `scripts/lint-dollyfiles.mjs:57`; `src/runtime-worker.mjs:119-132`).

### A2.3 What the record carries, and what a mark would touch

The record's row is `INSTALL PATH SHA256` and nothing else: `valid_installed` refuses any other shape (`:1152-1163`), `read_artifact` validates it in every snapshot (`:1265-1276`), `amy`'s `parse_rows` takes the name from the path (`amy.c:89-115`). So the record carries a recipe's site path (which names the package by file name) and its pin. It does not carry a name, a role, a reason, or the hosts (those are in the receipt, `:1029-1033`).

Places that read the fact "this row is one of the package's rows" and would have to know a second kind of row:

| Where | What reads it | Places |
| --- | --- | --- |
| engine | `valid_installed` (format), `install_rows` (installs every row), `load_artifact` (copies the rows into the installer's record, `:1436-1447`), `read_artifact` (validates), the host check (`:1109`: whether a build-only row's modules must be the package's) | 5 |
| `amy` | `parse_rows`, `snapshot_rows` + `install_row` (installs every row on status 3), `amy installed` | 3 |
| graph | `dollyfile-graph.mjs:69-80` (`installs`, `installTargets`, `artifacts`); the host check `:62-66` reads the direct target only | 1 |
| page parser and view | `dollyfile-view.mjs:201-215` only if the mark is syntax; `scripts/render-dollyfile-view.mjs:63-70` renders an `INSTALL` row as a link to the package's page and shows no rows of rows | 1-2 |
| receipt | none: `write_artifact_receipt` records role, host list and exports (`:1016-1052`); the rows live in the record file | 0 |
| index | none: `amy-index.txt` is `NAME RECIPE SHA256 DESCRIPTION` (`docs/dollyfile.md:302-304`) | 0 |
| tests | `test/amy-browser.mjs:45-55` (fixture packages with a record), `:127-149` (rows first, a held row skipped, a second pin refused, survives a save), `test/default-browser.mjs` ("composed dependency"), `test/dolly.artifacts.mjs:279` (`installTargets`), `test/dollyfile-graph.test.mjs:225` (artifact order) | 4 files |
| documents | `docs/dollyfile.md:141-158`, `:316-334` | 2 sections |

## A3. The cases, counted from the recipes

Of 130 recipes (20 applications, 33 toolchains, 77 packages), 24 package recipes have `INSTALL` rows, 30 rows in all (script over the recipe text).

### A3.1 Every `INSTALL` row in a `PACKAGE` recipe

| Package | Row | Class | Evidence (the recipe's words) |
| --- | --- | --- | --- |
| `cargo` | `rust` | (i) | "Cargo runs rustc: the package brings the compiler it was built with." (`demos/rust/Dollyfile-cargo:12-13`) |
| `cmake` | `cc` | (i) | "Configuring runs the C compiler and building runs make." (`demos/cmake/Dollyfile-cmake:8-9`) |
| `codex` | `ripgrep`, `fd` | (i) | "the search tools Codex runs" (`demos/codex/Dollyfile-codex:8-9`) |
| `flex` | `yacc` | (iii) | the build runs it (`:61` `yacc -d parse.y`) and the comment gives a companion reason: "a scanner seldom goes without a grammar, so the yacc package comes with it" (`demos/tools/Dollyfile-flex:9-10`); `flex` itself starts no `yacc` |
| `freetype` | `libpng` | (iii), a consumer's link | the package ships `libfreetype.a` only; "with the libpng and zlib it reads fonts with" (`demos/zero-ad/Dollyfile-freetype:5-6`): a program linking `-lfreetype` links `-lpng16 -lz` |
| `gzip` | `zlib` | (ii) | `cc /tmp/gzip.c -lz -o /bin/gzip` (`Dollyfile-gzip:15`); "zlib's header and archive, which it links statically" (`package-dependencies:39-40`) |
| `janis` | `quickjs` | (iii), both | `janis` links `-lquickjs` statically (`:32`), and exports `libdolly-js.a`, which "a program that is one script (tsc, pi, a game's agent) links -ldolly-js -lquickjs" (`demos/javascript/Dollyfile-janis:9-10`): the consumer links `quickjs` too |
| `libpng` | `zlib` | (iii), a consumer's link | "with the zlib it needs. zlib installs no .pc file of its own; libpng's names it" (`demos/zero-ad/Dollyfile-libpng:5-7`, `:18`) |
| `llvm` | `cc` | (i) | `llvm-cc` runs "on the same headers and libraries" (`demos/llvm/Dollyfile-llvm:5-7`): the sysroot the `cc` package exports |
| `mandoc` | `zlib` | (ii) | `cc $^ -lz -o $@` (`demos/tools/Dollyfile-mandoc:93`) |
| `meson` | `python`, `cc`, `ninja` | (i) ×3 | "Python runs it, meson setup starts the C compiler and meson compile starts Ninja, so those three packages come with it" (`demos/tools/Dollyfile-meson:8-10`) |
| `mojo` | `cc` | (i) | "mojo build links what it compiles with the C toolchain." (`demos/mojo/Dollyfile-mojo:13`) |
| `pi` | `janis`, `ripgrep`, `fd` | (i) ×3 | `pi` is a `-ldolly-js` program that "reads the two scripts kept here when it starts" (`Dollyfile-janis:9-10`); `rg`, `fd` are started |
| `pigz` | `zlib` | (ii) | `cc $^ -lz -lm -o $@` (`demos/tools/Dollyfile-pigz:35`) |
| `python` | `cc` | (i) by the 10-12 rule | "pip builds what has no wheel for Dolly, which is every native package: a C extension with the compiler" (`demos/python/Dollyfile-python:405-406`); the owner left it: "`cc` stays unless the owner says otherwise" (`python-ninja:24-27`) |
| `python` | `ninja` | (iii) | same comment, "a Meson project such as NumPy with Ninja too"; the owner: "python shouldn't require ninja" (`python-ninja:7-10`) |
| `rust` | `cc` | (i) | "rustc links what it compiles with the C toolchain." (`demos/rust/Dollyfile-rust:11`) |
| `speech-to-text`, `voice` | `parakeet` | (i) ×2 | "with the model it reads" (`demos/speech/Dollyfile-speech-to-text:7-8`, `-voice:8-9`) |
| `sqlite` | `zlib` | (ii) for the shell | `cc $^ -lz -lm -o $@` (`demos/tools/Dollyfile-sqlite:59`); "zlib, for the shell's archives" (`:15`); `-DSQLITE_HAVE_ZLIB=1` is in `FEATURES` for every unit (`:46-51`): whether the exported `libsqlite3.a` references zlib was not checked |
| `tmux` | `libevent`, `libterminfo` | (ii) ×2 | `cc $^ -levent_core -lterminfo -ldolly-sockets -ldolly-pty -o $@` (`demos/tmux/Dollyfile-tmux:70`); `tmux-panes` (`FROM system`, `INSTALL tmux`) is 153,484,227 bytes and holds both archives, 851,455 bytes |
| `typescript` | `janis` | (i) | "tsc is the runner started on the archive's own compiler script" (`demos/javascript/Dollyfile-typescript:7-8`): reads `/usr/lib/janis/runtime.js` at start; also links `-ldolly-js -lquickjs` (`:26`) |
| `zig` | `cc` | (i) | "cc compiles what it emits, so the package brings the compiler" (`Dollyfile-zig:5-7`) |
| `zip` | `unzip` | (i) | "zip -T starts unzip, so unzip comes with it" (`demos/tools/Dollyfile-zip:7-8`) |

Counts: (i) 19 rows; (ii) 6 rows; (iii) 5 rows. The hypothetical rows the brief names: `git` holds no build today (a view of `system-tools`); the root investigation's `git` holding its build would say `INSTALL zlib`, `INSTALL curl` for two static links (`builds-root/investigation.md` §5(a)), and `amy install git` on `default` would bring `zlib` (275,272 bytes) and skip `curl` (in `default`'s record at the same pin).

What the (ii) rows have in common: each is a library the package's program linked at `-l` time, carried as a row because the recipe is `FROM` a base that lacks it (`tools-build` for `tmux`, `mandoc`, `pigz`, `sqlite`; `system-build` for `gzip`). The `REQUIRES HEADER zlib` / `REQUIRES LIB z` rows beside them (`gzip:9-10`, `mandoc:14-15`, `pigz:14-15`, `sqlite:22-23`, `tmux:15-19`) are the recipe's statement of the build need; they carry no pin and name no package (`package-dependencies:37-47`).

### A3.2 Toolchains that hold build tools for packages

| Toolchain | What it holds for builds | Who is built on it | Snapshot (bytes, `build/image-logs`) |
| --- | --- | --- | --- |
| `tools-build` (`demos/tools/`) | `cmake-build` + `INSTALL mandoc`; writes `text-page`; compiles nothing | 22 packages: `bc bzip2 dte flex jq lz4 meson pigz sbase sqlite tar tmux tree unzip wabt xxd xz yacc zip zstd lua nvim` | 239,927,344 |
| `cmake-build` (`demos/cmake/`) | libuv and CMake, built (born 2026-09-13 "Keep the expensive bootstrap reusable") | `sdl2` (package) and 10 toolchains (`cmake`, `libuv` views; `llama-build`, `llvm-tablegen`, `mojo-llvm`, `neovim-build`, `openal-build`, `rust-llvm`, `speech-build`, `tools-build`) | 239,173,097 |
| `rust-build` (`demos/rust/`) | rustc, std, Cargo built; `INSTALL posix` for `cmp` | `ripgrep`, `fd`, `protox`, `cbindgen` (packages), `codex-build` | 514,106,111 |
| `zero-ad-spidermonkey` | `FROM zero-ad-deps` (pkgconf, `zlib.pc`), `INSTALL python cargo cbindgen`; declares `dso sockets threads` for them (`:3-12`) | nobody `FROM`; `zero-ad-engine` copies two rows | 873,914,313 |
| `llvm-tablegen`, `rust-llvm`, `mojo-llvm` | `FROM cmake-build`, `INSTALL python` (LLVM's configure needs Python 3: `tasks/20260930-232236-llvm-in-dolly/TASK.md:159-161`); each declares `dso sockets` for it | `llvm-build`; `rust-build` (`COPY`); `mojo-build` | 333,501,621; 428,033,684; 731,436,624 |
| `pi-build` | `FROM system-tools`, `INSTALL typescript` (for `tsc`) | `pi` (`COPY`) | 242,635,316 |
| `codex-build` | `FROM rust-build`, `INSTALL protox` | `codex` (`COPY`) | 361,588,721 |
| `classicube-build`, `rts-build`, `xonotic-build` | `FROM system-tools`, `INSTALL sdl2` (the library the game links) | the game images (`COPY`) | not read |

A toolchain keeps what it installs (`:1401`), so for these the build need and the kept files coincide and the question of this task does not arise; what arises is the pin: `python`'s row in four toolchains "cascades to 30 of 97 images: the Rust, LLVM, Pi and 0 A.D. chains" (`packages:224-226`), which is why the `ninja` change rides a round (`python-ninja:28-32`). `python` is 47,197,100 bytes and installs `cc` (126,163,965) and `ninja` (258,788).

## A4. The shapes, on the same cases

Notation: the shape (b) row is written `INSTALL RECIPE SHA256 # build-only` below. That is a placeholder, not a syntax; the language has no such row and this report proposes none.

### A4.1 SpiderMonkey (zero-ad-deps investigation §5.a)

**(a) A base.** `spidermonkey-build`: `TOOLCHAIN`, `FROM system-tools`, `INSTALL pkgconf`, `INSTALL python`, `INSTALL cargo`, `INSTALL cbindgen`, `FILE /usr/lib/pkgconfig/zlib.pc`, `ENTRY`; declares the opened set plus `dso@0 sockets@0 threads@0` because its rows do (`:1109`). The package: `PACKAGE spidermonkey`, `REQUIRES HOST runtime@0`, `FROM spidermonkey-build`, `INSTALL zlib` (a consumer links `-lz`), `REQUIRES TOOL python cargo cbindgen pkg-config patch make`, the build, `EXPORTS LIB js_static jsrust`, `EXPORTS HEADER mozjs-128`, `FILE mozjs-128.pc`. Stated in the package: the tool names (`REQUIRES TOOL`, no pin) and the base's pin; stated elsewhere: which tools, at which pins, in the base. Bases that exist for it today: none (`system-tools` and `cmake-build` lack the last four; `rust-build` has no `patch` or `pkg-config`; `zero-ad-deps` has the first group and installs the rest, zero-ad §5.a). One new base. Its pin closure: `system-tools` (113 images by pin) + `pkgconf` (today `FROM zero-ad-deps`: twelve 0 A.D. libraries) + `python` (+ `cc`, `ninja`) + `cargo` (+ `rust` + `rust-build` + `rust-llvm` + `cmake-build`) + `cbindgen` (+ `rust-build`). `amy install spidermonkey` brings the two archives, headers, `.pc`, licences and `zlib`; the record holds `zlib` and `spidermonkey`.

**(b) A row.** `PACKAGE spidermonkey`, `FROM system-tools`, `INSTALL pkgconf # build-only`, `INSTALL python # build-only`, `INSTALL cargo # build-only`, `INSTALL cbindgen # build-only`, `INSTALL zlib`, the same build and exports. What arrives in an installer: `zlib` and the package. The record of an installer: the same two rows; the package's own snapshot record: four marked rows and one plain, or one plain (depending on where the mark lives: the record format `:1152` holds no field for it). `amy info`/`amy list`: unchanged (neither prints rows today). What rebuilds when Python changes: the package (its pin covers the row), and every installer (its pin covers the package's recipe), which is what (a) does too, less the base image. Hosts: with the check as it is (`:1109`), the package must declare `dso sockets threads` for its marked rows and so must `zero-ad-engine` and every session that installs it; with the check keyed on the mark, it declares `runtime@0` alone, as (a) gives.

**(c) Already in the tree.** `COPY` out of `zero-ad-spidermonkey` into `zero-ad-engine` (K3, 2 rows): no interface, no record, the `.pc` written by the consumer (`zero-ad-engine:50-55`); `/view/` shows the two rows as links; a failing build fails at `COPY` on a missing source (`:1378-1380`). No view and no licence rows apply.

### A4.2 `git` (root investigation §5(a))

Today: a view of `system-tools` (`Dollyfile-git`, 20 lines); `zlib` and `curl` are `system-tools`' rows (`:215-217`); the build is `system-tools:218-354`.

- **(a)** `PACKAGE git`, `FROM system-build`, `INSTALL zlib`, `INSTALL curl`, the 137 rows. No base is needed: `system-build` has `cc ar make mkdir rm tar`. The two rows arrive with `amy install git` (`zlib` 275,272 bytes; `curl` is in `default`'s record). A base shape for it would be `git-build` = `system-build` + the two `INSTALL` rows (compiles nothing), one more image.
- **(b)** the same two rows marked; nothing arrives; the record of an installer holds `git` only.
- **(c)** the view as today: the base holds the libraries; the package states nothing about them; `amy files git` lists Git's files, not zlib's.

### A4.3 `tmux` (as it is)

- **Today, shape (b)-without-mark:** `PACKAGE tmux`, `FROM tools-build`, `INSTALL libevent`, `INSTALL libterminfo`, `REQUIRES LIB event_core terminfo` (`demos/tmux/Dollyfile-tmux:10-19`); `tmux-panes` holds both archives and the record rows `libevent`, `libterminfo`, `tmux`. `amy install tmux` on an image with `pty@0` and `sockets@0` installs three snapshots and says so; `amy list` marks all three installed.
- **(a)** a `tmux-build` = `tools-build` + the two rows (compiles nothing): one more image (240 MB restored to hold 851 KB); the package `FROM tmux-build`, no rows; `tmux-panes` holds `tmux` alone.
- **(b)** the two rows marked; what arrives: `tmux` alone (1,967,638 bytes).
- **(c)** `libevent` and `libterminfo` were made as packages on 2026-10-13 because "What the tmux recipe built for itself and another program would link" (`38f9faa6`); before that they were rows of the `tmux` build, which is the "static linking with licence rows" shape: the library's licence travels as a `FILE` of the program's package.

### A4.4 `nvim` (views investigation §5.d)

- **Today:** a `COPY` package: `FROM tools-build` for `text-page`, 12 `COPY` rows out of `neovim-build`, 9 of them licence folders of statically linked libraries (K2). `/view/` links each row to `neovim-build`; `amy files nvim` lists the copied files; the libraries are no row anywhere.
- **(a)** `neovim-build` as a composition: `tools-build` + `INSTALL lua lpeg luv utf8proc tree-sitter` (five new packages, two of which need Lua at build: `lpeg`, `luv`); `nvim` `FROM` it, `REQUIRES LIB lua lpeg luv treesitter utf8proc`, the Neovim build. One base (replacing today's builder) plus at least one more for `lpeg`/`luv`.
- **(b)** `PACKAGE nvim`, `FROM tools-build`, five rows marked, the build. The licences: a package that does not install the five carries their texts itself (as `zero-ad` does by `COPY` and `llvm` by `SOURCE`).
- Either way the `-O0`, `-rdynamic`, `LUA_USE_DLOPEN` flags are chosen once, and `dso@0` stays on `nvim` (its program loads parsers).

### A4.5 Zstandard in `mojo-llvm` (twice investigation B4(e))

`mojo-llvm` is a toolchain, so `INSTALL zstd` would keep the package's 2 MB in `mojo-llvm` and `mojo-build` and record the row; the `mojo` package copies five paths and is unaffected. The question of this task does not bite; what the row costs is identity: "`mojo-llvm`'s identity gains the `zstd`, `tools-build` and `mandoc` pins, so a mandoc or `text-page` change rebuilds Mojo's 65-minute LLVM" (B4(e)). The same holds for every `INSTALL python` in a toolchain.

### A4.6 What each shape states, and what a reader sees

| | Stated in the recipe | Not stated | Reader of the recipe | `amy` | `/view/` | A failing build |
| --- | --- | --- | --- | --- | --- | --- |
| (a) base | the base's pin; `REQUIRES TOOL` names without pins | which tools, at which pin: another file; the base's hosts carry the tools' modules | opens two files | nothing of the tools (`amy info` prints the package's own row) | the `FROM` row links to the base | a missing tool fails at `REQUIRES TOOL` (`:1584-1589`), naming the line |
| (b) row | the tool and its pin in the package | a meaning the language lacks; today the row's hosts must be the package's (`:1109`) | one file | nothing of marked rows unless `amy` learns the mark | an `INSTALL` row as a link | a missing snapshot: status 3 "installs … first"; a missing host: "needs X: add REQUIRES HOST X" |
| (c) `COPY` (K2 45 rows, K3 19) | the source image's pin and two paths per file | no interface (`COPY` imports no exports, `:1371`; nothing can `REQUIRES` it, copy investigation §4) | one file, long | `amy files` lists the files | each row a link to the builder | `-ENOENT` on a missing source (`:1378-1380`) |
| (c) view (21) | the builder's pin and `EXPORTS` | the build | two files | as (a) | the `FROM` row a link | an `EXPORTS` whose path is missing fails at sealing |
| (c) static link + licence rows | `REQUIRES LIB`, the link line, a `FILE`/`COPY` of the licence | the library's pin as a row (it is the base's or a row's) | one file | nothing | links | as (a) |

Pins cascade by recipe text (`docs/dollyfile.md:112-115`): under (a), (b) and the view a change to the tool repins the package and its installers alike; under (a) the base image also rebuilds, by restoring and installing (seconds: "the eight packages and `default` 39 s", `package-dependencies:184-187`).

## A5. What could not be found out

- Whether `libsqlite3.a` references zlib (`-DSQLITE_HAVE_ZLIB=1` is passed to every unit, `sqlite:46-51`): not inspected; no built archive is on disk here.
- The size, build time and kernel memory of any base of shape (a) that does not exist (`spidermonkey-build`, `git-build`, `tmux-build`, the Neovim composition): nothing was built. The recorded figure for a composition is `default`'s chain (39 s for eight packages and `default`).
- Whether a build-only row's modules should be the package's: the engine's check is keyed on the import mode, not on the role (`:1109`, roles investigation `:94`), and no ruling covers a row whose files the package does not keep.
- What the owner means by "no shortcuts" for a base per set of tools, and whether the `flex → yacc` and `python → cc` rows are meant as they stand: the owner has spoken only on `ninja`.
- Why `d7e1a516`'s design placed host requirements among what `INSTALL` imports and Phase 3 (`5ec4783c`, the same day) took them out again: the v6 task records the second as an owner correction and gives no sentence for the first.
