# Dollyfile v6: a consistent language from first principles

- STATUS: OPEN
- PRIORITY: 350
- TAGS: dollyfile,design,core

Owner direction (2026-10-01): getting the core architecture and Dollyfile
abstractions right is the project's first goal; everything else demonstrates
them. The owner likes how DOLLY 5 works but finds it slightly inconsistent and
wants a cleaner v6, rethought from first principles, with no workarounds.

Inputs: `docs/dollyfile.md`, `src/dollyfile.c`, the graph/pin/lint tools,
`20260930-223000-dollyfile-design` (design as executed and its gaps), the
`COMPILEC` bootstrap work (`20261001-123500-bootstrap-boundary`), and image
roles: the owner finds it odd that `javascript`, `python` and `ripgrep` are
listed as applications; they read as build images.

## Done when

- A v6 specification with the reasoning for each construct, implemented in the
  engine and tools, every recipe migrated, docs rewritten, and the catalog
  rebuilt with all suites passing.

## Owner additions (2026-10-01, evening)

- Packages: `amy install qwen3-8b` pulls a model from its image into the
  running session; amy is a thin front end over the engine; image roles cover
  application, build toolchain and package; a package's exports import the
  same way for recipes and amy (`20261001-001000-packages`).
- An organized catalog: explicit roles, a consistent naming scheme for build
  and package images, grouping on the start page and in the index amy reads,
  and no name-suffix guessing in `scripts/generate-routes.mjs`.

## Design (Phase 1, 2026-10-01)

The specification is [`docs/dollyfile.md`](../../docs/dollyfile.md); this
section records the reasoning. Counts are from the 111 recipes on `main`.

### Starting point

A recipe brings pinned bytes in (an image, a module, a download), writes inline
bytes, runs programs, and declares the result: retained content, named objects,
host needs, and the program that runs when the image is opened. DOLLY 5 had all
of that. It did not say what an image is *for*, so the start page guessed roles
from name suffixes, the registry from `display@0`, and a lean image meant for
installing had no import that carried its exports. v6 makes the role explicit
and gives each role one import verb; the rest follows.

### Inconsistencies in DOLLY 5

1. `COPY FROM` was the only two-word directive and reused `FROM` for a
   different operation; both parsers special-cased it.
2. Image names allowed 32 bytes and module names 64, and neither allowed a
   dot, so `qwen3.5-4b` could not be an image.
3. An image's role was implicit: the menu's "Build images" came from a name
   regex (`-(build|sdk|runtime|tools)$` or `system`), the boot route from
   `display@0`. `javascript`, `python` and `ripgrep` were listed as
   applications; `ripgrep` was named like an application and built like
   `fd-build`.
4. Every image needed an `ENTRY`, including headless builders (`system-build`,
   `zig-build`: `ENTRY /bin/slop`, never run) and 27 images whose ENTRY was
   the same shell line.
5. `FROM` imported files, environment, exports and host requirements; `COPY`
   imported files only; nothing imported a lean image's objects. Consumers
   repeated `COPY` rows and re-declared `EXPORTS` for SDL2 (classicube, bhop,
   rts-arena) and dolly-js (bhop, slopyard), row for row.
6. Module exports were not transitive: `default.dm` spent 30 of 36 lines
   re-exporting its children, `python.dm` 12 of 15, and a forgotten re-export
   silently dropped the file from the image.
7. `EXPORTS TOOL name SHA256` (never used), `EXPORTS ENV NAME` bare (used once,
   only to re-export) and `REQUIRES FILE`/`REQUIRES ENV` (never used) were
   shapes without a recipe.
8. Retained recipes were renamed on the way in: `/etc/dolly/recipes/NAME.Dollyfile`
   and `/etc/dolly/recipes/modules/NAME.dm`, while the published files are
   `Dollyfile-NAME` and `NAME.dm` and demo modules do not live in `modules/`.
9. An image URL only had to look like `Dollyfile-NAME`; modules had to match
   their file name, images did not.

### Every DOLLY 5 construct

