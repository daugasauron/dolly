# `FILE`, `FOLDER`, `EXPORTS`, `REQUIRES`: the investigation

Read on `work/rust` (`integrate/round-1013`, head `9146f629`); line numbers of `src/dollyfile.c` and the `.mjs` files are of that tree. Nothing was built or run.

## Summary

1. The words are older than the shape the reflection sees. DOLLY 1 (`9e013dd9`, 2026-08-31) had `KEEP`/`KEEP-TREE` and no exports. DOLLY 2 (`c4dbe3ad`, 2026-09-03) brought `MODULE`, typed `EXPORTS`/`REQUIRES`, `FILE` (replacing `KEEP`) and `FOLDER` (replacing `KEEP-TREE`): a `REQUIRES` of every type, `TOOL` included, had to name an export of an earlier module, and a `SLOP`'s program had to be named by a `REQUIRES TOOL` or `EXPORTS TOOL` first.
2. DOLLY 3 (`99093739`, three days later) kept every word and relaxed the meaning to today's: `TOOL` checks `PATH`, `ENV` the environment, the others "an earlier object's path and basic kind"; "Assertions are optional". The discipline and the module cache went in the same commit; no message says why.
3. Export names once did resolve across modules: an aggregate re-exported a child's object by bare name (DOLLY 2 required it, DOLLY 3 allowed it). `3c8e352f` (same day as DOLLY 3) made every filesystem export carry its path; DOLLY 6 (`93cbe992`) made exports transitive, which removed the need. The `EXPORTS FILE compiler` rows of today's `Dollyfile-cc` are the survivors of that forwarding (`b9e57b14`).
4. The owner has ruled on these words once, in the Phase 3 design (`9fc8b997`, 2026-10-01): "**`REQUIRES` and typed `EXPORTS` stay; `REQUIRES TOOL slop` goes.** (Owner correction: the assertions are the explicit contract.)". The v6 design kept the types as "namespaces" and kept `REQUIRES FILE`/`ENV` although it listed them as "never used".
5. The `REQUIRES TOOL … SLOP …` pairs in one file are Phase 3's fold of 61 single-use modules into their recipes; the rows were written as module interfaces, and the fold pruned "Nothing else".
6. Today the engine checks a `REQUIRES` at its row and an `EXPORTS` when the recipe finishes; exports are retained, written to the receipt with their member paths, and loaded into every `FROM`/`INSTALL` consumer's scope; `FILE` must exist at its row; `FOLDER` captures members at its row, `EXPORTS FOLDER` at the end, and a base's capture travels unchanged into derived images (`d678b040`, the man-help task).
7. The names are read by the engine, the graph, the `/view/` page (which links a `REQUIRES` to its provider and a `SLOP`'s first word to the tool's exporter), the lint's `ENTRY` check, seven tests and the Studio skill; `amy`, the index, the start page and the page runtime read none of them.
8. Counts on 130 recipes: `REQUIRES TOOL` 681 rows (90 recipes; `cc` 75, `tar` 72, `make` 55), `HEADER` 124, `LIB` 69, `FOLDER` 2, `FILE` 0, `ENV` 0; `EXPORTS TOOL` 317, `HEADER` 93, `FOLDER` 77, `LIB` 73, `ENV` 25, `FILE` 14; `FILE` 471 (183 with a body, 288 without, 251 of those licences and manual pages); `FOLDER` 40. Every required name has an exporter somewhere; 128 of 203 exported tools, 52 of 80 headers, 30 of 59 libs, 57 of 59 folders and all 11 files are required by nobody.
9. The reflection's figures hold within the catalog's changes, except "181 of 364 `FILE` rows without a body": 181 is the with-body count. "The name is read by nothing" is partly true (no recipe looks it up; the receipt, the view and a test carry it). "One row later" is the exception: in `jq` the required tools are used 75 to 82 rows later, after the download and the compile; in `neovim-build`, `timeout` 34 rows later, after the Neovim build. For applications, `REQUIRES TOOL` is the only seal-time check of a command that `init.slop` names.
10. Not found: the reason DOLLY 3 dropped the discipline; whether a `REQUIRES TOOL` ever caught a mistake (112 commits touched the rows; none says so; `7debb6c8` added `HEADER`/`LIB` rows after a failure); the time each early check saves (needs a build).

## 1. History

### DOLLY 1, `9e013dd9`, 2026-08-31: `KEEP` and `KEEP-TREE`

`docs/dollyfile.md` at that commit: "`KEEP` names one regular file. `KEEP-TREE` recursively expands a directory to regular files after all rows finish. A missing path, directory passed to `KEEP`, non-directory passed to `KEEP-TREE`, special file, or forbidden mutable session path fails sealing." And: "There is no parallel prefetch phase, hidden dependency solver, automatic archive extraction, permission layer, or package manager." No `EXPORTS`, no `REQUIRES`. The message has no body.

