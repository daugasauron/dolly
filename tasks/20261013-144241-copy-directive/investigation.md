# `COPY` in the Dollyfile: history, what it does, who uses it, the reflection's claims, and what a change would touch

Read at `/home/daug/dev/dolly/work/rust` (branch `integrate/round-1013`, head `0155af64`), history shared with `main`; tasks at `/home/daug/dev/dolly/tasks/`. Paths below are relative to those two roots. Nothing was built or run; every number comes from `git`, `grep` and the files.

**Summary (findings, no advice)**

1. `COPY` is older than `INSTALL` and than packages. It was designed on 2026-09-03 (`c4dbe3ad`, "Exploring `COPY FROM`"), implemented on 2026-09-06 as `COPY FROM` in Dollyfile 3 (`99093739`), and was the only multi-stage mechanism until `INSTALL` arrived with Dollyfile 6 on 2026-10-01 (`d7e1a516`).
2. Dollyfile 6 kept it on purpose, beside `INSTALL`: "Still files only: multi-stage builds pick exact outputs" (`tasks/20261001-214000-dollyfile-v6/TASK.md:88`); the same design expected packages to need no `COPY` rows because a package `FROM` a builder keeps nothing of it (`:87`).
3. Four days later the catalog made `COPY` packages anyway (`rust`, `codex-cli`, `8bfcd884`), and the doc sanctioned three package shapes, one of them `COPY` rows, "which leaves an expensive builder as it is" (`docs/dollyfile.md:289-293`). The same commit added "The same `COPY` rows in two recipes are a missing package" (`:272`). Both sentences have one author and one date.
4. Today a `COPY` row restores selected paths of a sealed snapshot into the build, retains them even in a package, and imports no exports, environment, host list or install record (`src/dollyfile.c:1371,1401,1410,1448-1458`). Nothing can `REQUIRES` what a `COPY` brought (`:1591-1594`).
5. 108 rows out of 19 images, identical in the reflection's tree and this one; 54 copy licence files; 5 relocate; 6 distinct rows are repeated across recipes (14 row instances); 94 rows are single-use.
6. Four kinds: applications taking their program out of their build image (41 rows, 6 recipes); packages whose contents come by `COPY` (45 rows, 9 packages); build images taking a library or stage out of another image (19 rows, 5 toolchains); licence rows alone (3 rows, `xonotic`).
7. The reflection's counts hold under one explicit rule (no `SLOP`, `RUN` or `SOURCE` row): 20 views + 4 `COPY` roots = 24 of 79 at `d89bca74`; this tree has 19 + 4 = 23 of 77 under the same rule, 9 packages with any `COPY` row.
8. The claim "declares no interface and builds nothing" is true of the row, and also true of the view form (`FROM` + `EXPORTS`), which the reflection prefers; what differs is where the interface is written and whether `REQUIRES` can see it.
9. Rows have gone when a package appeared (SDL2: 15 rows to 3, `8bfcd884`; `transfer`: 4 to 1, `1240e208`) and have come for reasons other than a missing package: licences of statically linked libraries, a man page formatted on a different base (`b74634a7`, the day before the reflection), a second source image (`mojo`, `pi-local`, `xonotic`), and relocation.
10. Without `COPY`, today's language has an equivalent for every use only after new packages exist; two uses have none at all without a `FROM` being added: taking files from a second image (6 recipes) and relocating without a shell (2 root packages).

---

## 1. History

### 1.1 Before `COPY FROM` (Dollyfile 0 to 2, 2026-08-31 to 2026-09-03)

- `aa0e63c0` (2026-08-31, the first commit) had a `COPY <project-path> <absolute-path>` that copied a file of the *host checkout* into the image, beside `KEEP`/`KEEP-TREE` for retention. It took nothing from another image.
- `9e013dd9` (2026-08-31, Dollyfile 1) removed that `COPY`. Composition was `EXTENDS <image>`: "`EXTENDS` fetches and executes the parent at that exact row. The child then resumes at the following row." Inputs came by `SOURCE HOST|URL`.
- `c4dbe3ad` (2026-09-03, Dollyfile 2) replaced `EXTENDS` with modules (`USE HOST /modules/x.dm SHA`), `REQUIRES`/`EXPORTS` and `FILE`. Its doc holds the design note that is the origin of the directive, "Exploring `COPY FROM`":

  > "There is one concrete use that modules do not solve: build a complete SDK image, then derive a smaller runtime image containing selected files without rerunning or retaining the SDK's compiler and sources. That is a real multi-stage build, not a module dependency."
  >
  > "For this to be reproducible, `sdk` cannot be an unpinned friendly name. It must resolve to a source-visible Dollyfile, the same runtime build ID, its complete recipe chain, and a verified snapshot digest. [...] The copied files would be new owned outputs of the receiving image; the source image's environment, entry point, credentials, sessions, and all unselected paths would remain absent."
  >
  > "The C++/Python SDK-to-runtime split is the intended proving case. [...] It should not make images recursively execute other images. For ordinary library composition, `REQUIRES`/`EXPORTS` remains the smaller mechanism."

  So stage names (`COPY FROM sdk`) were considered and refused before any implementation, on reproducibility grounds.

