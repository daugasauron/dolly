# The three roles, `APPLICATION`, `TOOLCHAIN` and `PACKAGE`: the investigation

Read at `/home/daug/dev/dolly/work/rust` (branch `integrate/round-1013`, head `9891ec00`), history shared with `main`; the reflection's tree is `d89bca74`. Nothing was built or run; every number comes from `git`, `grep`, `awk` over the recipe text, and the files. Paths are relative to the tree root unless they name a task.

**Summary (findings, no advice)**

1. The three words came on one day, 2026-10-01: four roles in the v6 design (`93cbe992`, `APPLICATION`, `TOOLCHAIN`, `PACKAGE`, `MODULE`), three when Phase 3 removed `MODULE` (`5ec4783c`). The owner's own list was three: "image roles cover application, build toolchain and package" (`tasks/20261001-214000-dollyfile-v6/TASK.md:26-29`).
2. The recorded reason: before v6 the start page guessed "build images" from a name regex and openability from `display@0`, and the owner "finds it odd that `javascript`, `python` and `ripgrep` are listed as applications; they read as build images" (`:14-16`). The role word replaced the guess; the design calls it "the one fact the tools had to guess" (`:84`).
3. Two things the reflection reports as findings were written into the design: "Openability is `ENTRY` plus `display@0`, not the role, so `system`, `rust-tools` and `typescript-build` stay inspectable while `system-build` only builds" and "`FROM` may name an application: `pi-local` extends `pi` and `dollyfile-studio` extends `pi-local`" (`:120-123`).
4. In the engine `APPLICATION` and `TOOLCHAIN` differ by one check (`src/dollyfile.c:1810`); `PACKAGE` differs by four (`:1373`, `:1401`, `:1435`, `:1648`) and the three words are the receipt's vocabulary (`:1023`, `:1093-1099`), which is how `FROM` a package and `INSTALL` a toolchain are refused from the sealed artifact.
5. Outside the engine the role is the only key of: the start page's three groups, the package index `amy` reads, the `packages@0` service's gate, release acceptance's skip list, GitHub Pages' "Hosted on" group, and the lint's `display@0` rule.
6. Counted: 130 recipes, 20 applications, 33 toolchains, 77 packages. 31 of 33 toolchains have `ENTRY` and `display@0` and a boot route; the 2 without are the two v6 stripped. Eight toolchains whose README says "build-only" have an `ENTRY`. `rust-tools` is a toolchain nothing builds on. Two applications are `FROM` bases, by design. No `INSTALL` names a non-package. `sdl2`, a package, is a `COPY` source.
7. The reflection's "32 of 34 toolchains have `ENTRY` and open" is true at `d89bca74`; "`zero-ad FROM default`" was already false there (`eb737786`, same day); its line numbers (`1810`, `1401`, lint `68`) are right in both trees.
8. "One check": true of the engine, not of the tools. "The split that matters is `:1401`": partly; three other package effects exist. "The lint's display rule names a module where 'has an ENTRY' says it": partly; "opens" has been `ENTRY` and `display@0` together in three places since v6, and `display@0` alone was the test before v6; `ENTRY` alone has never meant "opens" in this tree.
9. Five recipes changed role in the history, all toward `PACKAGE` (`sdl2-build` on 10-05; `pi`, `codex`, `speech-to-text`, `mojo` on 10-13, each with a renamed application that opens into it). No recipe went the other way; two toolchains were deleted (`gpu-sdk`, `audio-sdk`, `b005aad5`).
10. Not found: why the eight build-only toolchains keep an `ENTRY` (no task or commit says); whether a two-role language was weighed before the audit of 2026-10-12 (no record); whether the lint's display rule ever caught a recipe.

---

## 1. History

### 1.1 Before roles: DOLLY 2 to 5 (2026-09-03 to 2026-10-01)

- From DOLLY 2 (`c4dbe3ad`, 2026-09-03) a recipe's second line was `IMAGE name` or `MODULE name` (`93cbe992^:docs/dollyfile.md:43`); modules were `.dm` files run inline by `USE`. Every image needed an `ENTRY`: "Image only, last declaration: the program the image runs" (`:66`).
- Openability was `display@0`: "Images without `display@0` only build: their route shows the log and never runs ENTRY" (`:195-196`). The route generator's `headless` set was first "no `ENV:DISPLAY` export" (`018c5f27:scripts/generate-routes.mjs:28`, 2026-09-27), then "no `display@0`" (`faf8f364`, 2026-09-30; `93cbe992^:scripts/generate-routes.mjs:32`).
- "Build images" were a name regex: `isBuild = image => /-(build|sdk|runtime|tools)$/.test(image) || image === "system"` (`93cbe992^:scripts/generate-routes.mjs:37`). Its history: `64041b6a` (2026-09-09, "build images last"), `2c441d4b` (2026-09-13, "Separate compiler builders from the interactive system image"), `d72dbb5c` (2026-09-14, "Keep headless compiler bases in the build image section"), `7bac1871` (2026-09-30), `a7cd1327` (2026-10-01). The doc's vocabulary was "build-only image": "`COPY FROM` a build-only image (no `display@0`) is the multi-stage mechanism" (`tasks/20260930-223000-dollyfile-design/TASK.md:30`; restored by `05e6bd8b`).
- The third kind has its origin in the packages task, from the owner's question of 2026-09-30, "would a package manager fit the build images" (`tasks/20261001-001000-packages/TASK.md:7`): a lean image for installing was proposed (`:43-49`) and the finding was that "`COPY FROM` imports no exports, so a package's `ENV`/`TOOL` objects" were lost (`:49`).