| Construct | v6 | Reason |
| --- | --- | --- |
| `DOLLY 5` | `DOLLY 6` | Role keywords, `INSTALL`, `COPY` and the retained paths change meaning; every image rebuilds anyway because every pin changes. |
| `IMAGE name` | `APPLICATION`, `TOOLCHAIN` or `PACKAGE name` | The role is the one fact the tools had to guess (3). The kind word is the role, so nothing else is needed to state it. |
| `MODULE name` | keep | A reusable fragment run inline; caching it was rejected in v3 for good reasons. |
| names | `[a-z][a-z0-9]*(-[a-z0-9]+|\.[0-9]+)*`, 32 bytes, both kinds | One grammar (2); a dot starts version digits (`qwen3.5-4b`, `llama3.2-3b`, `python3.14`), which keeps the documentation copies `Dollyfile-NAME.txt` that releases publish for unselected recipes out of recipe discovery. Image URLs must name their file, as module URLs already did (9). |
| `FROM URL SHA` | keep; a package keeps nothing of its base | The base of an application or toolchain is extended; the base of a package is only where it is built, so the package stays lean without `COPY` rows. `FROM` takes an application or toolchain, never a package. |
| `COPY FROM URL SHA SRC DST` | `COPY URL SHA SRC DST` | One word per directive (1). Still files only: multi-stage builds pick exact outputs. |
| new: `INSTALL URL SHA` | import a package | The missing verb (5): files, exports (ENV as values) and host requirements, anywhere, in modules too. It is also the row `amy install` executes. |
| `USE URL SHA` | keep; exports become transitive | Removes the re-export ceremony and the silent-loss footgun (6). An aggregate still overrides by exporting the same type and name. |
| `SOURCE URL SHA DST` | keep | |
| `SLOP [CWD dir] cmd…` | keep | |
| `COMPILEC src out` | keep | Decided in `20261001-123500-bootstrap-boundary`; five uses, all before Slop exists. |
| `FILE /path [body]` | keep | "The image has this file, with this content when a body is given." The `/tmp` scratch rule stays: 49 inline Makefiles and checks. |
| `FOLDER /path` | keep | |
| `EXPORTS TOOL name [SHA]` | drop the digest | Never used (7). |
| `EXPORTS LIB/HEADER/FILE/FOLDER name /path` | keep | The types are namespaces: `LIB curl` and `HEADER curl` coexist in 20 modules, so collapsing them would force renames. |
| `EXPORTS ENV NAME [APPEND] VALUE` | keep; drop the bare form | The bare form only re-exported, which transitivity makes unnecessary (7). |
| `REQUIRES TYPE name` | keep, same vocabulary | A typed, inspectable contract; the view links it to its provider. |
| `REQUIRES HOST name@abi` | keep; propagates through `INSTALL`, not from a package's base | |
| `ENTRY …` | required for applications, optional for toolchains, none for packages | Explicit openability (4): a toolchain with ENTRY can be opened; one without only builds. `system-build` and `zig-build` lose their dead ENTRY. |
| retained recipes | `/etc/dolly/recipes/Dollyfile-NAME`, `/etc/dolly/recipes/NAME.dm` | The published file name, nothing invented (8). |
| artifact receipt | version 4 | Records the role, so `FROM` and `INSTALL` can check their target; no TOOL digest field. |

Unchanged on purpose: full URLs with inline pins, cascading identity (recipe
text plus pins), the canonical origin and its mirror mapping, explicit
retention, the `/tmp` and `/workspace` rule, the `SLOP` quoting rules, the
host-requirement grammar, and images rather than modules as the cache unit.

### Roles

| Role | Imported by | ENTRY | Keeps |
| --- | --- | --- | --- |
| `APPLICATION` | `FROM` | required | base and declarations |
| `TOOLCHAIN` | `FROM`, `COPY` | optional | base and declarations |
| `PACKAGE` | `INSTALL`, `COPY` | none | declarations only; no base files, exports or host requirements |
| `MODULE` | `USE` | none | runs inside its caller |

`TOOLCHAIN` names every image other recipes build on: SDKs, runtimes and
build stages alike. Openability is `ENTRY` plus `display@0`, not the role, so
`system`, `rust-tools` and `typescript-build` stay inspectable while
`system-build` only builds. `FROM` may name an application: `pi-local`
extends `pi` and `dollyfile-studio` extends `pi-local`.

### Catalog scheme

- Applications and packages take the product's name; a package's name is what
  one installs (`amy install ripgrep`). Toolchains are `family-variant`;
  versions belong to the family (`qwen3.5-4b`). Lint checks the grammar and
  the file names; the convention is documented, not parsed.