### 1.2 `COPY FROM` arrives (Dollyfile 3, 2026-09-06)

- `99093739`: "Add FROM and COPY FROM using complete image artifacts, bind reuse to actual input digests, preserve exact exports and environment, and share published filesystem packs across images." Grammar: `COPY FROM HOST /Dollyfile-name HASH /source /destination`, "Copy a retained file or tree from an independent artifact." Semantics then as now: "Directories merge; matching files are replaced and unrelated destination files survive. A missing source fails. Copying files does not import environment variables or named exports. Every imported artifact contributes its original source provenance."
- First use, two rows: `Dollyfile-python-pi` copied `/usr` and `/etc/bonnie` out of `Dollyfile-python` ("copying Python into an independently built Pi userspace").
- `8e270ae4` (2026-09-06, same day): "Narrow COPY rows reuse one decoded input; [...] Python+Pi is 336.2 MB instead of 381.8 MB". The engine still has it: "Consecutive COPY rows share one decoded input, released before any other operation can mutate files or start a memory-intensive compiler process" (`src/dollyfile.c:1522-1524`).

### 1.3 Host modules and the rationale paragraph (Dollyfile 4, 2026-09-27 to 09-30)

- `018c5f27` (2026-09-27): "Host requirements propagate through `FROM` and `USE`. `COPY FROM` copies files without importing the donor's runtime requirements." That asymmetry was deliberate then; since Phase 3 nothing propagates them (1.5).
- `05e6bd8b` (2026-09-30) restored the "why" the short-docs rewrite had dropped, among it:

  > "`COPY FROM` a build-only image is the multi-stage mechanism: toolchains stay in images that are only built, shipped images copy exact outputs, and the consumer keeps the builder's recipe chain in `/etc/dolly/recipes` as provenance. There is no catalog-wide solver."

  The sentence survives at `docs/dollyfile.md:366-369` with "packages and applications keep exact outputs" in place of "shipped images copy".

### 1.4 The lean-image experiment, and what the catalog chose (2026-10-01 to 10-06)

- `f332ab7e` (2026-10-01, branch `experiment/dollyfile`): "hello (8.9 MB) copies one program from a build-only image; runtime (19.7 MB against 159.6 MB for system) copies the userspace without its compiler." The `runtime` recipe was ten `COPY FROM` rows out of `Dollyfile-system` plus `SLOP rm /bin/cc /bin/c++ /bin/ld /bin/ar` and three `EXPORTS ENV`. `demos/lean` is not in this tree.
- The findings in `tasks/20260930-223000-dollyfile-design/TASK.md:63-74`: "Two isolated cold builds and one cached build are byte-identical." "Friction observed. Each copied path repeats the builder pin; `COPY` imports no environment, so `PATH`, `SHELL` and `DISPLAY` are re-declared. Both are explicit and grepable; neither blocks anything." Candidate directions (`:84-88`): "1. A compiler-free core runtime image built by `COPY FROM` [...] (no language change). 2. Importing named export objects (`TOOL`, `LIB`, `FOLDER`, `ENV`) from a completed image, using the receipt's recorded members. Helps multi-file objects and environment; does not help bulk copies, where directory `COPY` is already one row."
- Direction 2 became `INSTALL` (1.5). Direction 1 was not taken in the `COPY` form: `d4ab4f63` (2026-10-05) made `core`, `cc`, `amy` as packages `FROM system-build`/`system-tools` with `EXPORTS` only ("A recipe without FROM keeps only what it installs, so the lean base needs no engine change"), and `9d9064b3` (2026-10-06) made `default` a composition of `INSTALL` rows. The base went the view way, not the `COPY` way.

### 1.5 Dollyfile 5 and 6: one word, and `INSTALL` beside it (2026-10-01)

- `f8bbd0c8` (Dollyfile 5): `COPY FROM URL SHA256 SOURCE DESTINATION`.
- `93cbe992` and `d7e1a516` (Dollyfile 6). The design task lists among "Inconsistencies in DOLLY 5" (`tasks/20261001-214000-dollyfile-v6/TASK.md:51-66`): "`COPY FROM` was the only two-word directive and reused `FROM` for a different operation; both parsers special-cased it." and "`FROM` imported files, environment, exports and host requirements; `COPY` imported files only; nothing imported a lean image's objects. Consumers repeated `COPY` rows and re-declared `EXPORTS` for SDL2 (classicube, bhop, rts-arena) and dolly-js (bhop, slopyard), row for row." The decision table (`:87-89`):

  > `FROM URL SHA` | keep; a package keeps nothing of its base | "The base of an application or toolchain is extended; the base of a package is only where it is built, so the package stays lean without `COPY` rows."
  > `COPY FROM URL SHA SRC DST` | `COPY URL SHA SRC DST` | "One word per directive (1). Still files only: multi-stage builds pick exact outputs."
  > new: `INSTALL URL SHA` | import a package | "The missing verb (5): files, exports (ENV as values) and host requirements, anywhere [...]. It is also the row `amy install` executes."

  `d7e1a516` introduced `IMPORT_COPY` (`typedef enum { IMPORT_FROM, IMPORT_INSTALL, IMPORT_COPY } ImportMode;`) and replaced the `COPY` blocks of `pi-runtime`, `bhop`, `slopyard`, `search-tools`, `codex-build` with `INSTALL` rows.