### DOLLY 2, `c4dbe3ad`, 2026-09-03: modules, typed objects, the discipline

The root `Dollyfile`'s thirty `KEEP` rows became `FILE` rows and `KEEP-TREE /usr/lib/zig` a `FOLDER` row (diff of `Dollyfile` in that commit). The document (no message body):

- "A body-less `FILE` retains an already-created file."
- Types: "`TOOL name [HASH]`: an executable resolved in `/bin` or `/usr/bin`. … `HEADER name /path`: a header file or header tree. `LIB name /path`: one exact static or shared library file. `FILE name /path`: an individually named file interface. `FOLDER name /path`: a named directory interface. `ENV name value`…"
- "Names are dependency identities, not a package resolver. The path is evidence for and storage behind the identity."
- `REQUIRES`: "A module's `REQUIRES TYPE name` must be satisfied by an export visible from an earlier sibling selected by its parent. That exact object is imported into the module and is consequently available to its direct children. Nothing else from the provider leaks through. Requirements precede composition or build declarations; dependencies are never searched or reordered." The engine of that commit resolved every type, `TOOL` included, against the scope and failed with "`%s %s must be exported by an earlier USE`" (`src/dollyfile.c` at `c4dbe3ad`, the `REQUIRES` branch).
- Re-export by name: "An aggregate `EXPORTS TYPE name` must re-export an identically named object from one of its direct children. It cannot redeclare the path, value, or hash; those details are inherited exactly from the child." `modules/default.dm` at that commit is fourteen `USE` rows and thirty bare re-exports (`EXPORTS HEADER libc`, `EXPORTS LIB z`, …).
- Retention: "At the image boundary, each direct module export is retained. An aggregate therefore controls its complete public closure: a leaf object omitted from every aggregate re-export is build-private and does not enter the image." "`FOLDER /path` freezes and retains the regular files below that directory at that source position. Files created below it by a later module are not silently absorbed."
- "## SLOP tool discipline. The executable that starts each `SLOP` row must have appeared in an earlier `REQUIRES TOOL` or local `EXPORTS TOOL` row. … This is structural recipe validation, not a security boundary. A tool module also declares the ordinary command set that its execution model needs. For example, the Make module requires `cp`, while a consumer invoking Make requires only `make`; this keeps the command dependency attached to the tool that dispatches it." The engine's check: "`dollyfile: SLOP tool %s was not declared by an earlier REQUIRES TOOL or EXPORTS TOOL`".
- Module cache: "Successful leaf modules with `SLOP` build work emit a content-addressed layer containing only their declared non-temporary `FILE`/`FOLDER` paths and exact non-`ENV` exports." The declared closure was the cache unit. "Every executable module must leave `/tmp` empty when it returns".

So when the names came they had three jobs: the handle a `REQUIRES` resolved (a provider was mandatory), the handle an aggregate forwarded, and the contents of a cache layer.

### DOLLY 3, `99093739`, 2026-09-06: the same words, relaxed

Message: "Keep modules as permissive sequential recipes. Add FROM and COPY FROM using complete image artifacts, bind reuse to actual input digests, preserve exact exports and environment, and share published filesystem packs across images." Document: "`REQUIRES TOOL cc` checks command availability on `PATH`; the command need not have a declared provider. `REQUIRES ENV NAME` checks the environment. Other named assertions check an earlier object's path and basic kind. Assertions are optional and can appear wherever they are useful. A module can use undeclared tools; a command failure reports the responsible recipe and line." And "These are small runtime checks, not compatibility certificates." The discipline section, the module cache and the empty-`/tmp` rule were deleted ("V3 does not cache individual modules by their declared outputs"). The engine's `REQUIRES` branch at that commit (lines 1291-1308 then) is today's logic verbatim. Forwarding stayed: "An export without a path can forward an earlier or child object's name."

### `3c8e352f`, 2026-09-06 (same day): explicit paths

No message body. The document diff: "`FILE`, `LIB`, `FOLDER`, and `HEADER` exports require a name and an absolute path, including when exporting a child's outputs." The forwarding sentence was removed and this added: "A directory export includes the files present at that point, including additions made after a child finishes." `modules/default.dm`: `EXPORTS HEADER libc` became `EXPORTS HEADER libc /usr/include`, and so on for twelve headers and seven libs.

### `EXPORTS FILE`'s birth, `b9e57b14`, 2026-09-06