- Start page: Applications (`default` first), Toolchains grouped by directory
  (core, then each demo), Packages. `isBuild` and its regex go.
- Package index: `dist/dolly-packages.txt`, `NAME URL SHA256` per line,
  generated with the registry.
- Changes to the catalog: `javascript`, `python` and `ripgrep` become
  packages (built in `typescript-build`, `system` with `python.dm` and
  `pip.dm`, and `rust-build`); `fd-build` and `protox-build` become the
  packages `fd` and `protox`; `python-runtime` and `startup-python.dm` go
  (`python` is the package; `llvm-tablegen` installs it). Consumers replace
  their `COPY` blocks: `pi-runtime` installs `javascript`, `search-tools.dm`
  installs `ripgrep` and `fd`, `codex-build` installs `protox`, `bhop` and
  `slopyard` install `javascript`. `sdl2-build`, `pi-build`, `neovim-build`
  stay toolchains: `pi` needs `PI_PACKAGE_DIR` and `neovim` would collide with
  the `neovim` application; both are demo decisions for later.

### Packages and amy

The specification describes only what this branch implements (`PACKAGE`,
`INSTALL`, the index); the amy semantics below stay here until amy lands.

- An amy install is the Dollyfile row `INSTALL URL SHA256`, executed against
  the live filesystem by `/bin/dollyfile`; the index maps a name to that row;
  `/etc/dolly/installed` records executed rows; `amy freeze NAME` writes
  `FROM <booted image> <pin>` plus those rows plus the image's ENTRY. The
  semantics of `INSTALL` are identical in a recipe and in a session, so the
  frozen recipe reproduces the session.
- Environment: `INSTALL` sets the package's exported variables to their
  recorded values. Packages install into standard paths; `PATH` composition is
  not an install feature (`rust-sdk` therefore stays a toolchain).
- What amy needs from the engine and runtime, in order:
  1. An engine mode that executes a `MODULE` recipe against the live
     filesystem without sealing, merging exported ENV into
     `/etc/dolly/environment` (`dollyfile apply FILE:/path`).
  2. Artifact placement: the page materializes a published package snapshot
     exactly as it does for builds, checks the package's host requirements
     against the enabled modules, and writes `/etc/dolly/artifacts/SHA.snapshot`
     into the session; exposed to the sandbox through a broker-local service
     under a host module (`build@0` or its own), never through the recipe.
  3. The runtime loads `/etc/dolly/environment` after session replay, so
     installed ENV survives a reload (gap 3 of the packages task).
  4. The index `dist/dolly-packages.txt` granted to running images that
     declare the host module.
  None of these changes the language; (1) is engine work in this area, (2)-(4)
  are browser-boundary work.

### Migration

Mechanical: `DOLLY 5` to `DOLLY 6`; `IMAGE` to the role word; `COPY FROM` to
`COPY`; drop re-exports that transitivity covers; drop dead ENTRY lines;
replace copied package blocks with `INSTALL`; `node scripts/update-module-pins.mjs`.
Recipes on parallel branches (`work/pi-local-model`) migrate the same way at
merge time.

## Phase 3 design (owner green light, 2026-10-01 23:00)

Owner: "I like the Package thing but I don't want to lose the sha stuff for
absolute reproducibility"; `COMPILEC`/`SLOP`/`REQUIRES TOOL slop` is
inconsistent; host requirements are unclear. DOLLY 6 is unreleased, so the
version stays 6.

- **Packages are the only unit of reuse; `MODULE`, `USE` and `.dm` files go.**
  61 of 68 modules had one user, so they were recipe fragments, not reuse; the
  7 shared ones (`curl`, `zlib`, `gzip`, `display`, `pi`, `neovim-runtime`,
  `search-tools`) are tools and libraries someone would install. A package is
  pinned, cached, sealed and installed by recipes and amy with the same row,
  so reuse and reproducibility stop being two mechanisms. Every import keeps
  its inline SHA-256 and identity still cascades: a package's pin covers its
  base and sources, an image's pin covers its packages. Single-use modules
  fold into their recipe; the engine loses nesting, scopes and the module
  receipt records. Application and package names collide for Pi and Neovim,
  so those packages take another name the project uses: `pi-coding-agent`
  (the npm package) and `nvim` (the command).
