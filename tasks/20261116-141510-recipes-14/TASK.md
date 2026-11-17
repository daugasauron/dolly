# Recipe rows and files held twice: cc's make, INSTALL rows another row brings, zig and zig-llvm over the same paths; slopyard-build's unused html@0

- STATUS: OPEN
- PRIORITY: 80
- TAGS: audit,recipes,cleanup,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`): static checks of all 230 recipes (`work/audit-1116-evidence/recipes/static-checks.txt`)
and of every path two packages hold (`overlaps.txt`). None of these breaks an install; each is a
line or a file that does not earn its place, or a conflict amy does not name. The two that cost
measurably are their own tasks (`20261116-141504-recipes-05`: pi-llm's model and python's libffi).

## State (2026-11-17)

Fixed on `ws/recipes`, as Do says:

- `cc` installs `make` and drops its three rows of make's (0fbea6cd6); `system` drops its own
  row for make, which comes with cc, and `make`'s comment says cc installs it.
- The `INSTALL` rows another row of the recipe brings, where they state no need of the recipe's
  own (f66240630): `lean`'s lean-std (lean-meta), `rust-tools`' rust (cargo), `gtk-build`'s
  libffi, pcre2 and zlib (glib), `python-data`'s python, numpy, pandas and matplotlib (seaborn),
  and transfer beside pi-dolly in pi-agent, pi-local, pi-phone, rts-arena and dollyfile-studio,
  and pi-local's pi-dolly (pi-llm installs it now, `tasks/20261116-141510-recipes-10`), and
  gtk-build's xz, which tar brings since `tasks/20261116-141504-recipes-02` (0fbea6cd6). Kept,
  each with its reason in the recipe: meson's cc ("meson setup starts the C compiler"),
  python-data-build's python (it builds the wheels), classicube's and slopyard's transfer (the
  game's own download and upload), and the `libdolly-*` rows of the agents' images, whose comment
  now says they are the host modules' client libraries for Pi's `cc` (0fbea6cd6).
- `slopyard-build` no longer declares `html@0`; `demos/zig/README.md` says `zig-llvm` replaces the
  core's `zig` (both hold `/usr/bin/zig` and `/usr/lib/zig`).
- Two more of the same kind: `fingers-build` keeps SDL2's licence with a `FILE` row after its
  `USE` (as python keeps its libraries'), not a `COPY` (63e8cba16; fingers-build and fingers
  rebuilt, `demos/fingers/test/fingers-browser.mjs` passed in Chromium and Firefox,
  `logs/a2-fingers.log`); `posix` no longer holds `/usr/share/man/cat1/printf.1`, sbase's
  page over the core's for the core's `printf`, which posix does not ship (0fbea6cd6). xonotic's licence `COPY`s stay: one per library linked into the
  client it copies, from that library's package.
- `pi-llm` holds the descriptions of the models it does not install, as the same files as their
  packages', so that `/local` lists them: `demos/local-llm/README.md` says so, and
  `demos/local-llm/test/models.test.mjs` checks that every model is either installed by pi-llm or
  described by one of its `FILE` rows.

Regenerated on this tree's catalog (`work/audit-1116-evidence/recipes/ws-recipes/logs/`,
`overlaps-2.txt` and `static-checks-2.txt`, by the audit's `overlaps.mjs` and `static-checks.mjs`):
no path two packages hold besides the documented replacements (zig and zig-llvm, toybox over
posix, tar over core), the shared agent code (classicube-agent, seven-kingdoms), the Python data
packages' directories, and two whose rebuilt packages are the round's: photocraft's libX11.a and
two more beside x11-libs (`tasks/20261116-141504-recipes-04`), and pi-llm's copy of the model
beside qwen3.5-2b and the settings it now replaces on purpose (`tasks/20261116-141504-recipes-05`,
`-10`), with the descriptions of the models it does not install, which the local-llm README
documents. No repeated `COPY` rows; the redundant `INSTALL` rows left are the kept ones above.
In a fresh `default` session `amy install cc` installs make first, and cc's files hold no
`/usr/bin/make` (case `make-and-cc`, Chromium and Firefox, `logs/phase2/cases3-*.jsonl`); "amy cc"
passed in both (`logs/phase2/b-amy.log`).

Left for the 0.1.8 round: photocraft and pi-llm rebuilt on the Rust chain; the overlaps then
regenerated show neither of their two lines, which closes this.

Rebuilds: cc and make change every image that installs cc (the catalog, the 0.1.8 round); the
others rebuild their own recipes and what installs them.

## Found

- `make` twice: `Dollyfile-cc:19,27-28` exports the `make` of `system-build` with its manual and
  licence, and `Dollyfile-make` exports the same three. The binaries are byte for byte one
  (364,096 bytes, `112a84dff4e7e45d…` in both snapshots). `cc` can `INSTALL Dollyfile-make` and
  drop its three rows.
- `INSTALL` rows another `INSTALL` row of the same recipe already brings (the engine skips them):
  `demos/tools/Dollyfile-meson` (`cc`, which `python` brings), `demos/lean/Dollyfile-lean`
  (`lean-std`, via `lean-meta`), `demos/rust/Dollyfile-rust-tools` (`rust`, via `cargo`),
  `demos/gtk/Dollyfile-gtk-build` (`libffi`, `pcre2`, `zlib`, via `glib`),
  `demos/python/Dollyfile-python-data` (`python`, `numpy`, `pandas`, `matplotlib`, via `seaborn`),
  `demos/python/Dollyfile-python-data-build` (`python`, via `meson`), and `transfer` and
  `libdolly-download` beside `pi-dolly` in classicube, pi-agent, pi-local, pi-phone, rts-arena,
  slopyard and dollyfile-studio. Where a row states a need of the recipe's own (meson runs `cc`)
  it can stay; the rest are noise.
- `zig` and `zig-llvm` hold the same 1,250 paths (`/usr/bin/zig`, `/usr/lib/zig/...`): installing
  both, the second replaces the first's files while `amy installed` lists both. Neither README says
  they exclude each other.
- The same `COPY` of `sdl2`'s `/usr/share/licenses/SDL2` in `fingers-build`, `xonotic` and
  `zero-ad-deps`; `zero-ad-deps` still copies SDL2's headers and `libSDL2.a` instead of installing
  the package (F12 of `tasks/20261102-133232-recipes-apps`, open).

- A host declaration nothing records: `demos/slopyard/Dollyfile-slopyard-build:9` declares
  `html@0`, which no retained module of the image records (`host-records.txt`: every retained Wasm
  module's `dolly.host` records against each image's `REQUIRES HOST`) and no program built there
  uses; the toolchain took the application's list when it was made (35393ee3c). The other declared
  modules that no retained module records are an opened image's (display, input, snapshot), an
  installed package's, a library's for the programs that link it (sdl2, raylib, llama-cpp), or a
  toolchain's for what is built in it (gamedev-sdk's touch@0, zero-ad-deps' audio@0, rust-tools'
  sockets@0; these three not traced to a program).

Not findings: `toybox` over `posix`'s `grep` and `sed`, and `tar` over `core`'s `tar`, which their
READMEs say they replace; `classicube-agent` and `seven-kingdoms` both hold five files of
`/usr/src/dolly/rts/` (the game agents' shared code), identical.

## Do

`cc` installs `make`; drop the redundant `INSTALL` rows that state no need of their own recipe and
slopyard-build's `html@0`; say in `demos/zig/README.md` that `zig-llvm` replaces `zig`.

## Done when

`overlaps.txt` regenerated shows no path that two packages hold besides the documented
replacements and the shared agent code, and `static-checks.txt` no redundant row that is kept
without a reason.
