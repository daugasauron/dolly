# Recipe rows and files held twice: cc's make, INSTALL rows another row brings, zig and zig-llvm over the same paths; slopyard-build's unused html@0

- STATUS: OPEN
- PRIORITY: 80
- TAGS: audit,recipes,cleanup,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`): static checks of all 230 recipes (`work/audit-1116-evidence/recipes/static-checks.txt`)
and of every path two packages hold (`overlaps.txt`). None of these breaks an install; each is a
line or a file that does not earn its place, or a conflict amy does not name. The two that cost
measurably are their own tasks (`20261116-141504-recipes-05`: pi-llm's model and python's libffi).

## State (2026-11-16)

Listed; nothing changed. Each change rebuilds the recipe and what depends on it: batch them into a
round that rebuilds those images anyway.

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