- `0057ef9d` (2026-10-01): "COPY is role-agnostic in the spec" (the roles table had listed it under `TOOLCHAIN` and `PACKAGE`; now `docs/dollyfile.md:63`: "`COPY` takes files out of an image of any role").
- `5ec4783c` (2026-10-01, Phase 3): "REQUIRES HOST is the image's complete list: nothing is inherited through FROM, INSTALL or COPY" (the task records this as an owner correction, `:217`). The `display` and `nvim` packages were born here with `COPY` rows (first `COPY` in both files: `5ec4783c`).

### 1.6 Packages: `COPY` as one of three package shapes (2026-10-05 and after)

- `8bfcd884` (2026-10-05, "Make CMake, SDL2, Rust and Codex installable packages"): `sdl2` "replaces the sdl2-build toolchain and the COPY and EXPORTS blocks of bhop, classicube and rts-arena" (15 rows to 3, per `tasks/20261005-131645-more-packages/TASK.md:126`); `rust` and `codex-cli` were made as `COPY` packages out of `rust-build` and `codex-build`. The commit added both sentences the reflection cites, to `docs/dollyfile.md` (blame, lines 272 and 289-293): "The same `COPY` rows in two recipes are a missing package." and "A package holds its build [...] or keeps the outputs of the toolchain that built them, with `FROM` and only `EXPORTS` (`cc`, `cmake`) or with `COPY` rows (`nvim`, `rust`, `codex`), which leaves an expensive builder as it is."
- The same task ruled on the games (`:149-150`): "ClassiCube and Seven Kingdoms: one consumer each, which takes exact outputs from its own builder with `COPY`; nobody installs a game into a shell."
- `2c0faa22` (2026-10-06): "COPY never imports the record" (`/etc/dolly/installed`).
- `61f4edb5` (2026-10-06): `zero-ad-deps`'s rows were repointed from `sdl2-build` to the `sdl2` package; the directive stayed `COPY` (diff shows only the location changing). No message body.
- `9fa4b4d3` (2026-10-07): "zero-ad-engine takes its headers and the two archives by COPY instead of the host-built mozjs-host.tar.gz" (a host exception replaced by an in-Dolly stage).
- `86057ebb` (2026-10-07) and `3a50bdfc` (2026-10-09): `xonotic-build` and `wine-build` take FreeType and libpng out of `zero-ad-deps` ("as 0 A.D. built them", recipe comments). The `libpng` and `freetype` packages were made on 2026-10-12 as views of `zero-ad-deps`; the replacement is listed as pending in `tasks/20261012-130814-packages/TASK.md:191-193`: "two image rebuilds (Xonotic's is not this tree's to make, Wine's builds Wine, GIMP and NetSurf)".
- `645f7474` (2026-10-08): "PACKAGE llvm keeps llvm-cc's compiler as /usr/lib/llvm/compiler with llvm-cc and llvm-c++ beside the seed's cc and c++" (a relocation).
- `f9b2cb49`/`97189fb5` (2026-10-08, Dollyfile 7): `COPY RECIPE SHA256 SOURCE DESTINATION`, site paths.
- `2370dc85` (2026-10-09): `rust-build` copies `/opt/rust-llvm` out of `rust-llvm`.
- `d237a991` (2026-10-12): `lua` and seven others as "a thin PACKAGE over the image that already builds the program"; `lua` was then `FROM neovim-build`.
- `1240e208` (2026-10-13): `default`'s four `COPY` rows from `system-tools` (`/bin/download`, `/bin/upload`, two pages; the old comment: "system-tools builds them and no package holds them yet") became `INSTALL transfer`.
- `2283e960` (2026-10-13, by reference): `const int keep = !(package_recipe && mode != IMPORT_COPY);` (`src/dollyfile.c:1401`); doc: "a package keeps `COPY` results and neither of the other two" (`docs/dollyfile.md:201-202`).
- `5d175f65` (2026-10-13): a dependency snapshot is removed with the recipe's last line that names it; the task notes "a recipe may `COPY` several times from one image" (`tasks/20261006-145958-builder-artifact-copies/TASK.md:67-68`).
- `141592ed` (2026-10-13): `mojo` package, five rows from two images.
- `b74634a7` (2026-10-13, the day before the reflection): `lua` switched from `FROM neovim-build` to `FROM tools-build` plus eleven `COPY` rows: "Its manual page is formatted here as text, which man prints: tools-build has mandoc, and a package keeps nothing of the base it is built on."

### 1.7 Row counts over time