### 1.2 Dollyfile 6: four roles (2026-10-01)

The design task `tasks/20261001-214000-dollyfile-v6/TASK.md` records the owner's input and the reasoning.

- Inputs: "image roles: the owner finds it odd that `javascript`, `python` and `ripgrep` are listed as applications; they read as build images" (`:12-16`).
- Owner additions, 2026-10-01 evening: "image roles cover application, build toolchain and package; a package's exports import the same way for recipes and amy" and "An organized catalog: explicit roles, a consistent naming scheme for build and package images, grouping on the start page and in the index amy reads, and no name-suffix guessing in `scripts/generate-routes.mjs`" (`:26-32`).
- Starting point: "It did not say what an image is *for*, so the start page guessed roles from name suffixes, the registry from `display@0`, and a lean image meant for installing had no import that carried its exports. v6 makes the role explicit and gives each role one import verb; the rest follows." (`:41-47`).
- Inconsistencies 3 and 4: "An image's role was implicit: the menu's 'Build images' came from a name regex ... the boot route from `display@0`. `javascript`, `python` and `ripgrep` were listed as applications; `ripgrep` was named like an application and built like `fd-build`." and "Every image needed an `ENTRY`, including headless builders (`system-build`, `zig-build`: `ENTRY /bin/slop`, never run) and 27 images whose ENTRY was the same shell line." (`:55-62`).
- The table: `IMAGE name` becomes "`APPLICATION`, `TOOLCHAIN` or `PACKAGE name`: The role is the one fact the tools had to guess (3). The kind word is the role, so nothing else is needed to state it." (`:84`). `ENTRY`: "required for applications, optional for toolchains, none for packages: Explicit openability (4): a toolchain with ENTRY can be opened; one without only builds. `system-build` and `zig-build` lose their dead ENTRY." (`:101`). Receipt: "version 4: Records the role, so `FROM` and `INSTALL` can check their target" (`:103`).
- The roles section (`:110-123`) had four rows, `MODULE` the fourth, and the paragraph quoted in the summary: "`TOOLCHAIN` names every image other recipes build on: SDKs, runtimes and build stages alike. Openability is `ENTRY` plus `display@0`, not the role ..." and "`FROM` may name an application".
- Catalog decisions in the same design: "`sdl2-build`, `pi-build`, `neovim-build` stay toolchains: `pi` needs `PI_PACKAGE_DIR` and `neovim` would collide with the `neovim` application; both are demo decisions for later" (`:142-144`); "`PATH` composition is not an install feature (`rust-sdk` therefore stays a toolchain)" (`:158-159`).
- Implementation `d7e1a516` (same day): "ENTRY is required for applications, optional for toolchains and absent elsewhere ... the browser's build-only rule follow ENTRY instead of name suffixes ... headless toolchains drop their dead ENTRY". The lint's "an APPLICATION needs display@0 to be opened" was born in this commit (`git show d7e1a516 -- scripts/lint-dollyfiles.mjs`, lines 43-44 of the diff); the route generator's `openable = entry && display@0` replaced `headless` and `isBuild` (diff lines 55-67, 97-98). The task records it as "lint requires `display@0` for applications" (`:299`).
- `0057ef9d` (same day, 22:46): "COPY is role-agnostic in the spec". The doc's table lost `COPY` from the "Imported by" column of `TOOLCHAIN` and `PACKAGE`; the line "`COPY` takes files out of an image of any role" came (`docs/dollyfile.md:63` today).

### 1.3 Phase 3: three roles, explicit hosts (2026-10-01 night, `9fc8b997`, `5ec4783c`)