- **`RUN` replaces `COMPILEC`; `SLOP` is its shell form.** `RUN [CWD /dir]
  /program [word…]` executes a retained program with argv words, no shell,
  no expansion, stdin `/dev/null`: one way to run programs, with `SLOP` defined
  as `RUN /bin/slop -e -c command`. The seed compiler is a program, so the
  five bootstrap compiles are `RUN /usr/libexec/dolly/process-bin/compiler
  --dolly-toolchain-mode=c …`; the driver selects its mode by that flag only,
  and an argv[0] mode would be a compiler-driver change (core-polish).
- **`REQUIRES` and typed `EXPORTS` stay; `REQUIRES TOOL slop` goes.** (Owner
  correction: the assertions are the explicit contract.) `SLOP` is `RUN
  /bin/slop -e -c`, so a SLOP step depends on `/bin/slop` by definition: the
  engine rejects `REQUIRES TOOL slop` and a SLOP step before the recipe has
  `/bin/slop` fails naming the line. Folded modules keep their `REQUIRES`
  blocks; within one recipe an identical assertion repeated by several folded
  blocks is kept once.
- **Host requirements are explicit and never inherited.** (Owner correction.)
  The image's own recipe is the complete list, written after the role line as
  its manifest; `FROM`, `INSTALL` and `COPY` carry none and nothing is
  derived. A package declares the modules its programs need, and `INSTALL`
  checks that the installing recipe declares them too. Sealing scans every
  retained executable's `dolly.host` records and fails naming the file and
  the missing line, so an image cannot retain a program it could not run. The
  derivation was checked and rejected as a replacement: only audio, display,
  download, gpu, http, threads and upload have stamping clients; `snapshot@0`
  and `build@0` have none, and `gpu-sdk`, `audio-sdk` and `system` enable
  modules for programs compiled after boot, which nothing retained stamps.
  At run time enabled equals declared: the page creates the host from the
  image's list, boot fails when the embedding lacks a module, and the loader
  refuses an executable stamped with an undeclared module.

## Implementation (Phase 2, branch `work/dollyfile-v6`)

- Engine ([`src/dollyfile.c`](../../src/dollyfile.c)): role kinds, `INSTALL`,
  one-word `COPY`, `load_artifact` modes with the role check against the
  imported receipt (v4), transitive exports through `USE` and `INSTALL`,
  package `FROM` keeping nothing, optional ENTRY, the name grammar, retained
  recipes by file name. 1936 lines before, 1920 after.
- JavaScript ([`dollyfile-view.mjs`](../../src/dollyfile-view.mjs),
  [`dollyfile-graph.mjs`](../../src/dollyfile-graph.mjs)): the same grammar
  and rules; `role`, `kind`, `entry` and `artifacts[].operation` replace the
  `copy` flag and the TOOL digest. The registry carries `role` and `entry`;
  `generate-routes.mjs` groups the menu by role (toolchains by directory) and
  writes `dist/dolly-packages.txt`; the browser builds only when an image has
  no ENTRY or display; lint requires `display@0` for applications.
- Catalog: 41 images (`python-runtime` merged into the `python` package,
  `startup-python.dm` gone); five packages: `javascript`, `python`, `ripgrep`,
  `fd`, `protox`. `pi-runtime`, `bhop`, `slopyard` install `javascript`;
  `search-tools.dm` installs `ripgrep` and `fd`; `codex-build` installs
  `protox`; `llvm-tablegen` installs `python`. `default.dm` lost 31 lines and
  `python.dm` 11 to transitive exports.
- Tests: the parity fixture covers roles, names, `INSTALL` and `COPY`; the
  graph test covers what each role imports and the role errors; the python
  and javascript demo tests open `FROM system` plus `INSTALL` through the
  custom route (`installProbe` in `demos/browser.mjs`), which is also how
  `amy` composes a session.
- Integrator review: a recipe's own exports win over imported ones wherever
  they appear (the deferred-capture case); the name grammar is one rule in
  both parsers with accept and reject vectors; `COPY` is role-agnostic in the
  spec; the engine's unretained list is scratch only (`/tmp`, `/workspace`):
  `pi.dm` names the five files it ships under `~/.pi/agent`, which is exactly
  what the built `pi`, `pi-local` and `dollyfile-studio` images held, and the
  session snapshot never read that list.