| Commit | Date | `COPY` rows |
| --- | --- | --- |
| `99093739` (v3) | 2026-09-06 | 2 |
| `5ec4783c` (Phase 3) | 2026-10-01 | 46 |
| `8bfcd884` (sdl2, rust, codex-cli) | 2026-10-05 | 37 |
| `d89bca74` (the reflection's `main`) | 2026-10-13 | 108 |
| `0155af64` (this tree) | 2026-10-14 | 108 |

The growth from 37 to 108 is: `zero-ad`'s 12 licence rows, `xonotic` and `xonotic-build` (11), `wine` and `wine-build` (23), `lua`'s 11 (the man-page switch), `mojo` (5), `cargo` (3), `zero-ad-engine` (2), `rust-build` (1), `llvm` (1), and `nvim`'s growth to 12.

### 1.8 Reasons the history gives that the reflection does not cite

- `COPY` was the designed answer to "SDK-to-runtime" before `INSTALL` existed, and was kept in v6 as the files-only import next to the interface-carrying one (1.1, 1.5).
- The v6 design expected `FROM`'s package rule to make `COPY` rows unnecessary; the catalog nonetheless chose `COPY` packages for `rust` and `codex-cli` four days later, with the stated reason "leaves an expensive builder as it is" (1.6). No task text expands that phrase.
- A recipe has one `FROM`; `COPY` is the only row that takes files from a second image without a package of those files (`mojo`, `pi-local`, `xonotic`, `nvim`, `lua`, `rust-build`, `zero-ad-engine`).
- Half the rows exist for licence provenance of statically linked libraries, driven by `tasks/20261005-131648-licences` ("`zero-ad-deps` and `zero-ad-engine` retain them and `zero-ad` copies them", `:133-134`).
- The `COPY` form of the base was measured (`f332ab7e`) and not chosen; the view form was (`d4ab4f63`, `9d9064b3`).
- Memory: consecutive rows share one decoded input (`8e270ae4`), and `COPY` restores selected paths where `FROM` restores all; `5d175f65`'s example is "an image built FROM 400 MB and INSTALLing 290 MB kept 690 MB of kernel memory".

## 2. What a `COPY` row does today (`src/dollyfile.c` at `0155af64`)

Parsing (`:1560-1566`): four words; an image reference (`Dollyfile` or `Dollyfile-name` site path), a SHA-256, a source and a destination, each `/` or a normalized absolute path. The page's parser does the same (`src/dollyfile-view.mjs:202-218`) and lists the image among the build's artifacts, so the page fetches or builds it first (`docs/dollyfile.md:361-364`: cache identity includes `COPY` rows).

`load_artifact` (`:1358-1476`) with `mode == IMPORT_COPY`:

| Step | `FROM` | `INSTALL` | `COPY` | Where |
| --- | --- | --- | --- | --- |
| Reads the snapshot from `/etc/dolly/artifacts/<sha>.snapshot`, verifies the receipt | yes | yes | yes | `:1364-1367` |
| Appends the source's recipe chain to the consumer's (`/etc/dolly/recipes/`, `recipes.lock`) | yes | yes | yes | `:1101`, `:1370` |
| Reads the source's exports from the receipt | yes | yes | no (`NULL`) | `:1371` |
| Checks the source's host list against the consumer's declarations | no | yes | no | `:1109-1115`, `:1372` |
| Role check (FROM: application or toolchain; INSTALL: package) | yes | yes | none: any role | `:1373-1377` |
| Fails on a missing source path | – | – | `-ENOENT` | `:1378-1380` |
| One pin per recipe (`installed at another pin`) | no | yes | no | `:1382-1394` |
| Installs the package's own `INSTALL` rows first (by reference) | no | yes | no | `:1395-1400` |
| Which records: all, or those under `source` (prefix with `/` boundary; `/` means all), destination prefix replacing source prefix | all | all but control files | selected, relocated | `:1409-1421` |
| `/etc/dolly/installed` never restored | restored | skipped | skipped | `:1410` |
| Destination may not be under `/tmp` or `/workspace` | – | – | `-EINVAL` | `:1423` |
| Restored into the filesystem, merging directories and replacing files | yes | yes | yes | `:1429-1431` |
| Paths appended to the image's retained set (`keep`) | not in a package | not in a package | always | `:1401`, `:1432` |
| Package record started / rows appended | FROM in a package: record reset | rows + own row | nothing | `:1434-1447` |
| Environment applied, scope made visible, exports re-exported | yes | yes | none | `:1448-1458` |
| Prints `dollyfile: COPY <locator> (N paths)` | | | | `:1460-1461` |
| Snapshot removed after the last line that names its pin | yes | yes | yes | `:1469-1474` |

Consequences read from the code:

- A `COPY` row is the only import that makes a package retain files it did not declare by `FILE`/`FOLDER`/`EXPORTS` (`:1401`). Everything else a package keeps is a declaration.
- Nothing a `COPY` brought can satisfy `REQUIRES LIB`/`HEADER`/`FILE`/`FOLDER`: those look up the exports scope and the visible scope (`:1591-1594`), which `COPY` never fills. `REQUIRES TOOL` resolves `PATH` (`:1587-1589`), so a copied program on `PATH` does pass.
- Sealing scans every retained regular file for `dolly.host` records (`:1981-1982`, `:2113-2117`), copied executables included: `Dollyfile-display` must declare `display@0` because `libdisplay.so` stamps it, and `test/host-modules.test.mjs:43` proves `COPY` carries no requirement.
- Only `/etc/dolly/installed` is excluded from a `COPY`; the other control files are excluded for `INSTALL` only (`:1409-1410`). No recipe copies `/` today, so this difference is not exercised.
- The page keeps exports from flowing through a `COPY` edge (`src/dollyfile-graph.mjs:83-85`), the lint lets a copied path satisfy `ENTRY` (`scripts/lint-dollyfiles.mjs:13`). Tests: `test/dollyfile-graph.test.mjs:117,201`, `test/dollyfile-parser.test.mjs:116-117` (decoded-input reuse), `test/image-inputs.test.mjs:5`, `test/host-modules.test.mjs:43`.
- `COPY`-specific code in the engine is the enum member and about ten conditionals (`:1304, 1371, 1373, 1401, 1410, 1448, 1455-1456, 1461, 1524, 1560-1566`); the path selection and relocation (`:1411-1421`) exist for it alone.

## 3. Who uses it: the 108 rows

Same 108 rows at `d89bca74` and `0155af64` (the tree changes since the reflection touched no `COPY` row). Recipes: 130 here (20 applications, 33 toolchains, 77 packages) against 133 (20/34/79): `javascript` and `typescript-build` gone, `quickjs`, `janis`, `typescript` added (each holds its build: 5-6 `SLOP` rows), `qwen3.5-4b` and its four shards gone, `ps` added.

### 3.1 By source image (19; 18 toolchains, 1 package)

`neovim-build` 23 (`nvim` 12, `lua` 11), `zero-ad-deps` 15 (`wine-build` 8, `xonotic-build` 5, `xonotic` 2), `wine-build` 15 (`wine`), `zero-ad-engine` 13 (`zero-ad`), `rust-build` 5 (`cargo` 3, `rust` 2), `rts-build` 5, `sdl2` 4 (`zero-ad-deps` 3, `xonotic` 1; the only package source), `pi-build` 4, `ghostty-build` 4, `xonotic-build` 3, `mojo-build` 3, `codex-build` 3, `classicube-build` 3, `zero-ad-spidermonkey` 2, `mojo-runtime` 2, `rust-llvm` 1, `local-llm-build` 1, `llvm-cc` 1, `llama-build` 1.

### 3.2 By kind of use

| Kind | Rows | Recipes | Sources |
| --- | --- | --- | --- |
| K1. An application takes its program (and licences, data, sources) out of a build image | 41 | `wine` 15, `zero-ad` 13 (1 binary, 12 licences), `rts-arena` 5, `classicube` 3, `xonotic` 3 (of 6), `pi-local` 2 | `wine-build`, `zero-ad-engine`, `rts-build`, `classicube-build`, `xonotic-build`, `local-llm-build`, `llama-build` |
| K2. A package whose contents come by `COPY` | 45 | `nvim` 12, `lua` 11, `mojo` 5, `display` 4, `pi` 4, `cargo` 3, `codex` 3, `rust` 2, `llvm` 1 | `neovim-build`, `mojo-build`, `mojo-runtime`, `ghostty-build`, `pi-build`, `rust-build`, `codex-build`, `llvm-cc` |
| K3. A build image takes a library or stage out of another image | 19 | `wine-build` 8, `xonotic-build` 5 (FreeType, libpng), `zero-ad-deps` 3 (SDL2, from the package), `zero-ad-engine` 2 (SpiderMonkey), `rust-build` 1 (`/opt/rust-llvm`) | `zero-ad-deps`, `sdl2`, `zero-ad-spidermonkey`, `rust-llvm` |
| K4. Licence rows alone, for libraries a build image linked in | 3 | `xonotic` (SDL2 1, FreeType and libpng 2) | `sdl2`, `zero-ad-deps` |

Within K2: five packages have no `FROM` (`display`, `rust`, `cargo`, `llvm`, `mojo`); four have a `FROM` for a build step the builder cannot do (`nvim`, `lua`: `text-page` on `tools-build`; `codex`: the launcher compiled on `system`; `pi`: `janis`, `ripgrep`, `fd` installed and `pi --version` run on `system`). All nine declare `EXPORTS` after their rows (2 to 6 each).

### 3.3 Cross-cutting

- Licence rows: 54 of 108 (`zero-ad` 12/13, `nvim` 9/12, `wine` 7/15, `lua` 5/11, `xonotic` 5/6; the rest 1-2 each).
- Relocations: 5 (`classicube` `/usr/share/classicube` to `/home/dolly/classicube`; `codex` `/usr/bin/codex` to `/usr/libexec/codex`; `llvm` the compiler to `/usr/lib/llvm/compiler`; `mojo` `/opt/mojo/bin/mojo` to `/usr/bin/mojo` and `/opt/mojo/lib/mojo` to `/usr/lib/mojo`).
- Consumers with more than one `COPY` source: `xonotic` (3), `mojo` (2), `pi-local` (2).
- Consumers with no `FROM`: `display`, `rust`, `cargo`, `llvm`, `mojo`, `zero-ad`.
- Repeated rows (same source, same paths, in more than one recipe): 6 distinct rows, 14 instances: FreeType's headers and archive and libpng's archive (`xonotic-build`, `wine-build`), the FreeType and libpng licence folders (those two and `xonotic`), the SDL2 licence folder (`zero-ad-deps`, `xonotic`). 94 rows are single-use.
- Rows that a package already covers today: `pi-local`'s two rows name exactly the two paths the `llama` package exports (`demos/local-llm/Dollyfile-llama`), noted in `tasks/20261012-230015-more-packages/TASK.md:276`.

### 3.4 The reflection's numbers against this tree

| Claim | Found | Note |
| --- | --- | --- |
| 108 rows, 19 images | 108, 19 | same in both trees |
| `neovim-build` 23, `zero-ad-deps` 15, `wine-build` 15 | 23, 15, 15 | |
| 5 relocate | 5 | |
| 24 of 79 packages: 20 views, 4 `COPY` roots | reproducible at `d89bca74` under the rule "a package with a `FROM` and no `SLOP`, `RUN`, `SOURCE` or `COPY` row" (20: `amy cc core git make ninja posix session-recover transfer zig cmake libuv javascript llama box3d raylib voice freetype libpng openal`) and "no `FROM`, `COPY` rows, no `SOURCE`" (4: `display mojo rust cargo`) | `speech-to-text` (one `SOURCE`) and `llvm` (three `SOURCE` rows for licences) fall outside; counting them gives 21 + 5. The inventory's 31 (22 + 9) adds the four `COPY` packages that run a `SLOP` (`nvim`, `lua`, `codex`, `pi`); its 22nd view I could not identify. |
| Same, this tree | 19 views + 4 roots = 23 of 77 under the strict rule (`javascript` gone; `quickjs`, `janis`, `typescript` hold builds) | 9 packages have a `COPY` row |
| `docs/dollyfile.md:262` | line 272 at both `d89bca74` and `0155af64` | the audit of 2026-10-12 cited 262 for an earlier version |

## 4. The reflection's claims, checked

**"A `COPY` row declares no interface and builds nothing, so a build image serves as a library."** Partly true, with a qualification.

- True of the row: it imports no exports (`:1371`, `:1455`), and nothing can `REQUIRES` what it brought (`:1591-1594`). In K3 the consumers assert nothing about the copied libraries: `xonotic-build` has `REQUIRES LIB SDL2` and `REQUIRES LIB z` (installed) and no `REQUIRES LIB freetype` (copied).
- The recipe around the row may declare the interface: all nine K2 packages do (`EXPORTS TOOL nvim`, `EXPORTS LIB lua`, ...). The view form (`FROM builder` + `EXPORTS`) builds nothing either, and makes the same build image serve as a library (`freetype` and `libpng` are `FROM zero-ad-deps`, `cc` is `FROM system-build`). So "serves as a library" describes both forms; what differs is that the view's interface is on the package's exports and the `COPY` consumer's interface, when it exists, is written after the row.
- "builds nothing": the doc designed this (1.3): "toolchains stay in images that are only built, packages and applications keep exact outputs" (`docs/dollyfile.md:366-369`).

**"`docs/dollyfile.md:262` already says the same COPY rows in two recipes are a missing package; without the directive that sentence is the language."** Partly true.

- The sentence exists (`:272`, added `8bfcd884`). It speaks of *repeated* rows; today 6 distinct rows are repeated (3.3) and 94 rows are single-use, which the sentence does not address.
- The same commit and the same page name `COPY` rows as one of three sanctioned package shapes (`:289-293`), so the doc holds both the rule and the endorsement. Removing the directive removes the second sentence as well; whether "the sentence is the language" then depends on what replaces the 94 single-use rows (section 5).

**"24 of 79 packages are shadows of a build image (20 views, 4 `COPY` roots)."** True under the strict rule in 3.4; 23 of 77 here.

**"It follows *builds become generic*: the rows go as their packages come."** Partly supported by history, partly contradicted.

- Rows have gone when a package came: `sdl2` (15 rows to 3 `INSTALL`, `8bfcd884`), `javascript`/`ripgrep`/`fd`/`protox` (`d7e1a516`), `transfer` (`1240e208`).
- Rows have come for other reasons: 54 licence rows (a package of a statically linked library brings the library too; `llvm` instead takes its licences by `SOURCE` from `dist/static`); `lua` went from the view form to eleven `COPY` rows on 2026-10-13 to gain a man page formatted on `tools-build` (`b74634a7`); `mojo`, `pi-local`, `xonotic` take from more than one image; five rows relocate.

**"The five relocations become a `mv` in the package."** Checkable against the recipes: a `mv` needs the file in the build's filesystem and a shell. `codex` (`FROM system`) would need `FROM codex-build`; `llvm` and `mojo` have no `FROM` and would need one; `classicube`'s row is in an application `FROM pi-runtime` and would need the data installed first. So the `mv` presupposes the restructuring the reflection proposes, not today's recipes.

## 5. What a change would mean, on real cases

Alternatives that exist in today's language: (a) the view form, `PACKAGE x` / `FROM builder` / `EXPORTS` + `FILE` + `FOLDER` (the package keeps only what it declares, `docs/dollyfile.md:133-136`); (b) `INSTALL` of a package that holds the files; (c) `SOURCE` of a site file (used by `llvm` for licences); (d) the package holding its own build. Snapshot sizes quoted are the 2026-10-05 measurements in `tasks/20261005-131645-more-packages/TASK.md:53-99`; nothing was measured here.

### A. `nvim` and `lua` out of `neovim-build` (23 rows)

Today: `FROM tools-build`, three `REQUIRES TOOL`, one `SOURCE`, two `SLOP` (unpack, `text-page`), one `FILE` for the page, 12 or 11 `COPY` rows, `EXPORTS` (3 and 6).

Without `COPY`, the view form:

```
PACKAGE nvim
FROM neovim-build
EXPORTS TOOL nvim
EXPORTS FOLDER nvim-runtime /usr/share/nvim
EXPORTS FOLDER nvim-libraries /usr/lib/nvim
FOLDER /usr/share/licenses/neovim        (and 8 more FOLDER rows)
```

- Rows: about 14 against 24; `neovim-build`'s pin written once instead of 12 times.
- Lost unless replaced: the manual page. `text-page` is a tool of `tools-build` (`FROM cmake-build`), not of `neovim-build`; `lua`'s comment states this is why it left the view form (`b74634a7`). Replacements within today's language: `neovim-build` gains the formatter's build rows (the inventory records `tools-build`'s comment that "nothing should install mandoc because a page was formatted"); or the page is a `SOURCE` of a pre-formatted text file in `dist/static` (the way `llvm` takes licences); or no page.
- Build: the package build restores the whole `neovim-build` snapshot (289,140,437 bytes on 2026-10-05) and keeps the declared paths, instead of selecting 12 paths from the decoded snapshot. Not measured either way.
- Interface: unchanged (both forms end in the same `EXPORTS`); `REQUIRES TOOL nvim` passes in both.
- The "holds its build" form is a different scale: `nvim` would need the five libraries as packages first (`tasks/20261013-145359-builds-views/TASK.md:43`).