The first `EXPORTS FILE` rows were `compiler /usr/libexec/dolly/process-bin/compiler` and `kernel-plugin-abi /usr/lib/dolly/dolly-kernel-plugin-0.wasm` in the bootstrap module, re-exported bare (`EXPORTS FILE compiler`) by the aggregate. They are today's `Dollyfile-cc:8-9` and `Dollyfile-system-build` rows. The DOLLY 4 document (`6366febf`, 2026-09-30) is the first to list "`EXPORTS FILE name /path`, `EXPORTS LIB name /path` | A regular file." and states the rule in today's words: "`REQUIRES TOOL name` checks `PATH`; `REQUIRES ENV NAME` checks the environment; other types check that an earlier visible export still exists with its kind. Assertions are optional and need no declared provider."

### DOLLY 6, `93cbe992` and `d7e1a516`, 2026-10-01: each construct judged

`tasks/20261001-214000-dollyfile-v6/TASK.md` records a reason per construct (111 recipes then):

- Inconsistency 6: "Module exports were not transitive: `default.dm` spent 30 of 36 lines re-exporting its children, `python.dm` 12 of 15, and a forgotten re-export silently dropped the file from the image." Fix: "`USE URL SHA` | keep; exports become transitive | Removes the re-export ceremony and the silent-loss footgun".
- Inconsistency 7: "`EXPORTS TOOL name SHA256` (never used), `EXPORTS ENV NAME` bare (used once, only to re-export) and `REQUIRES FILE`/`REQUIRES ENV` (never used) were shapes without a recipe." The digest and the bare ENV form were dropped.
- "`FILE /path [body]` | keep | 'The image has this file, with this content when a body is given.' The `/tmp` scratch rule stays: 49 inline Makefiles and checks."
- "`FOLDER /path` | keep |"
- "`EXPORTS LIB/HEADER/FILE/FOLDER name /path` | keep | The types are namespaces: `LIB curl` and `HEADER curl` coexist in 20 modules, so collapsing them would force renames."
- "`REQUIRES TYPE name` | keep, same vocabulary | A typed, inspectable contract; the view links it to its provider."

`bb3fd571` (same day): "a recipe's own exports win over imported ones wherever they appear" (the deferred-capture rule).

### Phase 3, `9fc8b997` and `5ec4783c`, 2026-10-01: the owner's correction

Task: "Owner: 'I like the Package thing but I don't want to lose the sha stuff for absolute reproducibility'; `COMPILEC`/`SLOP`/`REQUIRES TOOL slop` is inconsistent". Then: "**`REQUIRES` and typed `EXPORTS` stay; `REQUIRES TOOL slop` goes.** (Owner correction: the assertions are the explicit contract.) `SLOP` is `RUN /bin/slop -e -c`, so a SLOP step depends on `/bin/slop` by definition: the engine rejects `REQUIRES TOOL slop` … Folded modules keep their `REQUIRES` blocks; within one recipe an identical assertion repeated by several folded blocks is kept once." The parenthesis says a draft proposed otherwise; the draft itself is not in the history (`git log -S'assertions are the explicit contract'` finds only `9fc8b997`). Implementation: "Modules, USE and .dm files go: 61 single-use modules fold into their recipes … Pruned: every `REQUIRES TOOL slop` (the language defines it) and, within a recipe, assertions, exports and retention lines repeated by several folded blocks (kept once). Nothing else." This is where `REQUIRES TOOL cc` and `SLOP cc …` came to stand in one file: before, the `REQUIRES` was a module's boundary and the `SLOP` its body.

### After Phase 3

- `adce6385`, 2026-10-06, and `tasks/20261006-103256-entry-missing`: an agent "forgot `EXPORTS TOOL neon-drift`, and `dollyfile-build` reported success". "An unretained program is the most likely recipe mistake (retention is explicit)". Sealing now names the declaration to add: "add EXPORTS TOOL name", "add FILE PATH", "add FOLDER PATH".
- `tasks/20261005-220754-man-help`: "Toolchains keep the directory with one `FOLDER /usr/share/man` row placed after their last page: the engine lists a folder's members when the row runs (`collect_paths` in `dollyfile.c`), not when the recipe finishes."
- `7debb6c8`, 2026-10-07: "Require zlib header and lib in the SpiderMonkey recipe (deps does not retain them)": two rows added, `REQUIRES HEADER zlib`, `REQUIRES LIB z`, nothing else.
- `d678b040`, 2026-10-09: "A derived image retains its base's exported folder as the base captured it: rust-build declares the SDK and licence folders itself, or the standard library it built is not in images built from it."
- `3a084b5d`, 2026-10-13: "pi-coding-agent no longer exports rg and fd … Pi's artifact test asks for those wherever a tool is exported."
- `tasks/20261012-230015-package-dependencies` (closed 2026-10-13): owner: "They already specify requires etc? No need for new syntax to manage it?" Answer, measured: "`REQUIRES TOOL|LIB|HEADER` cannot be the dependencies … 13 packages have such rows, 109 in all. 103 resolve to the toolchain the package is built `FROM`, 4 to the package's own exports, 2 to a package it installs … They describe the build."
- `tasks/20261012-230015-audit-fable/dollyfile.md` findings 3 and 4 are the reflection's text and numbers; `20261012-220109-next-round` lists them as "candidates".

