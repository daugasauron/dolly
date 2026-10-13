# Audit: the Dollyfile language and the builder (main, 2026-10-13)

Scope note: `src/dollyfile.c` is compiled by `bootstrap.c` from the seed, so every engine change below is a seed change and costs one catalog round (5 h 36 min for v0.1.2). I mark those "round"; "cheap" means scripts, lint, docs or recipe text only. In-flight work I checked against: `core/packages` (INSTALL by reference), `core/bridges` (`nena@0`), `demo/tmux` (`pty@0`), `core/names`.

## The five things I would do first

1. Make `INSTALL` inside a `PACKAGE` record the row and retain nothing; `amy` reads the snapshot's `/etc/dolly/installed` and installs those rows first (in flight; no syntax).
2. Take the release version out of references and let `amy` learn its version at run time, so a version bump rewrites 0 recipes instead of 83 and rebuilds nothing.
3. Delete `REQUIRES TOOL` (445 rows, 13% of all directive rows) and the name operand of `EXPORTS FILE`/`EXPORTS FOLDER` (never looked up).
4. Give `SLOP` an indented body like `FILE`, and retain `/usr/share/man` and `/usr/share/licenses` by convention (~260 rows and most of the 931 continuation lines go).
5. Move the 18 inline core-tool C sources out of `Dollyfile-system-build` into `src/commands/` where `install.c`, `du.c`, `xargs.c` already live: −1,500 lines from the root recipe.

## The owner's question: dependencies with no new syntax