### B. `xonotic-build` and `wine-build` taking FreeType and libpng out of `zero-ad-deps` (5 and 8 rows)

Today: the rows name the headers, the two archives and the licence folders; the consumer cannot `REQUIRES LIB freetype`; `zero-ad-deps`'s pin appears 5 and 8 times; `zero-ad-deps`'s own host list (`audio@0`, ...) is irrelevant to the consumer.

Without: `INSTALL libpng` and `INSTALL freetype` (both exist since 2026-10-12 as views of `zero-ad-deps`; `libpng` installs `zlib`; `freetype` installs `libpng`). Two rows in place of five or eight; `REQUIRES LIB freetype`, `REQUIRES HEADER freetype2` become possible; the licence folders and the `.pc` files arrive by the packages' `FILE`/`FOLDER` rows; `wine-build` would also get `libpng16` headers through `EXPORTS HEADER` rather than three file rows. `zlib`'s pin must be the one the base already holds (`:1382-1394`). Cost recorded in the packages task: rebuilding both images, "Xonotic's is not this tree's to make, Wine's builds Wine, GIMP and NetSurf".

The application `xonotic` keeps its two licence rows from `zero-ad-deps` either way; the equivalents are `INSTALL libpng`/`freetype` into the game image (brings the libraries: 262 KB and 903 KB plus 878 KB of headers per the inventory, which the statically linked client does not use), `SOURCE` of the licence texts, or a `xonotic` package `FROM xonotic-build` that holds the licences and the client (C).

