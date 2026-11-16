# The same libraries are built twice from different pins, and the generic libpng, freetype and pkgconf packages are staged from 0 A.D.'s 1.4 GB build sources

- STATUS: OPEN
- PRIORITY: 95
- TAGS: audit,ports,demo,packages,x11,0ad,cleanup,0.1.8

## State (2026-11-16 night audit)

Found by reading the recipes and staging scripts; nothing built or changed.

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
