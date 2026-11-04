# Host modules: why images declare what they declare

- STATUS: OPEN
- PRIORITY: 300
- TAGS: host-modules,audit,images,0.1.5

## State (2026-11-05 02:00 JST): R1 and R2 done on `core/modules-r1`; close after the round

R1 and R2 are implemented and built in this tree (image inputs `88959af6`): all 25
applications are FROM none and the lint refuses an APPLICATION with FROM; amy has nena enable
what a package needs, and `default` declares 10 modules. Application rows 293 to 225; counts
in "Counts after" below, checks in "Checks". Done-when 2 to 4 hold here; the round confirms
them over the whole catalog. R3, R4 and R5 are `tasks/20261104-143110-modules-r3`, `-r4`, `-r5`.

Applications not proven in a browser tonight, for the round:
- gpu-fluid and slopyard: their tests need a GPU window. slopyard's test also compiles C
  fixtures and uploads files in the slopyard image, which holds no compiler now: its compile
  steps belong in a toolchain image (gamedev-sdk with slopyard-game's libraries).
- xonotic: no test opens the application (`demos/xonotic/test` opens xonotic-build); a smoke
  run saw its client take the display (see "Checks").
- wine in Firefox: passes alone, failed twice beside an image build (GIMP's second start).

Owner (2026-11-04 22:30 JST): "I feel like the modularity of the host modules have been
lost somewhere along the way, and it's now ended up in a place where all images declare
everything... For example I see @audio and @http, @download, @upload etc on the tmux demo...
Maybe there is a reason but I want you to look at this with some fresh eyes." And: "In the
current setup, the only place I expect to see @http is on the pi-agent images."

Read on `integrate/2026-11-05` f0f5aff9c (today's recipes) and `notes/tasks-1105`, by a Fable
agent, read-only; nothing built or run. Stamps are read from the sources that link a client,
not from built executables, except one: the built `libdisplay.so` was scanned.

## Answer

The modules are still modular; the recipes are not. Three mechanisms, each sound on its own,
add up to "every image declares its base": an application built `FROM system` keeps every
file of the base; sealing refuses an image that keeps an executable stamped with a module it
does not declare; and the base holds programs that stamp (`dollyfile` the engine, `curl`,
`git-remote-http`, `download`, `upload`, `html`, `git`). So 21 of 25 applications carry
`system`'s nine modules whatever they are for. On top of that, `default` and the images that
install `amy` pre-declare five modules for packages someone might install later, although
`nena` exists for exactly that. The way out is in the language already: assemble applications
from packages (`FROM` none, `INSTALL`), as `default`, `zero-ad`, `pi-minimal` and `fingers`
do, and let `amy` enable what a package needs when it is installed.

## 1. The mechanism

What makes an image declare `name@version`, read in the code:

1. **A client stamps the executable.** Each module's `client.c` emits one `dolly.host` record
   (`include/dolly/host.h:10-14`, `DOLLY_HOST_REQUIRE`); 16 of 20 modules have one
   (`host/*/client.c`; none for `snapshot`, `packages`, `build`, `stack`). `cc` links every
   client archive but sockets' and pty's (`src/compiler.cpp:826-830`), and the linker pulls
   only referenced members, so a program records exactly the modules whose client it calls.
   Confirmed: `src/process/runtime-adapter.c` references no `dolly_http_*`; the libc adapter
   stamps nothing. There is no over-attribution at the link.
2. **Sealing requires every stamp declared.** The engine walks every retained regular file,
   reads `dolly.host` records of Wasm modules and fails on one the recipe does not declare:
   `dollyfile: PATH uses X: add REQUIRES HOST X` (`src/dollyfile.c:1817-1853`, `host_declared`
   `:961`). Archives (`.a`) begin with `!<arch>` and are skipped.
3. **`FROM` keeps the whole base** for an `APPLICATION` or `TOOLCHAIN`; a `PACKAGE` keeps its
   exports only (f0f5aff9c: "Packages on system keep only their exports and were unaffected;
   these sixteen applications keep the whole base"). Declarations are never inherited
   (`docs/dollyfile.md:221-222`, owner correction in
   `tasks/20261001-214000-dollyfile-v6/TASK.md:217-231`), but the files are, so 2 forces the
   base's stamps onto every image built FROM it.
4. **`INSTALL` requires the package's list declared** (`src/dollyfile.c:1019-1033`;
   `src/dollyfile-graph.mjs:63-65`); a package carries the packages it installs and their lists.
   This is the "package carries its requirements" mechanism and it works as designed.
5. **At run time** the page enables exactly the declared list (`src/site.mjs:57-62`), the
   loader refuses an executable whose stamp is not declared or enabled
   (`host/requirements.mjs:268-275`, `src/process-supervisor.mjs:424,515`), and an undeclared
   module's import answers `ENOSYS` (`host/modules.mjs:568-575`). A declared module is started
   at boot by the page, so it is authority the image has whether a program calls it or not.
6. **`nena@0`** lets a session enable a module that is not declared (`:1031`: "needs X: nena
   enable X"); `http@0`, `display@0`, `input@0`, `snapshot@0`, `runtime@0`, `build@0` are
   `fixed` and cannot be enabled after boot (`host/http/module.json:5`).
7. **No stamp for the terminal.** `libdisplay.so` (the Ghostty plugin, which includes
   `dolly/input.h`, `src/ghostty/display.c:23`) carries no `dolly.host` record (scanned
   `work/evidence-2026-11-04/stack/stack-evidence/libdisplay.so`: sections `dylink.0`, `name`,
   `producers`, `target_features`, `dolly.abi`). `display@0` and `input@0` on terminal images
   and `snapshot@0` are declared by convention and the lint (`scripts/lint-dollyfiles.mjs:67`,
   0647f58b0 "every terminal image"); nothing forces them.

What the base holds that stamps:

| Base | Stamping programs it retains | Modules forced on everything FROM it |
| --- | --- | --- |
| `system-build` | `/bin/dollyfile`, the seed engine (`EXPORTS TOOL dollyfile`, `Dollyfile-system-build:383`), which fetches `SOURCE` rows through the broker (`src/dollyfile.c:310,450`; `scripts/build.sh:209-233` links the seed's programs with every client) | `http@0` |
| `system-tools` | `+ /usr/bin/curl` (`Dollyfile-system-tools:206`), `/usr/bin/git` built `-pthread` (995548e02) and `/usr/libexec/dolly/git-remote-http`, the one Git executable linking libcurl (`Dollyfile-git:91,110-118`); git is there because Dolly's `patch` and `diff` run it (`:163-164`) | `+ threads@0`; `display@0` by the `display` package (`:289`) |
| `system` | `+ /bin/download`, `/bin/upload` (transfer, 5caa5e814 "for itself and the 22 images built on it"), `/usr/bin/html` (b48c0bcc8, "here and in the images built on this one") | `+ download@0 upload@0 html@0` |

Every FROM base must hold the engine: "The build runs the base's `/bin/dollyfile`"
(`docs/dollyfile.md:140`). FROM/INSTALL/COPY inputs reach the engine as files the page
verified (`host/runtime/runtime.mjs:131-133,184`, `env.dolly_build_input_read`); `SOURCE` is
the one thing the engine fetches itself, and the reason it links the http client.

## 2. Inventory (integrate f0f5aff9c: 197 recipes, 196 with rows; 25 applications, 33 toolchains, 138 packages)

| Module | Images | Applications | Toolchains | Packages |
| --- | --- | --- | --- | --- |
| runtime@0 | 196 | 25 | 33 | 138 |
| http@0 | 73 | 24 | 33 | 16 |
| threads@0 | 72 | 23 | 27 | 22 |
| display@0 | 62 | 25 | 28 | 9 |
| input@0 | 61 | 25 | 28 | 8 |
| download@0 | 38 | 24 | 7 | 7 |
| sockets@0 | 31 | 7 | 12 | 12 |
| touch@0 | 31 | 17 | 5 | 9 |
| upload@0 | 31 | 23 | 7 | 1 |
| html@0 | 30 | 22 | 6 | 2 |
| dso@0 | 30 | 7 | 13 | 10 |
| snapshot@0 | 29 | 23 | 6 | 0 |
| audio@0 | 28 | 16 | 5 | 7 |
| packages@0 | 11 | 10 | 0 | 1 |
| gpu@0 | 11 | 7 | 2 | 2 |
| nena@0 | 8 | 7 | 0 | 1 |
| pty@0 | 8 | 4 | 0 | 4 |
| microphone@0 | 4 | 2 | 0 | 2 |
| stack@0 | 2 | 0 | 1 | 1 |
| build@0 | 1 | 1 | 0 | 0 |

21 of 25 applications declare all nine of `system`'s modules. The four that do not are the
four built FROM none: `default`, `zero-ad`, `pi-minimal`, `fingers`. `fingers` declares what it
uses and nothing else (runtime, display, input, audio, touch). `zero-ad` says why it is not
FROM `default`: "a change to the image people open then rebuilds no game, and this page holds
none of default's amy or nena" (`demos/zero-ad/Dollyfile-zero-ad:14-16`).

### Classes, counted (757 declarations)

Rules, mechanical (`scratch: classify2.py`): runtime is the kernel; a package's rows are its
own program's (rule 4); `display`, `input`, `snapshot` in a runnable image are the page's
terminal and session (no stamp); a row named by the recipe's comment or its commit as being
for packages amy may install is pre-declared; a row a generic base (`system-build`,
`system-tools`, `system`, `cmake-build`, `tools-build`, `x11-build`, …) declares and no package
the image installs for its purpose needs is inherited; the rest are the image's own (the pi
chain and `default` count as purpose bases for the images built on them).

| Class | All | Applications |
| --- | --- | --- |
| the kernel (runtime@0) | 196 | 25 |
| 1 needed by a program the image is for | 325 | 137 |
| 1' the page's terminal or session save, no program stamps it (display, input, snapshot) | 107 | 55 |
| 2 inherited only because the base holds an unrelated stamping program | 109 | 56 |
| 3 pre-declared for packages amy might install | 20 | 19 |
| 4 required by a mechanism linking a client into programs that do not call it | 0 | 0 |

Class 4 is empty: the linker pulls referenced members only. The nearest thing is the engine,
linked with the http client in every base because `SOURCE` may run (class 2 above, 28 rows),
and Rust and Python executables, which stamp `threads@0` by their runtimes
(`demos/rust/Dollyfile-rust:33` "Executables link threaded and need threads@0"), whether a
program spawns a thread or not; not measured here.

Per module, class 2 and 3 rows: http 24+0, threads 22+2, upload 25, download 15, html 15,
dso 4+2, sockets 3+2, touch 0+7, audio 1+7. Of an application's rows beyond the kernel, 75 of
267 (28%) are inherited or pre-declared; on `gnu-emacs`, `neovim`, `wine`, `gpu-fluid`,
`mojo-gpu`, `speech-to-text-mic` and `xonotic`, five of nine or ten.

## 3. The owner's example: tmux-panes, row by row

`demos/tmux/Dollyfile-tmux-panes` (integrate): `APPLICATION tmux-panes`, `FROM system`,
`INSTALL amy`, `INSTALL tmux`; 15 modules.

| Row | Why it is there | Class |
| --- | --- | --- |
| runtime@0 | the kernel | kernel |
| display@0, input@0 | the terminal tmux draws in; no stamp, convention and the lint | 1' |
| snapshot@0 | Ctrl+Shift+S saves the session; no stamp; `system` declares it | 1' |
| pty@0, sockets@0 | tmux: panes are pseudo-terminals, client and server speak over a socket (`Dollyfile-tmux:3-5`, `-ldolly-sockets -ldolly-pty`) | 1 |
| http@0, packages@0 | `amy`, installed so "amy installs into a pane what it installs into default" (`demos/tmux/README.md`); amy fetches package snapshots from `packages@0`, an origin served behind the HTTP broker (`host/packages/module.json` depends on http@0; `src/commands/amy.c:26,67-78`). Also forced by the base: `/bin/dollyfile`, `/usr/bin/curl`, `/usr/libexec/dolly/git-remote-http` | 1 (and 2) |
| threads@0 | the recipe says "for what amy installs" (`:18`); also forced by `/usr/bin/git` in the base | 3 (and 2) |
| dso@0 | "for what amy installs into a pane, as in default" (`:18`; 5dbcfad9a) | 3 |
| audio@0, touch@0 | for SDL programs amy might install (224a54e76, 4793f9031: "the integrator's decision") | 3 |
| download@0, upload@0 | `/bin/download`, `/bin/upload` kept from `system` (transfer) | 2 |
| html@0 | `/usr/bin/html` kept from `system` since b48c0bcc8; added today by f0f5aff9c because sealing refused the image otherwise | 2 |

tmux itself needs runtime, display, input, pty and sockets: five. With amy and the session
save, eight. The other seven are the base and pre-declaration.

## 4. http@0: every image that declares it, and why

73 images. The http client is referenced by: `src/dollyfile.c` (the engine, `SOURCE`),
`src/libcurl-fetch.c` (curl and everything linking libcurl: `git-remote-http`, cmake, python,
wine-build's and zero-ad-deps' builds), `src/commands/amy.c`, `demos/javascript/quickjs-main.c`
(the janis runner: janis, tsc, janis-install, vendor-crates, pi), `demos/python/cpython-http.c`,
`demos/rust/config/patches/reqwest-broker.rs` (cargo, codex), Go's `net/http`
(`demos/go/Dollyfile-go:4`), `demos/zero-ad/enet-dolly.c`.

**A. 16 packages, each for its own program** (a package keeps only its exports): `curl`;
`git` (`git-remote-http`); `amy`; `dollyfile`; `cmake` (`--system-curl`); `go`; `janis`;
`janis-install`, `typescript`, `vendor-crates` (link `-ldolly-js`, the runner); `pi`; `pi-dolly`;
`cargo`; `python` (`_dolly_http`); `codex`; `meson` (brings `python`). Real needs.

**B. 3 applications built FROM none that install a network program on purpose**: `default`
(`curl`, `amy`); `pi-minimal` (`pi`, `curl`); `zero-ad` (`curl`, "as default installs them").

**C. 14 applications whose purpose includes a network program, on a base that also forces it**:
`pi-agent`, `pi-local`, `pi-phone`, `dollyfile-studio`, `closed-source-agent`, `bhop`,
`classicube`, `rts-arena`, `slopyard` (pi); `codex-agent` (codex); `python-data` (default's
curl and amy, python); `tmux-panes`, `ghostty-x11`, `x11-desktop` (amy). Each also keeps
`/bin/dollyfile`, `/usr/bin/curl` and `git-remote-http` from `system`.

**D. 7 applications with no network program of their own**: `gnu-emacs`, `neovim`, `wine`,
`gpu-fluid`, `mojo-gpu`, `speech-to-text-mic`, `xonotic`. http@0 is there only because
`FROM system` keeps `/bin/dollyfile`, `/usr/bin/curl` and `/usr/libexec/dolly/git-remote-http`.

**E. 33 toolchains.** All keep `/bin/dollyfile`. Five hold nothing else that stamps http
(`system-build`, `zig-build`, `zig-llvm-build`, `go-sdk`, `ghostty-build`); 28 also keep `curl`
and `git-remote-http` from `system-tools`, and 15 of those hold a network tool of the
toolchain's own (cmake with libcurl, python, go, cargo, pi). The 13 with none of their own:
`system`, `classicube-build`, `lean-stage0`, `rts-build`, `gamedev-sdk`, `wine-build`,
`xonotic-build`, `zero-ad-deps`, `zero-ad-engine`, `mesa-build`, `tools-build`, `llvm-build`,
`llvm-cc` (the last four keep cmake and python from `cmake-build`, their build tools).

Of the 73, 48 have a network program of their own (A 16, B 3, C 14, 15 of E); 25 declare
http@0 for the engine or the base alone (D 7, 5 engine-only toolchains, 13 of E).

### What would make "only the pi-agent images" true, and the cost

Today the http client reaches an image by three roads: the engine (every base), curl and
git's http helper (every image on `system-tools`), and amy's package service (every image
with amy). Removing each:

1. **The engine stops fetching.** `SOURCE` rows become build inputs the page fetches and
   verifies, as FROM/INSTALL/COPY artifacts already are (`src/image-build.mjs:19` parses
   `graph.root.sources`; `host/runtime/runtime.mjs:184`). The engine then links no http client,
   `system-build` declares `runtime@0` only, `buildHost` (`host/modules.mjs:284`) loses
   `http@0`, and a build has no network edge at all. Cost: `src/dollyfile.c` `fetch_source`
   (`:450-490`) reads a staged input instead of the broker; the build Worker stages sources;
   the seed is rebuilt, so every image is (intentional, per the owner). Removes http from the 5
   engine-only toolchains.
2. **curl and `git-remote-http` leave the base.** No build row runs `curl` (grep: only
   `Dollyfile-curl`); libcurl's consumers `USE` the curl package already. Git's core stays in
   `system-tools` for `patch`; its http helper becomes a `git-http` package (one Makefile
   target, `Dollyfile-git:110-118`). Cost: recipes only (`Dollyfile-system-tools`,
   `Dollyfile-git`, a new package, the images that want curl or git-over-http add an INSTALL);
   a round. Removes http from D (7 applications) and the 13 toolchains, 20 images.
3. **amy without http@0.** `packages@0` rides the broker as a reserved origin
   (b60b426a2); amy therefore needs http@0, and so does every image with amy (`default`,
   `tmux-panes`, `ghostty-x11`, `x11-desktop`, the agents). To free them, `packages@0` would hand
   the verified snapshot over its own channel, as `upload@0` hands a file (one dispatch import,
   a client, `amy.c`'s `fetch` replaced; `docs/browser-boundary.md` row). And `default` would
   drop `curl`, or lift `fixed` from `http@0` so `amy install curl` can be followed by
   `nena enable http` (`host/http/http.mjs:6-46` keeps the policy from load; the transport
   could start on enable). Cost: a module contract, the client in the seed, amy, default and
   the ten images with amy; a round.

After 1 and 2, http@0 stays on the 48 images with a network program (the agents, default,
python, cargo, go, cmake and their toolchains). After 3 as well, on the agents, the images with
pi, codex, python, cargo, go or cmake, and `zero-ad` if it keeps curl: the owner's expectation
up to the toolchains and the language runtimes that fetch.

## 5. History: when and why it grew

| Date | Commit | What and the reason given |
| --- | --- | --- |
| 2026-10-01 | 5ec4783cc Phase 3 | "REQUIRES HOST is the image's complete list: nothing is inherited … sealing scans every retained Wasm module's dolly.host records against the declared set. Every image now declares what its executables stamp (the engine stamps http@0; download and upload tools from system-tools on …)". Owner correction recorded in `tasks/20261001-214000-dollyfile-v6/TASK.md:217-231`: explicit lists; derivation from stamps "checked and rejected as a replacement" because snapshot and build stamp nothing. |
| 2026-10-02 | b60b426a2 amy | `packages@0` "owns https://packages.dolly.invalid behind the HTTP broker"; "default declares packages@0 and threads@0". The first pre-declaration. |
| 2026-10-06 | 403d3abbe, 0647f58b0 | runtime@0 in every recipe; "Declare input@0 in every terminal image". |
| 2026-10-06 | 5dbcfad9a dso | "default and the ten recipes that keep a host declare the module"; "declaring it costs a program that does not record it nothing". |
| 2026-10-08 | 6563dff81 sockets | Owner: "declared only by programs that require only at link time. Things that don't need it to run shouldnt require it" (`tasks/20261007-074904-sockets-module/TASK.md:45-50`). The sockets and pty clients are opt-in; the other clients were not revisited. |
| 2026-10-13 | a182787af nena | "a session configures its host modules freely while it runs"; `default` declares nena; http, display, input, snapshot fixed. |
| 2026-10-14 | 5caa5e814 | `system` installs transfer "for itself and the 22 images built on it"; 20 build toolchains outside system's subtree lose download/upload. |
| 2026-10-24 | 4793f9031, 224a54e76 | touch@0 then audio@0 on default, pi-agent, pi-local, closed-source-agent, dollyfile-studio, tmux-panes "where packages are installed … (the integrator's decision)", so `amy install sdl2` works without `nena enable`. |
| 2026-10-28 | 995548e02 | Git built `-pthread`; "Every image that carries Git declares threads@0 (sealing checks the stamp), system among them." |
| 2026-11-04 | b48c0bcc8, f0f5aff9c | html installed in default and system ("a shell user had no html command"); then "an image that keeps /usr/bin/html must declare the module (the engine refuses to seal it otherwise)": 16 applications gain html@0. |

Each step was reasoned and each is sound alone. The pattern: a program is added to a base
for convenience (10-14, 10-28, 11-04), sealing then requires its module on every image keeping
the base, and the row is added across the catalog. The owner's 10-08 ruling was applied to
sockets and pty and to nothing else. `tasks/20261013-175624-library-hosts/investigation.md`
(10-14) already noted: "Every application and toolchain declares http@0 (the 62 recipes
without it are all packages), so curl's http@0 refuses nothing today."

## 6. The design that restores modularity

Root causes, ranked: (1) applications are built FROM the build toolchain and so ship it, with
every module its programs stamp; (2) the engine, present in every base, stamps http@0 for a
fetch only a build does; (3) the base grows programs for convenience and each one's module
reaches every image on it; (4) pre-declaration for amy, where nena is the mechanism meant for
it; (5) http@0 is fixed, so an image that may ever want the network must declare it at build.

Recommendation, in the order of value per cost:

**R1. Applications are assembled from packages; nothing an application ships is FROM a
toolchain.** The language has it: `default`, `zero-ad`, `pi-minimal` and `fingers` are FROM
none and INSTALL `core`, `posix`, `display` and what they are for. A program an application
builds for itself (`anykey`, `fluid`, the mojo check, xonotic's launcher) becomes a PACKAGE
first, as `tmux` already is. A rule for the lint: an `APPLICATION` has no `FROM`
(`scripts/lint-dollyfiles.mjs`, beside the display@0 rule). Ten of the 21 applications built
FROM a base have no build step of their own and only INSTALL packages (`codex-agent`,
`ghostty-x11`, `gnu-emacs`, `neovim`, `pi-agent`, `pi-phone`, `speech-to-text-mic`,
`tmux-panes`, `wine`, `x11-desktop`): for them it is the FROM line replaced by three INSTALLs.
The other 11 build a program first (`fluid`, `anykey`, `slopyard`, the bhop, classicube and
rts viewers and agents, the mojo check, xonotic's launcher, Studio): each becomes a package.
Cost: recipes only; no contract, engine or seed change; the applications rebuild on every round
anyway. Effect: an application declares the kernel, the terminal, the session and its programs'
modules. tmux-panes: `INSTALL core posix display amy tmux` → runtime, display, input, snapshot,
http, packages, pty, sockets: 8 of today's 15; without amy, 6. `gnu-emacs`: 9 → 4 (runtime,
display, input, snapshot: the `emacs` package declares `runtime@0` alone).

**R2. amy enables what a package needs, at install.** The engine already refuses with the
exact line (`src/dollyfile.c:1031` "needs X: nena enable X"); amy, on that status in an image
with nena@0, runs the switch (nena's path, `src/commands/nena.c`) and retries, telling the user
what it enabled. The 20 pre-declared rows go: default keeps runtime, display, input, snapshot,
http, packages, nena, download, upload, html (10 of 15). Cost: `amy.c` (~40 lines), the amy
package and the images that install it; `test/amy-browser.mjs`. The owner's model
(a182787af) is kept: the page makes the switch, the user sees it.

**R3. The base holds the toolchain, not conveniences.** `system` stops installing transfer and
html; `system-tools` stops installing curl, and git's http helper becomes a `git-http` package
(section 4, item 2). With R1 this matters only for toolchains, which keep the engine anyway.

**R4. SOURCE through the build inputs** (section 4, item 1): the engine stamps nothing and
builds have no network edge. A seed change; worth doing when the seed is next rebuilt for
another reason, not alone.

**R5. amy's package service off the broker, http@0 switchable** (section 4, item 3): only if
the owner wants `default` without http@0.

Not recommended: dropping the sealing scan or admitting undeclared stamps at launch with
per-call `ENOSYS`. The scan is what makes a declared list trustworthy ("an image cannot retain
a program it could not run"); the problem is what the image retains, not that it is checked.

What the owner would see: tmux-panes's page lists runtime, display, input, snapshot, pty,
sockets (and http, packages if amy stays); gnu-emacs's lists four or five; http@0 appears on
the agents, default and the build toolchains, and nowhere a shell editor or a game is.

## Done when

1. The owner has chosen among R1 to R5 (R1 and R2 are the recommendation; R3 to R5 are
   independent).
2. R1: every `APPLICATION` recipe has no `FROM`; each program an application built for itself
   is a package; the lint refuses an application with `FROM`; the catalog builds; each
   application's page lists only the kernel, the terminal, the session and its programs'
   modules; tmux-panes declares at most 8.
3. R2: `amy install sdl2` in a `default` that declares no `audio@0` or `touch@0` enables both
   and installs, in Chromium and Firefox (`test/amy-browser.mjs`); `default` and the amy
   images declare no module for a package they do not hold.
4. This task records the counts after, against section 2.

## Method and limits

Recipes read from `integrate/2026-11-05` f0f5aff9c with two scripts in the agent's scratch
area (inventory, classification by the rules of section 2); the code paths cited were read in
`notes/tasks-1105` (same sources). Which executables stamp what is inferred from the sources
that reference a client and the recipes' link lines, not from built images, except
`libdisplay.so`. Not measured: whether every Rust or Python executable stamps `threads@0`;
whether `go` stamps `http@0` on every Go program.

## R1 and R2: the work (2026-11-05 night, `core/modules-r1`)

### R1, the ten that only install packages

Each is `core`, `posix`, `display` and the packages it is for; it declares the kernel, the
terminal, the session and what those packages declare. Measured on the built images
(`dist/dolly-images.json`, image inputs `88959af6`):

| Application | Modules before | After | Snapshot before, after |
| --- | ---: | ---: | --- |
| tmux-panes | 15 | 8 | 156, 14 MB |
| gnu-emacs | 9 | 4 | 299, 158 MB |
| neovim | 10 | 5 | 187, 46 MB |
| codex-agent | 10 | 7 | 375, 234 MB |
| speech-to-text-mic | 10 | 6 | 294, 152 MB |
| wine | 10 | 7 | 194, 53 MB |
| x11-desktop | 16 | 11 | 172, 30 MB |
| ghostty-x11 | 16 | 13 | 229, 87 MB (`ghostty-gtk` taken from the round) |
| pi-agent | 13 | 11 | 234, 234 MB |
| pi-phone | 14 | 13 | 374, 373 MB |

- pi-agent and pi-phone install `cc`, `git`, `curl` and `transfer`: Pi's prompt and dolly
  skill (`demos/pi/SYSTEM.md`, `skills/dolly/SKILL.md`) teach `cc`, `make -j` with `curl`,
  `git status`, `download FILE` and `upload PATH`, and pi-agent's test compiles. They lose
  `audio@0` and `touch@0` (pre-declared for amy). `pi-minimal` stays without `upload@0`, as its
  README says.
- wine keeps `http@0`: `/usr/bin/wine` stamps it (scanned in wine-build's snapshot: threads,
  sockets, display, input, http; NetSurf fetches). The audit's class D counted it as
  "no network program of its own"; it has one.
- tmux-panes holds no compiler now: its test runs `amy install cc` in the pane before the
  session's first `cc`. It declares no `nena@0` (at most 8), so `amy install nvim` (`dso@0`) is
  refused there; the README says so and its example is `vi`.
- neovim's test compiled a probe with `cc` to read the terminal's mode after nvim; it now proves
  the same by behaviour: Ctrl+C ends `sleep 30` with 130 after nvim exits.
- `work/integrate` note: `demos/gpu-fluid/prepare-gpu-fluid.mjs` writes `Dollyfile-gpu-fluid`
  without the `html@0` that f0f5aff9c added by hand, so a build that selects gpu-fluid rewrites
  the recipe and sealing then refuses `/usr/bin/html` from `system` (`work/integrate` shows the
  recipe modified). R1 removes the cause (gpu-fluid no longer keeps `system`).

### R2, amy enables at install

`amy` (`src/commands/amy.c`, not a seed input: the `amy` package compiles it) reads the host
modules the package's snapshot receipt names (`/etc/dolly/artifact`, DOLLYART 5), those the
image's own receipt declares and those `/etc/dolly/enabled` lists; where the image declares
`nena@0`, it says which the session lacks and runs `/bin/nena enable` for them, whose lines
say what it enabled; then the engine installs the row as before and still checks. Without
`nena@0` the engine refuses the row as before, naming the line to add.

Why before the engine and not on its refusal: the refusal is a line of prose on stderr and
an exit status 2 shared with every other failure, so acting on it would mean parsing the
message; a typed status or list from the engine is a change to `src/dollyfile.c`, a seed input
(every image), not possible tonight. Reading the two receipts is what the engine itself does
(`install_live`, `host_declared`, `host_enabled`), and the engine stays the check. Spawning
`/bin/nena` keeps amy from linking nena's client, which would stamp `nena@0` on amy and force
it onto every image that installs amy (tmux-panes).

`default` declares 10 modules (15 before): runtime, display, input, snapshot, http, packages,
nena, download, upload, html. The five rows for packages amy might install (audio, dso,
sockets, threads, touch) are gone.

### R1, the eleven that build a program first

What each built for itself is a package; the application installs it with `core`, `posix`,
`display` and what it is for. Generated recipes are changed in their generators
(`demos/gpu-fluid/prepare-gpu-fluid.mjs`, `demos/slopyard/prepare-slopyard.mjs`), and each demo's
`prepare-sources.sh` stages for the package now.

| Application | New package | Modules before | After |
| --- | --- | ---: | ---: |
| python-data | (default's packages and `python`, restated) | 15 | 13 |
| pi-local | `pi-llm`: the provider, dolly-llama and Qwen3.5-2B, Pi's settings | 14 | 12 |
| dollyfile-studio | (`pi-llm`, `nvim`) | 16 | 14 |
| closed-source-agent | `anykey` | 12 | 8 |
| gpu-fluid | `fluid` | 10 | 5 |
| mojo-gpu | (none: its check builds into `/tmp`) | 10 | 5 |
| xonotic | (none: it copies the client, its launcher is a FILE) | 12 | 7 |
| classicube | `classicube-agent` | 11 | 11 |
| rts-arena | `seven-kingdoms` | 11 | 11 |
| bhop | `airtime` | 11 | 11 |
| slopyard | `slopyard-game` | 11 | 11 |

- The game applications keep their 11: their agents are Pi (`pi-dolly`: download, html, http,
  threads), their programs stamp SDL2's or raylib's modules (scanned: `classicube-agent`,
  `bhop-agent` and `rts-arena` stamp download and http; the viewers audio, display, input and
  touch; `slopyard` gpu, display, download, http, input, threads and touch), and they run
  `download` and `upload` (transfer): the agents' settings (`demos/game-agent/settings.mjs`,
  OpenRouter sign-in) and relay import (`demos/rts/spectator/relay.mjs`), slopyard's export and
  import (`system("upload …")` in `demos/slopyard/src/main.c`). A first cut without transfer
  built and would have broken those; reading what the programs spawn, not only what they
  stamp, found it.
- bhop installs `cc` and `raylib` besides `airtime`: its `.dollyrc` tells the player to edit
  `bhop.c` and `make -f bhop.mk`. rts-arena's test compiled in the session (the replay layout
  from the game's headers, and an input probe with SDL2 and zlib); those two steps now run in
  `rts-build`, where the game is compiled, and pass the layout to `rts-match.mjs` as an
  argument, so rts-arena holds no compiler (353 MB with one, 215 MB without).
- Studio's examples (`demos/studio/examples/*.in`) are applications of `core`, `posix`,
  `display` (and `cc` for the tool), their rows taken from the image's `/etc/dolly/installed`
  (an application FROM none has no `recipes.lock` until it is sealed); the skill teaches that
  an application has no `FROM`.

## Counts after (2026-11-05, `core/modules-r1` b6bd7c18c)

Recounted by section 2's method from this branch's recipes (203 recipes: 25 applications, 33
toolchains, 145 packages; seven packages are new): 726 declarations, of which applications
hold 225 (293 on f0f5aff9c). Each application's list, as built (`dist/dolly-images.json`):

| Application | Before | After | Modules after (`@0` omitted) |
| --- | ---: | ---: | --- |
| bhop | 11 | 11 | audio, display, download, html, http, input, runtime, snapshot, threads, touch, upload |
| classicube | 11 | 11 | audio, display, download, html, http, input, runtime, snapshot, threads, touch, upload |
| closed-source-agent | 12 | 8 | display, download, http, input, packages, runtime, snapshot, threads |
| codex-agent | 10 | 7 | display, http, input, runtime, snapshot, sockets, threads |
| default | 15 | 10 | display, download, html, http, input, nena, packages, runtime, snapshot, upload |
| dollyfile-studio | 16 | 14 | build, display, download, dso, gpu, html, http, input, nena, packages, runtime, snapshot, threads, upload |
| fingers | 5 | 5 | unchanged (FROM none before) |
| ghostty-x11 | 16 | 13 | audio, display, dso, http, input, nena, packages, pty, runtime, snapshot, sockets, threads, touch |
| gnu-emacs | 9 | 4 | display, input, runtime, snapshot |
| gpu-fluid | 10 | 5 | display, gpu, input, runtime, snapshot |
| mojo-gpu | 10 | 5 | display, gpu, input, runtime, snapshot |
| neovim | 10 | 5 | display, dso, input, runtime, snapshot |
| pi-agent | 13 | 11 | display, download, html, http, input, nena, packages, runtime, snapshot, threads, upload |
| pi-local | 14 | 12 | display, download, gpu, html, http, input, nena, packages, runtime, snapshot, threads, upload |
| pi-minimal | 7 | 7 | unchanged (FROM none before) |
| pi-phone | 14 | 13 | display, download, html, http, input, microphone, packages, pty, runtime, snapshot, threads, touch, upload |
| python-data | 15 | 13 | display, download, dso, html, http, input, nena, packages, runtime, snapshot, sockets, threads, upload |
| rts-arena | 11 | 11 | audio, display, download, html, http, input, runtime, snapshot, threads, touch, upload |
| slopyard | 11 | 11 | display, download, gpu, html, http, input, runtime, snapshot, threads, touch, upload |
| speech-to-text-mic | 10 | 6 | display, input, microphone, runtime, snapshot, threads |
| tmux-panes | 15 | 8 | display, http, input, packages, pty, runtime, snapshot, sockets |
| wine | 10 | 7 | display, http, input, runtime, snapshot, sockets, threads |
| x11-desktop | 16 | 11 | audio, display, http, input, nena, packages, pty, runtime, snapshot, sockets, touch |
| xonotic | 12 | 7 | audio, display, gpu, input, runtime, snapshot, touch |
| zero-ad | 10 | 10 | unchanged (FROM none before) |

Applications per module, section 2 against now: http 24 to 18, threads 23 to 15, download 24
to 13, upload 23 to 11, html 22 to 11, touch 17 to 10, audio 16 to 8, dso 7 to 4, sockets 7
to 6, display, input and runtime 25, snapshot 23, gpu 7, nena 7, packages 10.

`http@0` is now on the applications with a program that fetches: the agents (pi-agent,
pi-local, pi-phone, dollyfile-studio, codex-agent, closed-source-agent, and the four game
agents on Pi), `default`, `python-data` and `zero-ad` (curl, amy, pip), wine (NetSurf), and
`tmux-panes`, `x11-desktop`, `ghostty-x11` for amy alone: R5 would take it from those three.
It is gone from gnu-emacs, neovim, speech-to-text-mic, gpu-fluid, mojo-gpu and xonotic.

## Checks (2026-11-05 night, this tree, image inputs `88959af6`)

| Check | Chromium | Firefox |
| --- | --- | --- |
| lint (203 recipes, the APPLICATION-without-FROM rule) and its test | passed (Node) | |
| source suite | 474 of 475; `http-broker.test.mjs` "a response lasts as long as it moves" fails under the night's load, alone too; no broker code changed | |
| tmux demo: tmux-panes (`amy install cc` in a pane), the tmux package in default (amy enables pty and sockets), tmux in ps | passed | passed |
| emacs demo: gnu-emacs (4 modules), the emacs package | passed | passed |
| neovim demo: neovim (5 modules), Ctrl+C after nvim | passed | passed |
| `test/amy-browser.mjs`: every case; SDL2's audio and touch enabled by amy in default, llama's gpu, cmake, rust, codex, python | passed | passed |
| `test/nena-browser.mjs` (audio and threads enabled, not declared) | passed | passed |
| speech demo: speech-to-text-mic, default's `amy install speech-to-text` (microphone enabled) | passed | passed |
| speech demo: pi-phone | passed | (Chrome only) |
| x11 demo: x11-desktop, amy installs tmux from xterm | passed | passed |
| pi demo: pi-agent (cc, make, curl, git as the skill teaches) | passed | passed |
| codex demo: codex-agent | passed | |
| python demo: python-data, its NumPy probe on default and python | passed | passed |
| closed-source-agent demo | passed | passed |
| mojo demo: mojo-gpu on the software adapter | passed | (GPU window only) |
| local-llm demo: pi-local and dollyfile-studio start screens | passed | |
| wine demo: wine | passed | passed alone; failed twice, at GIMP's second start ("the saved stroke in the image opened again"), each time while an image build ran beside it. The image before R1 (FROM system, built for the A/B) passed alone too: load, not R1 |
| rts demo: the replay layout and input probe in rts-build, then rts-arena (no compiler; its scripts written into the session) | passed | |
| xonotic: a smoke run (scratch script, not committed) opens `/xonotic/` on the software adapter: the client takes the display and sends 299 `gpu@0` packets (156 MB) in 5 s | passed | |
| ghostty-gtk demo, after the round's `ghostty-gtk`: ghostty-x11 (229 to 87 MB) | passed | passed |
| studio demo: dollyfile-studio, its shipped tool example (core, posix, display, cc) built by `dollyfile-build` | passed | |
| classicube demo (its session parsers read the 24-byte records of 0cf7cb6dc) | passed | |
| bhop demo (the same parser fix) | passed | |
| pi demo, speech demo (pi-phone), studio demo, local-llm start screens: after transfer was added | passed | |
| `test/default-browser.mjs` (default's modules are its recipe's ten) | passed | passed |

## Lessons

- The leak was the base, not the modules: `FROM` keeps every file of a toolchain, and sealing
  then puts each stamping program's module on the image. Assembling from packages removed 68
  application rows and most of the bytes (tmux-panes 156 to 14 MB, ghostty-x11 229 to 87 MB,
  gpu-fluid 154 to 13 MB) with recipes alone; the lint now keeps it so. Read a recipe's
  stamps from built snapshots (`dolly.host` sections) rather than infer them from sources:
  wine's NetSurf stamps `http@0`, which the audit had missed. Stamps do not show what a
  program spawns: the game agents and slopyard run `download` and `upload`, which they had
  from `system`; grep for `system(`, `spawn` and `run(` before dropping a base's commands.
- A refusal written as prose cannot be acted on by another program. amy could not use the
  engine's "needs X: nena enable X" line and reads the receipts the engine reads instead, so
  the DOLLYART layout now lives in two places; an engine that answers "which modules does this
  row need here" (a typed status and list) is the clean form, worth doing with R4's seed change.
- Tests had leaned on the base: tmux's compiled with `cc` in a pane, neovim's compiled a
  probe, mojo's fetched with `curl`, nena's assumed `default` declared audio and threads. Each
  now uses only what its image is for. A narrowed catalog (`DOLLY_BUILD_IMAGES`) also narrows
  amy's index: tmux's `amy install vi` failed until vi was in the set, which looked like an R1
  regression.
- Process: a `docs/*.md` edit cascades through `dolly-docs` to every image with Pi (11), and
  `npm run image` repins `dolly-docs` itself when it sees the edit: an edit during a build's
  preparation nearly rebuilt the Pi chain. Batch docs edits and make them between builds. An
  application holding a 1.4 GB package (pi-llm) builds at the edge of the 6 GB build slot:
  studio was killed once by the cap and built on the retry.