### C. Two-stage applications: `classicube` (3), `rts-arena` (5), `zero-ad` (13)

Today: the application is `FROM pi-runtime` (or a root of `INSTALL` rows for `zero-ad`), copies the program, data and licences from its build image, and compiles its own agent tools.

Without: one package per game, in the view form (`PACKAGE classicube` / `FROM classicube-build` / `EXPORTS TOOL classicube` / `FOLDER /usr/share/classicube` / `FILE` licence), and `INSTALL` of it in the application; `zero-ad`'s 12 licence rows become `FOLDER` rows of a `pyrogenesis` package (or of library packages). Observed consequences: `/etc/dolly/installed` of the game image then lists the game, and `amy list` shows it; the package must declare the modules its program stamps (`pyrogenesis`: `audio`, `display`, `input`, `gpu`), which the application already declares; `classicube`'s relocation of its data to `/home/dolly/classicube` becomes a `SLOP mv` after the `INSTALL`, or the package ships it there. Rows: `zero-ad` 13 rows become 1 `INSTALL` plus 13 declaration rows elsewhere. The 2026-10-05 ruling "nobody installs a game into a shell" is the recorded reason this form was not taken; `pi-local`'s two rows already have an `INSTALL llama` equivalent today.

### D. Relocations: `codex`, `llvm`, `mojo`

