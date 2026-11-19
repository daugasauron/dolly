# The same libraries are built twice from different pins, and the generic libpng, freetype and pkgconf packages are staged from 0 A.D.'s 1.4 GB build sources

- STATUS: CLOSED
- PRIORITY: 95
- TAGS: audit,ports,demo,packages,x11,0ad,cleanup,0.1.8

## Closed (2026-11-19)

- `git grep -n 'libpng-1.6\|freetype-.*2-14\|pixman-0.46' -- 'demos/*/Dollyfile-*'` names only
  `demos/x11/Dollyfile-pixman`; libpng and FreeType are each one `SOURCE` of their own recipe
  (`demos/tools/Dollyfile-libpng`, `Dollyfile-freetype`).
- On `fix/rc-recipes` (from `integrate/0.1.8` at 8d666a4e4), `DOLLY_BUILD_IMAGES=gtk-build,python-data
  bash scripts/prepare-image-sources.sh` staged their closures (Mesa, X11, GTK, Python and the data
  packages) with status 0, created no `build/generated/zero-ad-build-*` (the directory before and
  after: `build/rc-recipes-evidence/stage1.log` in `work/rc-recipes`) and changed no source pin.
- The demos' tests on the 0.1.8 round's images (unit `dolly-round-018k`, `build/round/suites.log`):
  gtk's amy cases, ghostty-gtk (in place of the removed ghostty-x11), python-data, sdl2, xonotic and
  every 0 A.D. test passed in Chromium and Firefox. wine passed in Firefox there and stopped in
  Chromium at GIMP's start ("the display never showed what was awaited"); run again on the same
  images on `fix/rc-recipes`, it passed in Chromium (144.7 s, GIMP's toolbox 1677 ms after the
  Start menu's key; `wine-chromium.log`).

## State (2026-11-17)

Done on `ws/ports`: one recipe and one pin each. `libpng`, `freetype` and `pkgconf` moved to
`demos/tools/` (every recipe that installs or uses them follows), staged from their own pins
(`DOLLY_LIBPNG_*` 1.6.59 and `DOLLY_FREETYPE_*` 2.14.3, which were GTK's, and a new
`DOLLY_PKGCONF_*` 2.5.1, upstream's release archives, in `demos/tools/source-pins.sh`) by
`demos/tools/prepare-sources.sh` through `fetch-pinned-source.sh` (which now reads any tar
compression); `build-sources.tsv` no longer lists them, and `demos/zero-ad/prepare-sources.sh`
runs `prepare-build-sources.sh` only for 0 A.D.'s own images. `gtk-build` installs the
`libpng`, `freetype` and `pixman` (X11's) packages instead of building its own copies, and stages
neither their archives nor their licences. The libraries' licence rows are one each, with their
pins.

Built in this tree from those sources: `libpng`, `freetype` and `pkgconf` (pkgconf's snapshot
from its release archive, with the same pin as before), and over them `glib`, X11's `pixman`,
`imgui` (whose test passes in Chromium and Firefox, `both-5`), and `gtk-build` over the three
packages: every library builds against them, and its check, a GTK program linked by
`pkg-config --libs gtk4`, runs (snapshot 337,110,496 bytes against the release's 336,768,971);
`sdl2-ttf`, `wine-build` and `wine` (the wine test passes in Chromium, `both-17`), and
`xonotic-build` and `xonotic` over `freetype` and `libpng` (the xonotic test passes in Chromium,
`both-15`). The round confirms X11's three, the Mesa
chain and 0 A.D.'s, and `python-data-build`.

Images the change rebuilds: `libpng` (1.6.58 becomes GTK's 1.6.59), `freetype` (the release
archive in place of a Git tree of the same tag) and `pkgconf` (the same pin), and what installs or
uses them, through the recipe rows that name their new paths: `glib`, X11's `pixman`,
`libxkbfile`, `xkbcomp` and `xorg-server`, `gtk-build` and the Mesa chain after it (Ghostty's GTK
app, Godot), `sdl2-ttf`, `python-data-build`, `wine-build`, `xonotic-build`, `xonotic`,
`spidermonkey` and `zero-ad-deps` (0 A.D.).

## What

Three libraries that are packages are built again inside `demos/gtk/Dollyfile-gtk-build`, from
other pins:

| Library | Package | Inside `gtk-build` |
| --- | --- | --- |
| pixman | `demos/x11/Dollyfile-pixman`: 0.46.4, `DOLLY_PIXMAN_*`, archive `d09c44eb…` | `:63,137-141`: the same archive (staged a second time, as `dist/static/gtk/pixman-0.46.4.tar.gz`) and the same Meson options |
| libpng | `demos/zero-ad/Dollyfile-libpng`: 1.6.58, from Emscripten's ports mirror (`demos/zero-ad/build-sources.tsv:1`, `storage.googleapis.com/webassembly/emscripten-ports/`) | `:60,130-131`: 1.6.59 from `DOLLY_LIBPNG_*` (`config/source-pins.sh:468-470`) |
| FreeType | `demos/zero-ad/Dollyfile-freetype`: 2.14.3 from a GitHub tag archive (`build-sources.tsv:2`), with PNG | `:53,87-89`: 2.14.3 from `DOLLY_FREETYPE_*` (`:453-455`), without PNG |

`gtk-build` already installs packages of other demos (`zero-ad`'s `pkgconf`, `python`'s
`libffi`, `tools`' `meson`, `xz`, `tar`, `binaryen`; `:19-28`), not these. Round 1117 built the
three packages in 25.4 s (`libpng`), 23.5 s (`freetype`) and 52.8 s (`pixman`); `gtk-build`
took 607.2 s with its copies inside (`work/audit-1116-evidence/ports/packaged.tsv`).

The `libpng`, `freetype` and `pkgconf` packages are generic: other demos install them
(`freetype`: python, sdl2, wine, xonotic; `pkgconf`: gtk, python, x11; `libpng`: through
freetype, and xonotic copies files of it; `shared-packages.tsv`). Their sources are cut from
0 A.D.'s build sources:
`demos/zero-ad/prepare-sources.sh:12-16` runs `prepare-build-sources.sh` when any of them is
staged, and that script downloads every archive of `build-sources.tsv` (ICU, Boost, fmt,
libxml2, enet, libsodium, ...) and 0 A.D.'s source release and extracts them
(`work/round1113/build/generated/zero-ad-build-*`: 1.4 GB), keyed on the whole
`config/source-pins.sh` (`tasks/20261116-141148-ports-05`). So a checkout that stages GTK, X11,
SDL2's fonts, Wine, Xonotic or Python's data packages prepares 0 A.D.'s sources first.

`docs/dollyfile.md:306-311`: "A package is the unit of reuse ... Software is a package when a
session would install it ... or more than one image uses it." AGENTS.md: "Each demo owns its
recipes, sources, staging hook, tests and docs".

## Smallest fix

One recipe and one pin for each: `pixman`, `libpng` and `freetype` packages built from
`DOLLY_PIXMAN_*`, `DOLLY_LIBPNG_*` and `DOLLY_FREETYPE_*` (upstream's release archives), with
`pkgconf` from a pin of its own, in `demos/tools/` with their staging; `gtk-build` installs them
in place of its own rows; `build-sources.tsv` drops `libpng`, `freetype` and `pkgconf`, so
`prepare-build-sources.sh` runs only for 0 A.D.'s own images.

## Done when

`git grep -n 'libpng-1.6\|freetype-.*2-14\|pixman-0.46' -- 'demos/*/Dollyfile-*'` names one
recipe each; staging `python-data` or `gtk-build` in a fresh checkout creates no
`build/generated/zero-ad-build-*`; the gtk, ghostty-x11, python-data, sdl2, wine, xonotic and
zero-ad demo tests pass.
