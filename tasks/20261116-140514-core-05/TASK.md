# A core test names 73 demo packages: every demo package added edits test/amy-browser.mjs

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: audit,core,test,amy,0.1.8

From the core audit of 2026-11-16 (`work/audit-1116`, source of `b09b1e243`).

## Closed (2026-11-17)

On `ws/modules`:
- `test/amy-browser.mjs` covers the core's packages alone (`corePackages`: a recipe at the
  top level); `grep -c 'demos/' test/amy-browser.mjs` prints 0. Its `elsewhere` table holds
  the core's entries (20 with modules-r3's `git-http`); its main session uses `zig` (which installs `cc`) where it used the
  demo's `python`, and `ps` where it used `curl` (which default no longer holds).
- `test/cases/amy-programs.json` (cc, zlib) and `amy-tools.json` (ninja, make,
  session-recover, gzip, zig, mandoc, dolly-docs) install only core packages. The 54 demo
  packages' sessions moved, steps unchanged, to their demos: `demos/DEMO/test/amy-cases.json`
  for cmake, codex, emacs, javascript, local-llm, mojo, neovim, pi, rust, sdl2, slopyard, tmux,
  tools (22, `demos/tools/test/` is new), x11, xonotic and zero-ad, each run by its
  `demos/DEMO/test/amy-browser.mjs` (`amyCases()` of `test/amy-sessions.mjs`, which also holds
  the runner the core test uses; slopyard's keeps raylib's key and touch steps, tools' the
  typed editors).
- `demos/packages.test.mjs`, a source test the demos own, fails for a demo package that no
  test of its demo installs or names and no recipe builds with (checked once with a
  `Dollyfile-unusedprobe` in `demos/tools/`: it failed naming `tools: unusedprobe`, removed).
  Its first run named local-llm's two models that only `DOLLY_LLM_SECOND` exercises, which the
  demo's test now names.
- The pi demo's guidance check left the core's `test/dollyfile-graph.test.mjs` for
  `demos/pi/test/recipes.test.mjs`.

Evidence: `test/amy-browser.mjs`'s `amy`, `amy another directory`, `amy programs` and `amy
tools` pass in Chromium and Firefox on the rebuilt core catalog; its check of unused core
packages failed once in this tree, for `curl`, which default no longer installs, until its
`elsewhere` row named where it is installed (so it still fails for an unused core package);
`npm run test:source` passes with `demos/packages.test.mjs`. The demos' own
`amy-browser.mjs` run with their images, in the 0.1.8 round's `npm run test:demos`. Tests
only: no image rebuilds.

## Found

AGENTS.md: "The core (runtime, host modules and minimal userspace) lives at the top level and
never depends on `demos/` ... Each demo owns its recipes, sources, staging hook, tests and docs in
`demos/DEMO/`." The core's code (`kernel/`, `process/`, `page/`, `host/`, `scripts/`) names no
demo but through generic hooks (`demos/*/prepare-sources.sh`, the recipe scan, the test globs),
and the compiler's pin (grep for `demos/` and for each demo's name, outside `config/`).

The exception is a core test. `test/amy-browser.mjs:14` takes every package of the catalog,
demos' included, and `:313-315` fails unless each is installed by one of its cases or named in
`elsewhere` (`:274-311`), a table of 94 packages of which 73 point into a demo (`llvm:
"demos/llvm"`, `"truck-town": "demos/godot/test/godot-gpu-browser.mjs"`, `photocraft: "demos/
photocraft: photocraft-photos installs it"`, ...). So a demo that adds a package must edit the
core's test, and the core test knows each demo's packages and test files: 44 of the file's 162
commits added a `demos/` line to it, the newest `f952c275b` (2026-11-14, Voxel Flyover).

Added by the ports audit (same night): the core's case files are where 52 distinct demo packages are
installed and used, not only named. `test/cases/amy-programs.json` installs 21 (box3d, cmake,
codex, freetype, icu, janis, libevent, libogg, libpng, libterminfo, libuv, libvorbis, openal,
pkgconf, quickjs, raylib, rust, sdl2, sdl2-image, sdl2-mixer, sdl2-ttf) and
`test/cases/amy-tools.json` 33 (base64, bc, bzip2, cbindgen, dte, emacs, fd, flex, janis,
janis-install, jq, llama, lua, lz4, nvim, pi-dolly, pigz, protox, quickjs, ripgrep, sbase, sqlite,
tar, toybox, tree, unzip, vi, wabt, xxd, xz, yacc, zip, zstd), so `npm run test:browser` needs
those demos' images built. Two demos have no browser test of their own for it: `demos/tools` (25
recipes) is tested only by these core cases, and `demos/gtk` (pcre2, glib, gtk-build) only
through `ghostty-gtk`. One core source test reads a demo's files too:
`test/dollyfile-graph.test.mjs:180` checks that `demos/pi/SYSTEM.md` and
`demos/pi/skills/dolly/SKILL.md` suggest only published packages, a check of the pi demo.

## Do

The core test covers the packages whose recipes are the core's (top-level `Dollyfile-*`: their
`dollyfile` in the catalog does not start with `demos/`). A demo's packages are its own: each
demo's tests install and use them, and a check that every package of a demo is used reads that
demo's directory (its README's package list, which `scripts/image-menu.mjs` already reads), not a
table in `test/`.

## Done when

`grep -c 'demos/' test/amy-browser.mjs` is 0, the core test still fails for an unused core
package, and an unused demo package fails a check its demo owns. The case files install only
core packages; each demo package's steps are in its demo's `test/` (a `demos/tools/test/` for the
tools).