- `codex`: `FROM system`, copies `codex-build`'s `/usr/bin/codex` to `/usr/libexec/codex` and compiles a launcher at `/usr/bin/codex`. Without: `FROM codex-build` (338 MB snapshot on 10-05, against `system`'s 151 MB), `SLOP mv /usr/bin/codex /usr/libexec/codex`, `FILE /usr/libexec/codex`, the same `INSTALL ripgrep`/`fd` and launcher. Works in today's language; the base and the pin move.
- `llvm`: root, one row placing `llvm-cc`'s compiler beside the seed's. Without: `FROM llvm-cc`, `SLOP mv /usr/libexec/dolly/process-bin/compiler /usr/lib/llvm/compiler`, `EXPORTS FILE`, then `INSTALL cc`, which restores the seed's compiler at the vacated path. Order-dependent; works.
- `mojo`: root, five rows from two images (`mojo-build`: compiler and packages, relocated from `/opt/mojo`; `mojo-runtime`: two archives). Without: `FROM mojo-build` plus `mv`, and the archives by `INSTALL` of a package made as a view of `mojo-runtime`, or `mojo-runtime` re-based so one image holds all. One new package or one base change either way.

### E. Roots without `FROM`: `display`, `rust`, `cargo`

- `display` (4 rows from `ghostty-build`, plus a `FILE` body and two `EXPORTS`): the view form is `FROM ghostty-build` (209 MB on 10-05) with `EXPORTS LIB display`, `FILE` for the font, two `FOLDER` rows and the same `/etc/termcap` body. Same kept bytes by the rules read; the package build restores `ghostty-build` first. `display` has the most transitive dependents in the catalog (90, `tasks/20261012-230015-audit-fable/dollyfile.md:66`); its pin follows `ghostty-build`'s in both forms.
- `rust` (`/opt/rust-sdk` and licences): `FROM rust-build` (397 MB) with `EXPORTS FOLDER rust-sdk /opt/rust-sdk`, `FOLDER` licences, the launcher `FILE`, `INSTALL cc`. `cargo` the same with `EXPORTS TOOL cargo` and its `FILE` rows. The doc's reason for the `COPY` form, "leaves an expensive builder as it is", is the only recorded motive; the inventory's open question "Whether a package keeps a `COPY` result its recipe later removes (`/opt/rust-llvm`)" (`inventory.md:127`) concerns `rust-build`'s own row.