### Tried and left

The row-level history has five reversals: a mandatory provider for every `REQUIRES` (DOLLY 2) became optional and `PATH`-based (DOLLY 3); the discipline came and went in three days; bare-name forwarding went to explicit paths (`3c8e352f`) and then became unnecessary (v6 transitivity); the `TOOL` digest and the bare `ENV` form went (v6); a Phase 3 draft that would have dropped the assertions was corrected by the owner. Nothing has been removed from the set of four words and six types since DOLLY 2.

## 2. What each does today

### `REQUIRES` (`src/dollyfile.c:1567-1597`)

- Syntax: two words, a type of `valid_object_type` (259-267: `TOOL LIB ENV FILE FOLDER HEADER`) or `HOST`; `REQUIRES TOOL slop` is refused before execution (1578-1581).
- Checked at the row, only when executing (1584); `install_live` parses with `execute = 0` (2202), so a session never evaluates one.
- `ENV`: `getenv` (1585). `TOOL`: `resolve_tool` (1586-1589; 695-721): walk `PATH` (or `/bin:/usr/bin`), `stat`, regular file. `HEADER`/`LIB`/`FILE`/`FOLDER`: `scope_find` in `exports` (own and installed packages' objects), then `visible` (the `FROM` base's and installed packages'; 1591-1592), then `validate_export` (1593-1594; 805-810; 778-803): `stat` the provider's path now, `FOLDER` must be a directory, `LIB`/`FILE`/`TOOL` regular, `HEADER` either. `COPY` imports no objects (1371 passes `NULL`).
- Failure: "`dollyfile: required TYPE name is unavailable`" (1596) then "`LOCATOR:LINE: REQUIRES failed (-2)`" (1654). Nothing else has run at that row.

### `EXPORTS` (1598-1623, 1658-1677, 1814-1822)

- Syntax by type: `TOOL name` alone; `ENV NAME [APPEND] VALUE`, applied now (1616-1621); the others `name /path` with a retainable absolute path (1611-1613). Added to `own` and `exports` (1622-1623); not checked at the row.
- At the end, `finish_exports` (1658-1677): `ENV` takes the final value; the rest `capture_export_members` (814-833): resolve the path (`TOOL` through `PATH`, its detail becomes the resolved path), `collect_paths` (727-755) the file or whole tree, sorted. Failure: "`dollyfile: missing exported TYPE name: …`" (1671). Then every member is retained (`retain_export`, 1816-1818).
- The receipt `/etc/dolly/artifact` (`write_artifact_receipt`, 1016-1052) records each export as type, name, detail and member list; `read_artifact_receipt` (1075-1147) validates and loads them into the consumer's scope on `FROM` and `INSTALL` (1143, 1455-1458). A package recipe takes installed objects into `visible` but not into its own `exports` (1456-1457, `keep`).
- `/etc/dolly/environment` holds `ENV` values (1847-1883); nothing else of an export is written outside the receipt and the manifest.

### `FILE` (1633-1640) and `FOLDER` (1641-1645)

- `FILE /path`: one path; under `/tmp/` allowed, under `/workspace` not (1636); the body written (1637); then `validate_export("FILE", …)` at the row (1638): the file must exist now and be regular; retained unless scratch (1639-1640).
- `FOLDER /path`: must be a directory now (1644); `collect_tree` at the row (1645): the members it has then.
- Documented: `docs/dollyfile.md:93-94`, `116-118`, `200-202`.

### Sealing's use of the words

`entry_retained` (2077-2106) checks `ENTRY`'s words against the retained set; `report_unretained_entry` (2056-2069) says "add EXPORTS TOOL name" when the path is what `PATH` resolves the basename to, "add FOLDER" for a directory, "add FILE" otherwise. Only `ENTRY`'s own words are read; the body of `/etc/dolly/init.slop` is not.

### Who reads the names

- Engine: as above; in a consumer, a name is read only by a `REQUIRES` of the same type and name.
- `src/dollyfile-view.mjs`: `REQUIRES` 227-239, `EXPORTS` 240-255, `FILE` 256-263, `FOLDER` 264-269; returns `requirements, exports, files, folders` (305-308).
- `src/dollyfile-graph.mjs`: merges artifacts, requirements and exports in line order (48-52); an export makes a name visible (93-96); a requirement becomes an edge to its provider if one is visible, silently none otherwise (97-106; "an inspection graph, not a dependency solver", 11-13).
- `scripts/render-dollyfile-view.mjs`, the `/view/IMAGE/` page (`generate-routes.mjs:74-79`): `renderRequirement` (30-45) links the name to `../../view/PROVIDER/#export-type-name`; `renderExport` (47-61) sets that anchor; `renderSlop` (83-94) links a `SLOP`'s first word to the tool's exporter when a `REQUIRES TOOL` edge exists. This is the "view links it to its provider" of the v6 reason.
- `scripts/lint-dollyfiles.mjs` `declares` (15-21): `files`, `folders`, exports (`TOOL` by name, others by path) and `COPY` destinations, for the `ENTRY` check (28-39). `REQUIRES` is not read.
- Tests: `test/fixtures/dollyfile-cases.mjs:30-61` (deferred `EXPORTS FOLDER` capture, `EXPORTS FILE` replaced by two bodies, missing `LIB`/`FOLDER`, bare `FOLDER`/`FILE` failing at the row, `REQUIRES TOOL absent-tool`); `test/dollyfile-catalog.test.mjs:10-25` (licences by `FILE` rows), `27-47` (a `SOURCE` destination retained through `files`, `folders`, export paths or an exported `TOOL`), `50-56` (`TOOL slop` implies `ENV SHELL`); `demos/python/test/recipes.test.mjs:21-25` (named `REQUIRES TOOL`/`HEADER` rows, export keys); `demos/pi/test/recipes.test.mjs:17-22` (`REQUIRES LIB`/`HEADER` edges resolve to `quickjs` and `janis`), `:45` (`REQUIRES TOOL cc`); `demos/pi/test/tools.artifacts.mjs:17-27` (a manifest holds Pi's tool files exactly when `TOOL:x` is exported); `demos/javascript/test/recipes.test.mjs:15-17` (exact export sets).
- `demos/studio/skills/dollyfiles/SKILL.md:48-52` teaches agents: "`FILE` and `FOLDER` keep files in the image … The image keeps a compiled program only when the recipe exports it: compile to `/usr/bin` and add `EXPORTS TOOL name`". `REQUIRES TOOL`/`HEADER`/`LIB` are not taught.
- Not readers: `src/commands/amy.c` (reads `/etc/dolly/installed`, the index, `/etc/dolly/files/NAME`); `scripts/generate-routes.mjs`, `image-menu.mjs` (no export); `src/image-artifact.mjs`, `runtime-worker.mjs` (host requirements only).

### The failure with and without the row

- A missing tool. With `REQUIRES TOOL x`: two lines at that row, nothing run. Without: the `SLOP` runs, Slop prints "`slop: x: command not found`" (`src/slop.c:3047`), status 127, and the engine prints "`LOCATOR:LINE: SLOP failed (127)`" (1654). Same line precision; the time differs by everything between the two rows. A tool named inside a Makefile or script fails inside `make` or the script with their message; the engine names only the `SLOP` row.
- A missing header or library. With `REQUIRES HEADER zlib`: "`required HEADER zlib is unavailable`" before the compile. Without: the compiler's "file not found" or the linker's error, after the download, the extraction and the compile up to that unit.
- A missing exported object: "`missing exported LIB name`" when the recipe finishes; a `FILE /p` that does not exist: "`FILE failed (-2)`" at its row.

## 3. Counted from the recipes

130 recipes (`Dollyfile*` and `demos/*/Dollyfile*`, not `.txt`): 20 `APPLICATION`, 33 `TOOLCHAIN`, 77 `PACKAGE`. The reflection read 133 on `main` at `d89bca74`; since then Qwen 3.5 4B's five recipes went (`21cc75b4`), `gpu-sdk` and `audio-sdk` went (`b005aad5`), `javascript` and `typescript-build` became `quickjs`, `janis` and `typescript` (`d8281852`).

Rows: `REQUIRES` 1411 (`HOST` 535, `TOOL` 681, `HEADER` 124, `LIB` 69, `FOLDER` 2, `FILE` 0, `ENV` 0); `EXPORTS` 599 (`TOOL` 317, `HEADER` 93, `FOLDER` 77, `LIB` 73, `ENV` 25, `FILE` 14); `FILE` 471; `FOLDER` 40; `SLOP` 776; `COPY` 108; `INSTALL` 87.

`FILE`: 183 with a body (100 under `/tmp/`, 75 elsewhere, 8 licences/pages); 288 without (251 under `/usr/share/licenses` or `/usr/share/man`, 37 elsewhere). Licences and pages also take 8 of the 40 `FOLDER` rows.

`REQUIRES TOOL`: 681 rows, 75 names, 90 recipes. `cc` 75, `tar` 72, `make` 55, `mkdir` 51, `cp` 42, `gzip` 42, `rm` 39, `ar` 36, `c++` 23, `text-page` 22, `test` 21, `ln` 15, `sed` 12, `cmake` 12, `grep` 11, `mv` 10, `patch` 10, `cmp` 9, `echo` 8, `cargo` 7, `python` 7, `time` 7. Most rows: `cmake-build` 24, `llvm-build` 16, `neovim-build` 16, `mojo-build` 15, `zero-ad-spidermonkey` 15. Every required tool name is exported as `TOOL` by some recipe.

`EXPORTS FILE`: 14 rows, 11 names, 12 recipes: `compiler` (`Dollyfile-cc`, `Dollyfile-system-build`, `llvm-cc`), `kernel-plugin-abi` (`cc`, `system-build`), `llvm-compiler`, `minicpm5-2b`, `local-model-provider`, `qwen3.5-2b`, `parakeet`, `pi-menu`, `silero-vad`, `openal-pkgconfig`, `pyrogenesis`. Required: none.

`EXPORTS FOLDER`: 77 rows, 59 names, 46 recipes. Required twice: `process-sdk` (`Dollyfile-system-build:414`, provided by its own row 71 and `Dollyfile-cc:10`) and `typescript` (`demos/pi/Dollyfile-pi-build:19`, provided by `demos/javascript/Dollyfile-typescript:33`). 57 names required by nobody; 22 of them are licence or source folders.

`EXPORTS HEADER`: 93 rows, 80 names; 28 required (`libc`, `zlib`, `zconf`, `curl`, `lua`, `uv`, `luv`, `treesitter`, `utf8proc`, `quickjs`, `event`, `event2`, `sdl2`, the module headers `gpu`, `display`, `input`, `http`, `dso`, …), 52 never. `EXPORTS LIB`: 73 rows, 59 names; 29 required (`z`, `curl`, `ffi`, `lua`, `luv`, `SDL2`, `quickjs`, `dolly-js`, `event_core`, `llama`, `ggml*`, `c++`, …), 30 never. `EXPORTS TOOL`: 317 rows, 203 names; 75 required, 128 never. `EXPORTS ENV`: 25 rows, 13 names; none required.

By role: packages hold 180 of the `TOOL` exports, 39 `HEADER`, 31 `LIB`, 30 `FOLDER`, 7 `FILE`; toolchains 116, 53, 40, 32, 5; applications 21, 1, 2, 15, 2.

Against the reflection: `FOLDER` 41 → 40 (one Qwen 4B row); `EXPORTS FILE` 18 → 14 (the four 4B shards); `EXPORTS FOLDER` 78 → 77 (the split: −2 +1); `REQUIRES TOOL` 678 → 681 (the split: −11 +13); `REQUIRES ENV` 0 and `REQUIRES FILE` 0 hold; "required twice" holds; "73 `cc`, 71 `tar`" are 75 and 72. "181 of 364 `FILE` rows without a body" matches neither this count nor the audit's own (155 with, 137 without, `audit-fable/dollyfile.md` finding 4); the SLOP investigation on the same tree found 471 rows and 181 with a body. "256 rows retain licences and manual pages by hand": 259 `FILE` rows here, plus 8 `FOLDER` rows.

## 4. The reflection's claims, checked

- "Retention is said four ways." Partly. Four spellings retain, and each differs in when and what: `FILE /p` demands the file at its row (1638); `EXPORTS FILE name /p` is checked when the recipe finishes and may precede its file (`docs/dollyfile.md:191-192`; the fixture "replaced"); `FOLDER` takes the members present at its row (1645; the man-help task placed `FOLDER /usr/share/man` "after their last page" for that reason); `EXPORTS FOLDER` takes them at the end, and a base's capture travels unchanged into derived images (`d678b040`; `retain_export` re-adds the base's member list, not the directory). `EXPORTS` objects cross into consumers' scope, receipts and the view; `FILE` and `FOLDER` paths do not.
- "`EXPORTS FILE name /p` (18; `REQUIRES FILE` is used 0 times, so the name is read by nothing)." 0 uses: true. "Read by nothing": partly. No recipe looks the name up. The engine writes it with its member to every consumer's receipt and loads it into scope (1034-1046, 1117-1145); the view gives it an anchor nothing links to; `test/fixtures/dollyfile-cases.mjs:38` and `test/shell-env-browser.mjs:14` and `test/image-browser.mjs:58` use the row; the audit's wording "never looked up" is the exact one. What the name adds over `FILE /p` in these 14 rows is the end-of-recipe check and the receipt entry.
- "`EXPORTS FOLDER name /p` (78; required twice)." True (77 here).
- "`REQUIRES TOOL` is 678 rows, the largest class after `SLOP`." 681; true as a class (`SLOP` 776).
- "It resolves a name on `PATH` (`src/dollyfile.c:1586-1589`)." True.
- "which the first `SLOP` that uses the tool does one row later." Partly. The check is the same (a `PATH` search) and the failure names the line either way. "One row later" is rare: `jq` requires `make`, `test`, `text-page` at rows 12-15 and uses them at 90, 92, 97, after `SOURCE` (17), `tar` (18), four `FILE` writes and `make -j4`; `neovim-build` requires `cmake` at 81 and uses it at 85, but `timeout` at 176 and uses it at 210, after the Neovim build (177-209); `python` requires `test`, `mv`, `c++` at 26, 23, 19 and uses them at 291, 297, 359. A tool a Makefile calls (`cc`, `ar` in `Dollyfile-zlib:21-22`) fails inside `make`, not at a `SLOP` row. The DOLLY 2 document's reason for rows like `make`'s `cp` was dispatch, not timing.
- "73 rows say `cc`, 71 `tar`." 75 and 72.
- "`REQUIRES ENV` has code (1585) and 0 uses." True; the v6 task knew it on 2026-10-01 ("never used … shapes without a recipe") and kept it ("keep, same vocabulary").
- "`REQUIRES HEADER` and `LIB` look up an export (1591-1594): that is the check of an interface, and it stays." True of the code; the same four lines serve `FILE` and `FOLDER`. What the check proves is that an earlier recipe of the chain declared the name and the path exists now with its kind; the DOLLY 3 document called them "small runtime checks, not compatibility certificates". The one commit that touched such rows for a cause, `7debb6c8`, added them after a failure rather than before one.
- "It changes the language (`DOLLY 7`), the engine in the seed and about 700 rows." The four kinds named are 681 + 14 + 77 + 2 = 774 rows here; `src/dollyfile.c` is compiled by `bootstrap.c` from the seed, so every image rebuilds (the audit's scope note: one catalog round, 5 h 36 min for v0.1.2).
- Implied by the audit's finding 3, "documentation with a redundant check": the rows were written as module boundaries under a rule that required a provider (DOLLY 2), were kept by the owner against a Phase 3 draft as "the explicit contract", and were folded into recipes with "Nothing else" pruned. The package-dependencies task measured that they "describe the build" and cannot be install-time dependencies.

## 5. On real recipes

### `demos/tools/Dollyfile-jq` (package, 98 lines)

Rows of these kinds: `REQUIRES HEADER libc` (9), `REQUIRES TOOL cc echo make tar test text-page` (10-15), `EXPORTS TOOL jq` (94), `FILE` ×3 for two licences and the page (95-98). What each gives: the `REQUIRES` block is the only place the recipe lists what it takes from `tools-build`; `amy info jq` prints the `INSTALL` row, not the tools. A missing `text-page` fails at row 15, before the 1 MB download, the extraction, four `FILE` writes and `make -j4`; without the row, at row 97. On the `/view/jq/` page, `cc`, `make`, `tar` in the `SLOP` rows link to their exporters only through those edges. `EXPORTS TOOL jq` is the only row that keeps `/usr/bin/jq`: a package has no `ENTRY`, so without it the build seals green with no program; `test/dollyfile-catalog.test.mjs` does not list `jq`; `test/amy-browser.mjs` would see it. The licences are `FILE` rows; a path convention would make rows 95-96 and 98 implicit.

### `Dollyfile-zlib` (42 lines) and `demos/tmux/Dollyfile-libevent` (144 lines)

`zlib`: `EXPORTS LIB z /usr/lib/libz.a`, `HEADER zlib`, `HEADER zconf` (33-35), `FILE` licence (36). Eleven recipes require `HEADER zlib` or `LIB z` (`gzip`, `system-tools`, `rts-build`, `python`, `classicube`, `cmake-build`, `mandoc`, `sqlite`, `zero-ad-deps`, `rust-sdk`, `wine-build`). In `sqlite`, `INSTALL zlib` (19) loads zlib's receipt into `visible`, and `REQUIRES HEADER zlib` (22) finds `/usr/include/zlib.h` there and stats it before `make` (60). Without the exports the archive and headers would still need rows to be retained; the names would leave the receipt; the twenty `REQUIRES` rows would have no provider and `dollyfile-graph` would draw no edge; the `pi` test's provider assertions (`demos/pi/test/recipes.test.mjs:17-22`) is the pattern that would have nothing to check. `libevent`: `EXPORTS HEADER event2 /usr/include/event2` (141) retains a directory by name, captured at the end, after `make` wrote it (137); a `FOLDER /usr/include/event2` would have to stand after row 137, because the directory does not exist before `mkdir` at 136. `tmux` requires `event`, `event2`, `event_core` (`demos/tmux/Dollyfile-tmux:15-18`).

### `demos/python/Dollyfile-python` (package, 425 lines) and `demos/neovim/Dollyfile-neovim-build` (toolchain, 255 lines)

`python`: a `REQUIRES` block of 18 rows (10-27) before a build the SLOP investigation measured at 215 continuation lines, a second block before CPython (107-111), `EXPORTS LIB python`, `HEADER python` (334-335) that no recipe requires (seven recipes require `TOOL python`), `EXPORTS FOLDER python-stdlib /usr/lib/python3.14` (379) captured at the end, and `FOLDER /usr/lib/python3.14/site-packages` (401) at its row after pip's install, the man-help placement. Both folder forms in one recipe, each used for its timing. `neovim-build` is seven folded sub-builds; its `REQUIRES LIB lua` (80), `HEADER luv` (165), `LIB treesitter` (172) resolve against the recipe's own earlier exports (54, 106, 160) through the `exports` scope first (1591): a within-recipe check between stages, the DOLLY 2 module boundary in one file. `EXPORTS FOLDER nvim-libraries /usr/lib/nvim` (214) is captured at the end, so the parsers built later (224-250) are in it. `REQUIRES TOOL timeout` (176) is used at 210, after the Neovim CMake build.

`demos/neovim/Dollyfile-nvim` (package, 31 lines) copies `/usr/bin/nvim`, `/usr/share/nvim`, `/usr/lib/nvim` and nine licence directories by path (17-28) and restates `EXPORTS TOOL nvim`, `FOLDER nvim-runtime`, `FOLDER nvim-libraries` (29-31): `COPY` imports no objects, so the restatement is the only machine-readable interface the package has (its receipt); `amy files nvim` lists paths, not names.

### Applications: `demos/pi/Dollyfile-pi-agent` (47 lines), `Dollyfile` (default), `demos/neovim/Dollyfile-neovim`

`pi-agent`: `REQUIRES TOOL foreground test printf pi` (14-17), no `EXPORTS`, two `FILE` bodies, `ENTRY /bin/foreground -i /bin/slop /etc/dolly/init.slop`. Sealing checks `/bin/foreground` and `/bin/slop`; `/usr/bin/pi` is named only inside `init.slop`'s body, which the engine does not read. Row 17 is therefore the only seal-time check that `pi-runtime` provides `pi`; without it a base that lost `pi` seals green and opens to Slop's "command not found" inside `init.slop`, the blank-terminal class of `tasks/20261006-103256`. `default` does the same for `foreground`, `test`, `echo` after its eight `INSTALL` rows (`Dollyfile:28-30`). The `neovim` application has no `REQUIRES` row; `/usr/bin/nvim` is named only in `init.slop` (29); nothing checks it at seal (the `INSTALL` of `nvim` brings it; the lint's `declares` reads `ENTRY`'s words only).

## 6. Not found out

- Why DOLLY 3 dropped the provider rule and the discipline: `99093739`, `3c8e352f`, `34bdbc98` and `c4dbe3ad` have no message body or none on this; the DOLLY 3 document states the new rule, not the reason.
- Whether a `REQUIRES TOOL` row has ever failed a real build: 112 commits touched such rows in recipes (`git log -S'REQUIRES TOOL' -- Dollyfile* demos/*/Dollyfile*`); none says so; build logs are not in the repository. The audit's "36 commits" counted a smaller catalog.
- What the Phase 3 draft proposed before the owner's correction, and the full sense of "the assertions are the explicit contract": one parenthesis in the task. The owner's 2026-10-13 question ("They already specify requires etc?") reads the rows as dependency statements; the closed task measured that they are not.
- How much time each early check saves per recipe: needs a build; no measurement exists for a failing `REQUIRES` against a failing `SLOP`.
- Whether `demos/studio/lint.mjs` or Studio's prompts read export names: `lint.mjs` was not read; the skill file does not mention `REQUIRES TOOL`.
- Whether the `HEADER`/`LIB` checks have failed a build since Phase 3: `7debb6c8` is the one commit that names them, and it adds rows after the fact.