- "`MODULE`, `USE` and `.dm` files go. 61 of 68 modules had one user, so they were recipe fragments, not reuse" (`:191-202`). From here the roles are three.
- "Receipt v5 records the role, the host list and the exports" (`5ec4783c` message).
- Owner correction: "Host requirements are explicit and never inherited ... A package declares the modules its programs need, and `INSTALL` checks that the installing recipe declares them too." (`:217-231`). So the hosts rule is written per image, the same for all three roles; the package-specific part is a check on the `INSTALL` row (engine `:1109-1114`, keyed on the import mode, not on the recipe's role).

### 1.4 After: every change to what a role means or permits

| When | Commit or task | What changed |
| --- | --- | --- |
| 2026-10-05 | `8bfcd884` | The rule entered the doc: "A package is what a session would install or more than one image uses; an application is then a base and INSTALL rows" (message). `sdl2-build` `TOOLCHAIN` became `PACKAGE sdl2`, the only toolchain-to-package flip. Owner, same day: "Make more things into packages, it works really nicely." (`tasks/20261005-131645-more-packages/TASK.md:7`). Ruling: "ClassiCube and Seven Kingdoms: one consumer each ... nobody installs a game into a shell" (`:149-150`). Counts before/after: 13/24/14 to 14/23/21 (`:41-43`). |
| 2026-10-05 | `d4ab4f63` | `core`, `cc`, `amy` as packages; "A recipe without FROM keeps only what it installs, so the lean base needs no engine change"; "An image without the engine opens but is not a FROM base: the builder runs the base's /bin/dollyfile" (message). FROM-ability in practice needs the engine in the base; no role states that (today `docs/dollyfile.md:138-140`: `default` "is not a base to compile on: `FROM` a toolchain for that"). |
| 2026-10-06 | `9d9064b3` | `default` became an `APPLICATION` with no `FROM`, a composition of `INSTALL` rows. Roots stopped being toolchains only; today's roots that are not packages: `system-build` (toolchain), `default` and `zero-ad` (applications). |
| 2026-10-06 | `adce6385` | Sealing checks the whole `ENTRY` line against the retained set, for any role that has one. |
| 2026-10-06 | `7ae80700` | The package index published at the site root; `amy` describes packages. Membership is by role (`scripts/generate-routes.mjs:57-61`). |
| 2026-10-07 | `tasks/20261007-003116-package-needs/TASK.md:83` | "`gpu-sdk`, `audio-sdk`: named in the brief, but they are TOOLCHAIN images, not packages: `amy install` cannot name them". |
| 2026-10-12 | `tasks/20261012-130814-packages/TASK.md` | Owner: "Break out everything (that makes sense) into packages that are installable with amy." (`:7`). The rules (`:34-44`): "Not a package: a demo's own program and data (a game is opened at its route); a build stage (`*-build`, `rust-llvm`, `llvm-tablegen`); a host-module set without files (`gpu-sdk`, `audio-sdk`: a package cannot add a module to a booted image)." |
| 2026-10-12 | `tasks/20261012-230015-audit-fable/dollyfile.md:85-87` | Point 13: "`APPLICATION` and `TOOLCHAIN` differ by one check ... Do: two roles, `IMAGE` and `PACKAGE`; 'opens' is a property (ENTRY + display), which `generate-routes.mjs:37` already computes." The reflection's section is this point restated; the two-role proposal first appears here. `packages.md:47` of the same audit: "`llvm-runtimes` is a package nobody can use ... Do: `TOOLCHAIN`, or delete". |
| 2026-10-13 | `4f570736`, `78ed31c2`, `8e313e4d` | `APPLICATION pi`, `codex`, `speech-to-text`, `mojo` became `PACKAGE`; the images that open into them were renamed `pi-agent`, `codex-agent`, `speech-to-text-mic`, `mojo-gpu`. The convention is in the doc: "An application that opens into a package takes another name" (`docs/dollyfile.md:69-76`). The messages give the naming reason only ("what a person types"). |
| 2026-10-13 | `b005aad5` | `gpu-sdk` and `audio-sdk` toolchains deleted: "Each of the two added no file to `system`: it existed to pin one REQUIRES HOST line". |
| 2026-10-13 | `d8281852`, `4b313b9c` | `typescript-build` toolchain gone (three packages hold their builds); `tools-build` toolchain added ("Build-only: `cmake-build` with mandoc"). |
| 2026-10-13 | `2283e960` | By-reference install: `keep = !(package_recipe && mode != IMPORT_COPY)` (`:1401`); doc: "a package keeps `COPY` results and neither of the other two" (`docs/dollyfile.md:201-202`). |
| 2026-10-13 | `6a335083`, `54dd8eb7` | `amy list` prints the README description; the route generator removes the page of a name that no longer opens. |

Counts over time: 13/24/14 (2026-10-05 before), 14/23/21 (after), 19/35/49 (audit, 2026-10-12, `packages.md:33`), 20/34/79 (`d89bca74`), 20/33/77 (this tree).

### 1.5 Reasons in the history that the reflection does not cite

- The role replaced two guesses the owner found wrong (1.2). The reflection's proposal, "'opens' is a property", is the second of those guesses (`display@0`, now `ENTRY` and `display@0`), which the design kept as the openability test and did not make the role.
- Toolchains that open and applications that are bases are design sentences, not drift (`:120-123`).
- The receipt carries the role "so `FROM` and `INSTALL` can check their target" (`:103`). The check runs against the sealed artifact of the imported image (`:1093-1099`, `:1373`), not against the consumer's text.
- The rules of 10-05 and 10-12 about what is and is not a package are written in terms of the toolchain/application distinction ("a build stage", "a game is opened at its route").
- The owner's three statements on the subject are all about packages being a kind of their own (`:26-29`; 10-05; 10-12). No owner statement about the application/toolchain line beyond the javascript/python/ripgrep remark was found.

## 2. What a role does today

### 2.1 The engine, `src/dollyfile.c` (head `9891ec00`; `:1401` and `:1810` are the same lines at `d89bca74`)

| Line | What | APPLICATION | TOOLCHAIN | PACKAGE |
| --- | --- | --- | --- | --- |
| `:224-230` | the three words; `recipe_kind` | | | |
| `:1533-1547` | second declaration must be a role and a valid name, else "expected APPLICATION, TOOLCHAIN or PACKAGE with a valid name" | | | |
| `:1551` | `package = strcmp(*kind, "PACKAGE") == 0`, the only role variable in `process_line` | 0 | 0 | 1 |
| `:1373-1377` | the imported image's role: `FROM` refuses a package, `INSTALL` refuses a non-package, `COPY` any | FROM-able | FROM-able | INSTALL-able |
| `:1401`, `:1432`, `:1452`, `:1456-1457` | `FROM`/`INSTALL` files, environment names and exports kept only outside a package; `COPY` kept always | keeps | keeps | keeps `COPY` only |
| `:1435` | `FROM` in a package unlinks `/etc/dolly/installed`: the record starts fresh | | | reset |
| `:1648` | `ENTRY` refused | allowed | allowed | refused |
| `:1810-1812` | "APPLICATION is missing ENTRY" | required | optional | n/a |
| `:1023` | the receipt writes each chain recipe's kind | | | |
| `:1093-1095` | a receipt whose kind is not one of the three fails `-EBADMSG` | | | |
| `:1099` | the last record's kind is the imported image's role, for `:1373` | | | |
| `:1109-1114` | a package's hosts must be declared by the installer: keyed on `install` (the mode), not on the role | | | |
| `:1552` | `ENTRY` must be last | all | all | all |
| `:1899`, `:1932` | `recipes.lock` holds locator and digest; `/etc/dolly/image` holds the name: no role | | | |

So the role lives in the recipe text (`/etc/dolly/Dollyfile`, `/etc/dolly/recipes/*`) and in the receipt, nowhere else in the image.

### 2.2 The page's parser and graph

- `src/dollyfile-view.mjs:143` the three words; `:190-201` the role line; `:290` `ENTRY` only in an application or toolchain; `:301` "APPLICATION is missing ENTRY"; `:306` `role` in the result, and `kind: "image"` constant.
- `src/dollyfile-graph.mjs:36` the error text names the role; `:56-59` the same target check as `:1373`; `:84` "A package keeps nothing of its base nor of what it installs": a package publishes no imported export.
- `src/browser.mjs:115` `runnable = recipe.entry !== null`; `:128-138` an image without `ENTRY` builds and reports. No role read. `src/custom-dollyfile.mjs:13` the template is `APPLICATION custom`; `:42` `kind !== "image"` ("Upload an IMAGE recipe, not a MODULE") cannot fail since Phase 3, because `kind` is always `"image"` (`dollyfile-view.mjs:306`).
- `src/runtime-worker.mjs:59` starts `/etc/dolly/entry`; no role.

### 2.3 Scripts, catalog, start page, sites

| Place | What the role selects | APPLICATION | TOOLCHAIN | PACKAGE |
| --- | --- | --- | --- | --- |
| `scripts/image-definitions.mjs:129-130` | `role` and `entry` into `dist/dolly-images.mjs` | | | |
| `scripts/generate-routes.mjs:37-39` | `openable = entry && display@0`: no role | route if both | route if both | never (no `ENTRY`) |
| `scripts/generate-routes.mjs:46-48` | the three groups; `menuBody` sorts groups by heading, images by name (`image-menu.mjs:40-45`) | "Applications" | "Toolchains" | "Packages" |
| `scripts/generate-routes.mjs:57-61` | `amy-index.txt` | | | listed |
| `scripts/image-menu.mjs:30-34` | link when openable; otherwise the tooltip | "only builds" | "only builds" | "A package: amy install NAME adds it to a running image" |
| `menu.html:55`, `README.md:16-17` | the sentence a visitor reads: "An application opens in this page. A package is added to a running image ... A toolchain is an image that recipes build on." | | | |
| `scripts/package-github-pages.mjs:10-14, 39` | GitHub Pages' "Hosted on DOMAIN" group: domain-only images with `role === "application"` | linked | not linked | not linked |
| `scripts/site-release.mjs:144-145` | release acceptance builds `FROM` every non-package ("packages are checked by the images that INSTALL them") | built on | built on | skipped |
| `scripts/accept-release.mjs:36-38` | the generated acceptance recipe is `TOOLCHAIN inventory` ("A build-only toolchain over the image") | | | |
| `host/packages/service.mjs:32` | `packages@0` serves a snapshot only if `role === "package"` | refused | refused | served |
| `src/commands/amy.c:25, 151` | reads `amy-index.txt`; any other name: "this site publishes no such package" | | | |
| `host/nena/*` | no role read (grep) | | | |
| `scripts/lint-dollyfiles.mjs:67-68` | "an APPLICATION needs display@0 to be opened" | required | not required | not required |
| `scripts/lint-dollyfiles.mjs:20` | the `ENTRY`-program search follows `FROM` only when the recipe is not a package | | | |
| `demos/studio/skills/dollyfiles/SKILL.md:30-32`; `65989432` | what Studio's agent and syntax file know: "`APPLICATION name` (opened by people; needs `ENTRY`), `TOOLCHAIN name` (a base to build on) or `PACKAGE name`" | | | |

### 2.4 Tests

- `test/fixtures/dollyfile-syntax.mjs:41-47`, run through the C parser and the JS one by `test/dollyfile-parser.test.mjs:36-49`: `APPLICATION` without `ENTRY` refused, `TOOLCHAIN` without `ENTRY` accepted, `PACKAGE` with `ENTRY` refused, two role lines refused.
- `test/dollyfile-graph.test.mjs:201-239` "roles decide what FROM, INSTALL and COPY import": a package keeps nothing of its base; `FROM` a package and `INSTALL` a toolchain rejected; `COPY` from a package brings no export or host.
- `test/dollyfile-graph.test.mjs:157-160`: a non-package without `display@0` must export no `DISPLAY` and carry no `ghostty-build` in its chain.
- `test/dolly.artifacts.mjs:273-279`: a package's manifest holds nothing of its base or installed packages; `:343-350`: a boot route exists iff `entry` and `display@0`; the index lists exactly the packages. `test/amy-browser.mjs:11`, `test/site-browser.mjs:82`: the same.
- No test names the lint's display rule (grep "display@0 to be opened" over `test/`: none).

## 3. Counted from the recipes

130 recipes (20 `APPLICATION`, 33 `TOOLCHAIN`, 77 `PACKAGE`), found by `scripts/recipe-files.mjs`'s rule; the reflection's 133 (20/34/79) differ by `javascript`, `typescript-build`, `qwen3.5-4b` and its four shards gone, `quickjs`, `janis`, `typescript`, `ps` added.

**Toolchains (33).** 31 have `ENTRY` and `display@0`; all 31 `ENTRY` lines are `ENTRY /bin/foreground -i /bin/slop`. 2 have neither: `system-build`, `zig-build`, the two v6 stripped. Of the 119 `FROM` rows in the catalog, 117 name a toolchain (18 distinct: `system-tools` 23, `tools-build` 22, `system` 21, `cmake-build` 11, `system-build` 10, `rust-build` 5, `zero-ad-deps` 5, `gamedev-sdk` 4, `pi-runtime` 4, `openal-build` 2, `speech-build` 2, `zig-build` 2, and one each for `llama-build`, `llvm-build`, `llvm-tablegen`, `local-llm-build`, `mojo-llvm`, `rust-sdk`). 18 toolchains are `COPY` sources. 14 are `FROM`-only sources, 14 `COPY`-only, 4 both (`llama-build`, `local-llm-build`, `rust-build`, `zero-ad-deps`), 1 neither: `rust-tools`. No `INSTALL` row names a toolchain (the engine refuses it, `:1373`).

Routes: every image has `/NAME/rebuild/`; the 31 toolchains with `ENTRY` have `/NAME/` in the checkout (`zero-ad-deps/index.html`, `llvm-cc/index.html`, `tools-build/index.html` exist; `system-build/` holds `rebuild` only). Published: the domain list (`config/domain-pages-images.txt`, 78 names) holds 20 applications, 55 packages and 3 toolchains (`openal-build`, `rust-tools`, `llvm-cc`); the GitHub list (13) holds 5 applications, 8 packages, no toolchain. The start page lists every selected image in its group; the link is on the openable ones.

READMEs call eight toolchains "build-only" or "Build-only": `llvm-build`, `llvm-tablegen`, `mojo-build`, `mojo-llvm`, `tools-build`, `zero-ad-deps`, `zero-ad-engine`, `zero-ad-spidermonkey` (`demos/*/README.md`). All eight have `ENTRY` and `display@0`, so a boot route. `zero-ad-deps` and `zero-ad-engine` were born as `IMAGE` with `ENTRY` and no `display@0` under DOLLY 5, when `ENTRY` was required (`776ae6f5`, 2026-10-01); the other six were born as `TOOLCHAIN` with both (`3848df01`, `9fa4b4d3`, `319c3a34`, `4b313b9c`).

**Applications (20).** All have `ENTRY` and `display@0`. 19 enter a start script (15 `/etc/dolly/init.slop`, 4 named), `mojo-gpu` enters the bare shell. Two are `FROM` bases: `pi-agent` (by `pi-local`) and `pi-local` (by `dollyfile-studio`). None is a `COPY` source. `default` and `zero-ad` have no `FROM` (root compositions of `INSTALL` rows).

**Packages (77).** None has `ENTRY`. Three declare `display@0` (`display`, `sdl2`, `raylib`: the module their programs need). 69 have a `FROM`, 8 none. None is a `FROM` target. One is a `COPY` source: `sdl2` (`zero-ad-deps` 3 rows, `xonotic` 1).

**Declared one role, used as another.**

- `rust-tools` (`TOOLCHAIN`): `FROM system`, `INSTALL rust`, `INSTALL cargo`, `ENTRY`; nothing builds on it or copies from it; it is on the domain list; its README says "interactive shell: `system` with the `rust` and `cargo` packages". By the doc's definition ("a `TOOLCHAIN` that other recipes build on", `docs/dollyfile.md:5-7`) it is used as an application. The v6 design named it among the toolchains that "stay inspectable" (`:121`); it was then "`system` plus `INSTALL rust`" (`8bfcd884`).
- `pi-agent`, `pi-local` (`APPLICATION`): bases, as the design foresaw (`:122-123`).
- `sdl2` (`PACKAGE`): a `COPY` source, allowed by "any role" (`:63`); `61f4edb5` kept the `COPY` form when the package came (the copy investigation, 1.6).
- The eight "build-only" toolchains above: the README says "not meant to be opened"; the recipe says it opens.
- `llvm-runtimes` (`PACKAGE`, `FROM system-tools`): `test/amy-browser.mjs:434` exempts it as "a build stage"; the packages task says a build stage is "Not a package" (`:39-40`); the audit proposed `TOOLCHAIN` (`packages.md:47`); the README now describes it as runtime libraries a link takes with `-L` (`demos/llvm/README.md:24`).

**The reflection's numbers against the trees.**

| Claim | At `d89bca74` | Here | Note |
| --- | --- | --- | --- |
| 79 packages, 34 toolchains, 20 applications | 79/34/20 | 77/33/20 | |
| "32 of 34 toolchains have `ENTRY` and open" | 32 have `ENTRY` and `display@0`; 2 (`system-build`, `zig-build`) have neither | 31 of 33 | "open" means a boot route in the checkout; on the published domain 3 of them are listed, on GitHub Pages none |
| "both are `FROM`-able (`zero-ad FROM default`, `pi-local FROM pi-agent`)" | `pi-local FROM pi-agent` true; `zero-ad` had no `FROM`: `eb737786` (2026-10-13, an ancestor of `d89bca74`) replaced `FROM /v0.1.3/Dollyfile` with `INSTALL` rows | same | the example was stale on the day it was written; the fact holds (`:1373` and the design) |
| `src/dollyfile.c:1810`, `:1401`; `lint-dollyfiles.mjs:68` | the same lines | the same lines | the audit of 10-12 cited `1720`, `1317`, `67` for its tree |
| "90 `FROM` targets are toolchains, 3 applications" (the audit) | not recounted | 117 and 2 | |

## 4. The reflection's claims, checked

**"The engine distinguishes `APPLICATION` from `TOOLCHAIN` by one check, 'missing ENTRY' (`:1810`)."** True of the engine: `strcmp(kind, "APPLICATION")` occurs once (`:1810`); every other role test is `== "PACKAGE"` (`:1373`, `:1551`). Not true of the whole tree: the two words also differ at the lint (`:67-68`), the start page's grouping (`generate-routes.mjs:46-48`), GitHub Pages' "Hosted on" group (`package-github-pages.mjs:14`), the catalog naming convention (`docs/dollyfile.md:69-76`), and the visitor-facing sentence (`menu.html:55`). The graph, the browser, `packages@0`, acceptance and `amy` do not tell them apart.

**"32 of 34 toolchains have `ENTRY` and open."** True at `d89bca74` (3.1). What "open" counts is the route in the checkout; the design intended it ("stay inspectable", `:120-121`). Eight of them are described as build-only by their READMEs.

**"Both are `FROM`-able."** True; by design (`:122-123`); the `zero-ad` example was already false.

**"The real split is `:1401`, `keep = !(package_recipe && mode != IMPORT_COPY)`: a package keeps nothing of what it is built on."** Partly. `:1401` is the retention effect and the one `2283e960` last changed. The package role has three more effects in the engine (`:1373` what may import it and what it may import; `:1435` the record; `:1648` no `ENTRY`), the graph mirrors the first (`:56-59`, `:84`), and the lint's `ENTRY` search follows `FROM` only outside a package (`:20`). The hosts rule for packages ("declares only what its own programs need", `INSTALL` checks the installer) is keyed on the `INSTALL` row (`:1109-1114`), not on the recipe's role.

**"The lint's 'an APPLICATION needs display@0' (`:68`) names a module where 'has an ENTRY' says it."** Partly. In this tree "opens" is `ENTRY` and `display@0` together, in the route generator (`:38-39`), the menu (`image-menu.mjs:30`), the artifact test (`dolly.artifacts.mjs:343-344`) and the doc ("only an image with ENTRY and `display@0` can be opened", `docs/dollyfile.md:247-248`). An application with `ENTRY` and no `display@0` builds green (the engine does not know `display@0`), gets no `/NAME/` page (`54dd8eb7` removes it) and shows "This image only builds": the lint rule is what makes the table row "`APPLICATION`: opened by people, at `/name/`" (`:59`) hold. Before v6 `display@0` alone was the openability test (1.1); `ENTRY` alone has never said "opens" in this tree. Also true: no catalog recipe of any role has `ENTRY` without `display@0` today, so the rule distinguishes nothing in the present catalog.

**"'opens' is a property (ENTRY + display), which `generate-routes.mjs:37` already computes."** (the audit, repeated by the reflection) True (`:37-39`). The page already uses the property and not the role; the role's remaining page uses are the group, the index and the tooltip (2.3).

## 5. What a change would mean, on real cases

Observations only. "A different word" means the recipe's role line changed; "absent" means the two-role language of the audit (`IMAGE` and `PACKAGE`), in which every image is one kind. A language change is `DOLLY 8`: every pin changes and every image rebuilds, which the v6 reasoning took as given ("every image rebuilds anyway because every pin changes", `:83`) and the owner calls intentional (memory, 2026-10-13).

### A. A toolchain people open and nothing builds on: `rust-tools`

`demos/rust/Dollyfile-rust-tools` (18 lines): `TOOLCHAIN`, ten `REQUIRES HOST`, `FROM system`, `INSTALL rust`, `INSTALL cargo`, `ENTRY /bin/foreground -i /bin/slop`.

- Reader: the README says "interactive shell"; the menu puts it under "Toolchains" and the menu's sentence says "an image that recipes build on"; no recipe does.
- Engine: nothing differs from an application except that a missing `ENTRY` would pass.
- Page: `/rust-tools/` exists and is on the domain list; GitHub Pages does not link it (not an application, `package-github-pages.mjs:14`).
- Lint: `display@0` not required (it declares it).
- As `APPLICATION`: the group moves; GitHub Pages' "Hosted on" group would list it; a forgotten `ENTRY` fails the build; the doc's convention would want a start script and a product name (`:69-76`). Nothing else changes.
- Absent: no group; the audit's reading was "delete, it is `amy install cargo`" (`packages.md:39`).

### B. Toolchains nobody is meant to open: `zero-ad-deps` and `system-build`

`demos/zero-ad/Dollyfile-zero-ad-deps` (197 lines): `TOOLCHAIN`, hosts `audio`, `display`, `input`, `download`, `http`, `upload`; `FROM openal-build`; three `COPY` from `sdl2`; `ENTRY` on the last line. README: "Build-only". 5 `FROM` dependents, 3 `COPY` consumers.

- Reader: the only text that says "not meant to be opened" is the README description; the role says "recipes build on", which is true; the recipe's `ENTRY` says it opens.
- Engine: role makes no difference to its build; the `ENTRY` line is sealed and checked (`adce6385`).
- Page: `/zero-ad-deps/index.html` is generated; it is on no published list, so visitors do not see it.
- If the `ENTRY` were removed, with the role unchanged: no page, tooltip "This image only builds". The role already permits that (`:1648` is for packages only; `:1810` for applications only). The v6 design made `system-build` and `zig-build` exactly this (`:101`).
- As `PACKAGE`: refused as a `FROM` base for its five dependents (`:1373`); its `COPY` consumers would still work (`:63`).
- Absent: the same as today for the engine; the start page would have no "Toolchains" group to put it in, and the README's "Build-only" would be the only statement of its purpose, as it already is.

`Dollyfile-system-build` (476 lines): `TOOLCHAIN`, `runtime@0` and `http@0`, no `FROM`, no `ENTRY`; 10 `FROM` dependents. Here the role and the missing `ENTRY` say the same thing by different means: "build on" and "only builds". The menu's tooltip and the doc ("Images without ENTRY only build", `:371`) say it from the `ENTRY`, not from the role.

### C. Applications that are bases: `pi-agent` and `pi-local`; the base that opens: `system`

`demos/pi/Dollyfile-pi-agent` (`APPLICATION`, `FROM pi-runtime`, `INSTALL dolly-docs`, start script); `demos/local-llm/Dollyfile-pi-local` (`APPLICATION`, `FROM pi-agent`, two `COPY`, `INSTALL qwen3.5-2b`); `demos/studio/Dollyfile-dollyfile-studio` (`FROM pi-local`).

- Reader: the doc's table says an application is imported by `FROM` (`:59`); the design named this chain.
- Engine: `:1373` allows it; `FROM` keeps everything, the start script of the base included (then overwritten by the child's own `FILE`).
- As `TOOLCHAIN`: `ENTRY` optional, `display@0` not lint-required, group changes, `pi-agent` leaves GitHub Pages' "Hosted on" group (it is domain-only). Nothing else.
- Absent: nothing changes for the engine or the page beyond the group.

`Dollyfile-system` (27 lines): `TOOLCHAIN`, `FROM system-tools`, compiles `session-recover`, `ENTRY`. 21 recipes build on it; it opens; it is on neither published list. The role word matches the doc's definition and the `ENTRY` gives the route; the role is not what makes it a base (any non-package is), nor what makes it open.

### D. An application without a display

None exists in the catalog, in any role, and in no role does a recipe have `ENTRY` without `display@0`. What the tree would do with one: the engine seals it (it knows `ENTRY`, not modules); the lint refuses it if it is an `APPLICATION` (`:67-68`) and accepts it as a `TOOLCHAIN`; the route generator gives it no page (`:38-42`); the menu says "This image only builds". So today the role is the only thing that turns that state into an error rather than a silently build-only image.

### E. Packages: `core` (a view) and `sdl2` (holds its build)

`Dollyfile-core` (49 lines): `PACKAGE`, `runtime@0`, `FROM system-build`, 19 `EXPORTS TOOL`, `EXPORTS ENV SHELL`, 19 `FILE` man pages. `demos/sdl2/Dollyfile-sdl2`: `PACKAGE`, `display@0` and `input@0`, `FROM cmake-build`, its build, `EXPORTS`.

- Engine: keeps nothing of `system-build` (`:1401`; `test/dolly.artifacts.mjs:273-279` proves it on the manifest); record reset (`:1435`); no `ENTRY` (`:1648`); `INSTALL`-able and not `FROM`-able (`:1373`); its hosts are checked against every installer (`:1109-1114`).
- Page and site: in the "Packages" group with the tooltip "amy install core"; in `amy-index.txt`; served by `packages@0` by pin (`service.mjs:32`); skipped by acceptance (`site-release.mjs:145`); `sdl2` is also a `COPY` source for two images.
- As `TOOLCHAIN`: `FROM system-build` would keep the whole base (135.5 MB by `d4ab4f63`'s measurement); `INSTALL` impossible; `amy` could not name it; the lean base of `d4ab4f63` and the composed `default` of `9d9064b3` rest on this role's `:1401`.
- Absent (no `PACKAGE`): the pre-v6 state, where "Consumers repeated `COPY` rows and re-declared `EXPORTS` for SDL2 ... row for row" (`:63-66`). The reflection does not propose this; its two-role language keeps `PACKAGE`.

### F. Where the role is the only place a fact is stated

- "This image may be installed into a session, and this one may not": the role, through `:1373`, the index (`generate-routes.mjs:57-61`) and the service gate (`service.mjs:32`). No name, property or file says it otherwise.
- "A `FROM` of this recipe keeps nothing of the base": the role, `:1401`. No other row can say it.
- "A missing `ENTRY` is an error here": the role, `:1810`; for a toolchain the omission silently produces a build-only image.
- "A missing `display@0` is an error here": the role, lint `:67-68`.
- The start page's grouping: the role is its only sort key (`:46-48`); before v6 the name regex was.
- GitHub Pages' link to a domain-hosted image: the role (`package-github-pages.mjs:14`).
- "This image is not meant to be opened": not the role. For `system-build` and `zig-build` the missing `ENTRY` says it; for the eight build-only toolchains only the README says it.
- "This image is a base": not the role in practice; any non-package with the engine in it is (`d4ab4f63`), and two applications are.

## 6. What could not be found out

- Why the eight "build-only" toolchains keep an `ENTRY`: no task, commit message or recipe comment says. `zero-ad-deps` and `zero-ad-engine` inherited theirs from DOLLY 5, where `ENTRY` was required; the six born under v6 or 7 were written with one. The design's "stay inspectable" names only `system`, `rust-tools` and `typescript-build`.
- Whether a two-role language was weighed in the v6 design: the task records `IMAGE` becoming three (then four) words and no alternative; the first record of `IMAGE`/`PACKAGE` is the audit of 2026-10-12.
- Whether the lint's display rule has ever caught a catalog recipe: no test names it and no task records a failure; the memory note of 2026-10-07 ("lint without a build caught recipe errors agents shipped twice", cited by the audit's point 15) does not say which rule.
- What the owner thinks of `rust-tools`' role, of the eight toolchains' `ENTRY`, and of `llvm-runtimes`' role: not recorded; the audit's proposals on each (`packages.md:39, 47`) have no owner reply.
- Whether `FROM` an openable image without the engine (`default` before `amy` carried `/bin/dollyfile`) ever failed in a build: `d4ab4f63` states the rule; no failure is recorded.
- Build or boot measurements by role: none exist beyond the 2026-10-05 sizes in `tasks/20261005-131645-more-packages/TASK.md:51-103`; nothing was built here.