### F. Uses with no equivalent in today's language without `COPY`

1. **Files from a second image.** A recipe has one `FROM`; `INSTALL` takes packages only. `mojo` (`mojo-runtime`), `pi-local` (`local-llm-build`, `llama-build`; `llama` covers it), `xonotic` (`sdl2`, `zero-ad-deps`), `nvim` and `lua` (`neovim-build` beside `tools-build`), `rust-build` (`rust-llvm` into a toolchain `FROM rust-sdk`), `zero-ad-engine` (`zero-ad-spidermonkey` into a toolchain `FROM zero-ad-deps`). Each gets an equivalent only when a package of the second image's files exists, or when the chain is re-based. For `zero-ad-engine`, being `FROM zero-ad-spidermonkey` would also inherit Python, Cargo and cbindgen with their modules (`inventory.md:118`); the `COPY` keeps them out.
2. **Relocation without a shell.** `llvm` and `mojo` have no `FROM`; a `mv` needs one.
3. **Taking files out of an application.** `COPY` allows it ("any role"); `FROM` an application keeps everything, `INSTALL` refuses it. No row does this today (all 19 sources are toolchains or `sdl2`).
4. **A licence without its library.** 54 rows. The equivalents are `SOURCE` of the text from `dist/static` (as `llvm`) or a library package that also brings the library.

What `COPY` removal leaves untouched: the page's artifact list and cache identity (shared with `FROM`/`INSTALL`, `src/dollyfile-view.mjs:202-218`), the by-reference rule (which is written in terms of `IMPORT_COPY` at `:1401` and would lose its exception), the host scan (per retained file), and the pin cascade (every form carries pins).

## 6. What could not be found out

- Build memory and time of a package by `FROM`-restore of a large builder against `COPY` of selected paths: not measured anywhere; `5d175f65` measured `FROM` + `INSTALL` residency only.
- What "which leaves an expensive builder as it is" (`docs/dollyfile.md:292-293`) was meant to say: no task text explains it; it reads either as "the builder recipe is not touched" or "the builder is not restored".
- Why `61f4edb5` kept `COPY` from the `sdl2` package in `zero-ad-deps` instead of `INSTALL`: no message body, no comment.
- Whether a package keeps a `COPY` result its recipe later removes (`rust-build`'s `/opt/rust-llvm`): the inventory's open question, not run.
- Whether `COPY X / /` would overwrite the consumer's `/etc/dolly` control files (`:1409-1410` skips only `installed` for `COPY`): no recipe does it, not run.
- Whether the 2026-10-05 ruling "nobody installs a game into a shell" still stands after `amy` in `default` and `nena`: the owner's.
- Sizes of `zero-ad-engine`, `wine-build`, `xonotic-build`, `mojo-build` snapshots in this tree: not read.
- The inventory's 22nd "view" (3.4): not reproducible from the recipe text with any rule I tried.
- Whether `test-page`'s formatter could be a package `neovim-build` installs without the cost `tools-build`'s comment warns of: not tried.