Yes, and `amy` does not even need to parse a Dollyfile. When a package recipe runs `INSTALL`, the engine records that row (and the installed package's own rows) in `/etc/dolly/installed` and retains the file (`src/dollyfile.c:1350-1363`, `record_installed` 1153-1171); a package snapshot therefore already carries the exact list of pins it depends on, machine-readable. `amy install` already fetches the snapshot and reads its record format (`amy.c:155-181`), so the smallest change is: in `load_artifact`, for `IMPORT_INSTALL` when `package_recipe`, restore the files for the build but do not `keep` them (one condition at line 1317); in `amy.c:install`, read the snapshot's `/etc/dolly/installed`, and for each row not in the session's record, look its name up in the index and install it first. Evidence: `Dollyfile-cargo` rows 10 and `Dollyfile-rust` row 11 chain `cargo → rust → cc`; the task file measures cargo at 500 MB of which 463 MB is the copied `rust`. `REQUIRES TOOL` cannot drive resolution: 66% of its rows name base tools (`tar`, `cc`, `rm`…) that come from `FROM`, not a package, and `python` requires `cc` without any row (the held fix adds an `INSTALL`, repinning 34 recipes). Ambiguities: skew (finding 9) and removal (no reverse index; do not add `remove` yet).

## Findings, ranked by value for effort

**1. Pins are written into consumers although the builder recomputes them.**
Evidence: 256 image references (`FROM` 93, `INSTALL` 62, `COPY` 101) each carry a 64-hex pin; `scripts/build-system-snapshot.mjs:182-188` computes the real identity (recipe hash + dependency snapshot digests) anyway; the engine writes the resolved chain into every image as `/etc/dolly/recipes.lock` (`dollyfile.c:1802-1814`). Repin commits touch 69, 69 and 81 recipes (`c91d8b9d`, `09c1dbb7`, `8e7c4d92`); the memory notes merge tooling (`work/merge-recipes.py`) that exists only to resolve pin conflicts. Mean transitive dependents per recipe: 11.5; `display` has 90, `python` 34.
Why: iteration speed is king; the rebuild cascade is real content (a `FROM` copies the base), but the text cascade is pure churn and blocks merges.
Do: keep `SOURCE` pins (external bytes, the only true input); drop the pin operand from `FROM`/`INSTALL`/`COPY` and let the page resolve a name to this release's pin from a generated lock (`amy-index.txt` already is that table for packages, `scripts/generate-routes.mjs:64-68`), handing the engine the artifact as it does now (`dollyfile.c:1300`).
```
FROM /v0.1.2/Dollyfile-system cb0036…b259     →   FROM system
INSTALL /v0.1.2/Dollyfile-cc fde553…9ae0      →   INSTALL cc
```
Cost: redesign (engine, `dollyfile-view.mjs`, broker, lint), one round. Confidence: medium; it trades "a recipe alone replicates the image" for "a recipe plus the release lock does", which `recipes.lock` already records.

**2. The version in every reference costs a full rebuild per release number.**
Evidence: `d802b73b` "Version 0.1.2: every reference names /v0.1.2/" touched 83 recipes; `docs/dollyfile.md:109-110` admits "a version change rewrites every recipe and rebuilds every image once"; `amy` bakes `DOLLY_VERSION` from a staged `version.h` (`prepare-image-sources.sh:111-113`), so `system-tools` and its 88 dependents rebuild on a bump even if finding 1 is done. The broker refuses other versions anyway (`docs/dollyfile.md:162-164`), so the per-row version is redundant.
Do: references relative to the running release (`/dist/static/...`, `Dollyfile-cc`); `amy` reads `/amy-index.txt` of its own release. Cost: round. Confidence: high.

**3. `REQUIRES TOOL` is documentation with a redundant check.**
Evidence: 445 rows in 58 recipes; 295 name nine base tools. The check resolves `PATH` at that line (`dollyfile.c:1496-1499`); the first `SLOP` using the tool fails one row later with the same information. 36 commits touched these rows; none in the log records one catching a mistake, whereas `REQUIRES HOST` additions do (`e91fc5af`, `ed24aa8d`) and `REQUIRES HEADER/LIB` once (`7debb6c8`). The engine even special-cases `REQUIRES TOOL slop` as an error (line 1488).
Do: remove the type; keep `REQUIRES HOST`, `LIB`, `HEADER` (they check a visible export, not the filesystem). Cost: round; recipe edits are mechanical. Confidence: high.

**4. Two directive pairs say the same thing.**
Evidence: `EXPORTS FILE name /path` (18 rows): `REQUIRES FILE` is used 0 times, so the name is dead and the row equals `FILE /path`. `EXPORTS FOLDER name /path` (74 rows): required twice (`process-sdk`, `typescript`). `FILE` itself has two meanings: 155 rows write a body, 137 only retain. 23 of 49 `EXPORTS LIB` names and 38 of 63 `EXPORTS HEADER` names are never required.
Do: `FILE`/`FOLDER` retain; `EXPORTS` keeps `TOOL`, `LIB`, `HEADER`, `ENV`. Newcomers read `EXPORTS FILE qwen3.5-4b-2 …` as an interface; it is retention.
```
EXPORTS FILE qwen3.5-4b-2 /usr/share/dolly/llm/qwen…gguf   →   FILE /usr/share/dolly/llm/qwen…gguf
```
Cost: round. Confidence: high.

**5. Embedded program source is half of all recipe text.**
Evidence: 5,085 of 10,237 lines are `FILE` bodies; ≈3,700 are C/C++/Lua source (`Dollyfile-system-build` 1,773, `bhop` 689, `mojo-runtime` 481, `gamedev-sdk` 311, `gpu-fluid` 306). `system-build` inlines 18 `/tmp/core-tools/*.c` while `install.c`, `du.c`, `xargs.c` are staged files (`prepare-image-sources.sh:107-109`): one project, two conventions.
Why: a recipe is a build description; source in it cannot be compiled, linted or diffed as source, and the 128 KiB limit (`dollyfile.c:23`) is why `bhop` is one file away from failing.
Do: `SOURCE` rows for staged files, as the demos already do for their tars. Cost: cheap (staging script + recipe), rebuilds those images. Confidence: high.

**6. `SLOP` is one line, so recipes smuggle scripts through `FILE`.**
Evidence: 931 continuation lines (9% of text; `Dollyfile-python` 215 of 420); 26 `FILE /tmp/*.slop|Makefile` build scripts followed by `SLOP slop -e /tmp/x.slop`; 31 nested `slop -c '…'` rows; 48 `SLOP` rows with `&&`, `;` or `|`; `zero-ad-deps:73-117` is a 44-line shell script in a `FILE`.
Do: let `SLOP` take an indented body with the lexer `FILE` already has (`dollyfile.c:1687-1700`), run as `slop -e` on stdin.
```
FILE /tmp/zad/build.slop            SLOP
    set -ex                     →       set -ex
    cd /tmp/zad/pkgconf                 cd /tmp/zad/pkgconf
SLOP time slop -e /tmp/zad/build.slop
```
Cost: round (engine + JS parser). Confidence: high.

**7. Licences and man pages are 7% of directive rows.**
Evidence: 86 `FILE /usr/share/licenses…`, 49 `COPY` rows whose source is a licence, 25 `SLOP cp … LICENSE`; 102 `FILE /usr/share/man/…`, 54 `EXPORTS TOOL x` + `FILE …/x.1` pairs, 10 `x --help > …/x.1`. `test/dollyfile-catalog.test.mjs:10` exists to catch forgotten licences.
Do: retain `/usr/share/licenses/**` and `/usr/share/man/**` by convention (one path rule in `collect_tree`); `EXPORTS TOOL x` captures `/usr/share/man/*/x.1` if present. Explicit retention stays for everything else. Cost: round. Confidence: medium-high (the test keeps the guarantee).

**8. Build-only images inherit the terminal and rebuild when it changes.**
Evidence: `display` has 90 transitive dependents because `Dollyfile-system-tools` installs it; about 35 recipes without `display@0` (`cc`, `python`, `ripgrep`, `cmake`, the Qwen shards, `pkgconf`…) are built `FROM system`/`system-tools` and carry the Ghostty plugin and font they cannot show. `zlib`, `curl`, `gzip` each have 90–91 dependents for the same reason.
Why: a font fix rebuilds the Rust chain (85 min for Pi's closure, memory 2026-10-10).
Do: a `TOOLCHAIN build` (cc + posix, no display) as the base of packages; `system` keeps display for openable images. Cost: recipe edits plus one round. Confidence: medium-high.

**9. Live install does not see version skew.**
Evidence: `install_live` parses the booted recipe with `execute = 0` (`dollyfile.c:2112`), so `engine->recipes` holds only the root; the `append_recipe` skew check (1594-1596) that protects builds never fires in a session. `record_installed` appends rows it lacks (1157-1166): installing `zig` after a `cc` of an older release yields two `cc` rows and silently overwritten files. `amy.find_row` matches recipe+pin (`amy.c:129-135`), so `amy list` then calls `cc` both installed and not.
Do: key the record by package name; when a row's pin is not published (service 404, `amy.c:198-200`), install the index's current pin for that name and replace the row. Cost: `amy.c` only (seed, bundle with finding 1). Confidence: high.

**10. `REQUIRES HOST runtime@0` is in 103 of 103 recipes.**
Evidence: `403d3abb` added it to 79 files; `scripts/lint-dollyfiles.mjs:64` fails without it; the engine does not need it. `DOLLY 7` and `DOLLY_IMAGE_BUILD_ID` already version the language and the ABI.
Do: make the runtime implicit in `DOLLY 7`; next revision `DOLLY 8` means `runtime@1`. Cost: cheap lint change + 103 rows (bundle with a round). Confidence: medium.

**11. The host block is the most repeated text and `nena` changes its meaning.**
Evidence: 502 rows, 43 distinct blocks; the 8-row openable block (`runtime display input download http snapshot threads upload`) recurs; `default` lists eleven "because the packages people install into it need them" (`docs/dollyfile.md:220-222`). With `nena@0` (in flight) a declared list becomes a floor the session can raise, so `default`'s eleven can shrink to what its own programs stamp, and the `INSTALL` failure "add REQUIRES HOST x" (`dollyfile.c:1098`) should say "nena enable x". Cost: part of the bridges round. Confidence: medium.

**12. The doc's own rule against repeated `COPY` rows is violated.**
Evidence: `docs/dollyfile.md:262` "The same COPY rows in two recipes are a missing package"; `zero-ad-deps`'s `libpng16.a`, `libfreetype.a`, `freetype2` and both licences are copied by `wine-build` and `xonotic-build` (8 and 5 rows); `nvim` is 12 `COPY` rows from one build, `wine` 15, `zero-ad` 13. `libpng` and `freetype` packages now exist (`demos/zero-ad/Dollyfile-libpng`, `-freetype`) but those consumers still copy.
Do: `INSTALL libpng`, `INSTALL freetype` in the three recipes; a `COPY RECIPE SHA /` whole-tree form is a package in disguise. Cost: cheap. Confidence: high.

**13. `APPLICATION` and `TOOLCHAIN` differ by one check.**
Evidence: 33 of 35 toolchains have `ENTRY` and open; the only engine difference is "APPLICATION is missing ENTRY" (`dollyfile.c:1720`) and lint's display rule (`lint-dollyfiles.mjs:67`); 90 `FROM` targets are toolchains, 3 applications. `PACKAGE` is the real distinction (keeps nothing of its base, 1317).
Do: two roles, `IMAGE` and `PACKAGE`; "opens" is a property (ENTRY + display), which `generate-routes.mjs:37` already computes. Cost: round + 54 role lines. Confidence: medium; low urgency.

**14. `RUN` exists for one recipe.**
Evidence: 5 rows, all in `Dollyfile-system-build:96-120`, compiling `cc`, `c++`, `ld`, `ar`, `slop` with the seed compiler; `bootstrap.c` already compiles `/bin/dollyfile` before the first row.
Do: let bootstrap compile `slop` too and delete `RUN`; `SLOP` becomes the only step. Cost: round (`bootstrap.c`, engine). Confidence: medium.

**15. Five checks are implemented twice, in C and JavaScript.**
Evidence: role of FROM/INSTALL target (`dollyfile.c:1309`, `dollyfile-graph.mjs:54-57`), INSTALL host check (1097 / 60-64), ENTRY retention (`entry_retained` / `lint-dollyfiles.mjs:28-39`), name-matches-file (1716 / graph 32-35), SOURCE digest (`fetch_source` / `image-definitions.mjs:108-112`); plus the whole lexer (`dollyfile-view.mjs`, 317 lines) with a test to keep both equal (`test/dollyfile-parser.test.mjs:44,55`). Outside the sandbox ≈5,300 lines (3,124 fetch/prepare scripts, 220 `prepare-image-sources.sh`, 212 tar builder, 425 parser/graph, 380 orchestration, 263 identity, 219 packs) against 2,183 inside.
Why it is partly right: lint without a build caught recipe errors agents shipped twice (memory 2026-10-07). What to cut: findings 3 and 4 shrink the JS graph's export/requirement resolution (`dollyfile-graph.mjs:44-100`), which only `REQUIRES` edges and the view page need. Cost: cheap after 3/4. Confidence: medium.

**16. `prepare-image-sources.sh` is a per-image table written as scattered ifs.**
Evidence: `has_image system-tools` appears in 9 separate blocks (lines 43-46, 50, 52, 100, 106, 126, 138, 153, 161); demos keep theirs in `demos/*/prepare-sources.sh` (727 lines, 22 files), core does not.
Do: `sources/IMAGE.sh` per core image, sourced like the demos'. Cost: cheap. Confidence: high.

**17. Newcomer traps the code confirms.**
`REQUIRES HOST` must precede every operation (`dollyfile.c:1480-1483`) yet is never inherited (ed24aa8d, e91fc5af are exactly this); a `SOURCE` to `/usr/…` is not retained without a `FILE` row (248 such rows; `dollyfile-catalog.test.mjs:27` exists for it); a derived image keeps its base's `EXPORTS FOLDER` capture (memory 2026-10-09); a `PACKAGE` without `FROM` has no `/bin/slop`. Findings 4, 7 and 11 remove three of the four. Cost: covered above.

## What is right and should stay

- One engine inside the sandbox, sealing the image and refusing an `ENTRY` or a stamped host module the recipe does not declare (`dollyfile.c:1909-1927`, `1987-2016`): the checks that caught real mistakes are these.
- `SOURCE LOCATION SHA256 DESTINATION` with the digest of external bytes, and explicit retention for everything the recipe itself produces.
- `PACKAGE` as the unit of reuse with `INSTALL` usable anywhere, and `/etc/dolly/installed` as the record both builds and sessions share: it is what makes dependencies work with no new syntax.
- `FILE` with an indented literal body, `SLOP CWD`, and `EXPORTS ENV … APPEND`: small, grepable, no expansion outside the shell.