# Left by the investigations: comments that still say COMPILEC, a field of the page's parser nothing reads

- STATUS: CLOSED
- PRIORITY: 110
- TAGS: core,cleanup,seed

Met by the investigations of 2026-10-14 while reading, checked by the
integrator, not acted on. None of it is a decision about the language.

Done when: each is corrected or removed in the round that rebuilds what
holds it, and the suites pass.

## Done (2026-10-14)

Every item is corrected or shown to need nothing: the three `COMPILEC`
comments say `RUN`, the parser's constant `kind` field and its eight
comparisons are gone, Emacs's comment over its mouse mode says what the
row is for, CMake's sources are staged under its own name (all in the
round); `runs`, the supervisor contract's comment, the tmux README, the
eighteen exports, one import and two unused names went before it, without
a rebuild.

In the round of 2026-10-14 (`integrate/round-1014`, evidence in
`work/rust/build/round-1014-evidence/`), which passed: every image built,
source tests 430/0, artifact tests 25/0, the core suite in both browsers in
419 s, the demo suites (26 passed; `rts` failed with its known early-input
stall and passed alone after), the five GPU checks.

## As filed (2026-10-14, `integrate/round-1013` `3c50a513`)

- `COMPILEC` has been `RUN` since 2026-10-01 (`5ec4783c`). Three comments
  still name it: `Dollyfile-system-build:83` ("so COMPILEC builds them") and
  `:106`, and `src/process/bootstrap.c:36`. The first two are in the root
  recipe and the third in the seed: a correction rebuilds every image, so it
  rides a catalog round
  ([SLOP and RUN](../20261013-144241-slop-and-run/investigation.md)).
- `src/dollyfile-view.mjs` collects every `RUN` row into `runs` (lines 179,
  282, 307). `git grep -w runs` finds no reader in the page, the scripts or
  the tests. Dollyfile Studio's image carries the file
  (`demos/studio/prepare-sources.sh:8` packs it into `studio.tar`), so
  taking the field out repins and rebuilds `dollyfile-studio`, one image.
- The reflection's figure "181 of 364 `FILE` rows without a body" is wrong
  (471 rows, 183 with a body, 288 without); corrected in
  [the investigation](../20261013-144241-dollyfile-words/investigation.md),
  nothing in the tree repeats it.
- `src/custom-dollyfile.mjs:42` refuses a recipe whose `kind` is not
  `"image"` ("Upload an IMAGE recipe, not a MODULE"), and six other places
  make the same comparison (`src/custom-image.mjs:8,18`,
  `src/session-store.mjs:38`, `host/build/service.mjs:72`,
  `scripts/image-definitions.mjs:20`, `demos/studio/build.mjs:13`). Since
  modules went on 2026-10-01 (`5ec4783c`) the parser's `kind` is the
  constant `"image"` (`src/dollyfile-view.mjs`): no check can fail
  ([the roles](../20261013-144241-roles/investigation.md)). But the field is
  not unread: `scripts/dollyfile-graph.mjs:33` writes it into the recipe
  records of every image's metadata, which the build plan and the page
  compare. Tried on 2026-10-14 and taken back: without the field the plan
  calls all 130 images stale ("recipe graph changed"). So it goes with a
  change of the metadata's format, in a catalog round, not alone.
- `demos/emacs/Dollyfile-emacs:69-73` turns `xterm-mouse-mode` on under the
  comment "Dolly's terminal reports the mouse." It does not: the display
  library has no line about the mouse
  ([the investigation](../20261013-154704-terminal-mouse/investigation.md)).
  The row also skips Emacs's XTVERSION probe, which is why it works. A
  correction rebuilds `emacs` and the image that opens into it.
- `demos/tmux/README.md` said a new pane starts "in the server's
  directory"; it is the session's, the directory of the client that created
  it ([who holds a terminal](../20261013-154704-terminal-holder/investigation.md)).
  It also said `man tmux` shows the page's source, which stopped being true
  when the package began to format its page (`eb50e952`; the tmux test
  asserts the formatted text). Both corrected on 2026-10-14; the README is
  no image's input (the plan builds nothing).

## 2026-10-14 02:30: two of them done

On `main` after the night's small rebuild (`dolly-docs`, `pi-agent`,
`pi-local`, `dollyfile-studio`):

- `runs` is out of `src/dollyfile-view.mjs`; a `RUN` row's words are still
  checked.
- The comment on `dolly_terminal_write_bytes` in
  `abi/dolly-supervisor-0.wat` says where the supervisor's words go since
  `2fcc6c62`: to descriptor 2 of the process that waits for the executable
  where that is a terminal. Agents in the Pi images read that file as
  documentation.

Left: the three `COMPILEC` comments (root recipe and seed) and `kind` (the
metadata's format), each for a catalog round.

## 2026-10-14 06:20: one more, met while timing unchanged image runs

- `demos/cmake/prepare-sources.sh:4,13` stages CMake's and libuv's sources
  as `dist/static/neovim/cmake.tar.gz` and `neovim/libuv.tar`, beside the
  Neovim demo's own archives; `demos/cmake/Dollyfile-cmake-build:21,76` pins
  them under that name. A path of their own repins `cmake-build`, which 82
  images are built on: with a round.

## 2026-10-14 06:25: a search for code nothing reaches

Searched on `main` `e72b7f8e`, nothing changed:

- Every file under `scripts/` and every `.mjs` under `src/` and `host/` is
  named by another tracked file. No page-side file imports a `node:` module
  or asks whether it runs in Node.
- The constants in `src/process-constants.mjs` and `host/*/abi.mjs` that no
  file names one by one are generated from the headers and the WATs
  (`scripts/generate-abi-constants.mjs`) and imported whole
  (`import * as`); each `abi.mjs` has an importer in its module.
- Eighteen names are exported and named by no other tracked file, each used
  inside its own file: `hostModuleNames` (`host/manifests.mjs:3`),
  `PACKAGES_ORIGIN` and `PACKAGE_LIMITS` (`host/packages/service.mjs:5-6`),
  `IMAGE_CACHE_MAX_BYTES` (`src/image-artifact.mjs:249`), `kernelModuleList`
  (`scripts/host-modules.mjs:38`), `menuRow` (`scripts/image-menu.mjs:29`),
  `domainOnlyApplications` (`scripts/package-github-pages.mjs:10`),
  `bootVersions` (`scripts/published-version.mjs:107`), `verifySite`
  (`scripts/site-release.mjs:75`), and nine of the fifteen commands of
  `scripts/dolly-abi.mjs`, which exports every command alike. The word
  `export` is off all eighteen (2026-10-14): the runtime builds to the same
  hash (`c470bb6e…`), the image inputs are the same, the plan builds
  nothing, source tests 430/0, artifact tests 25/0.
- The search reads names in `.mjs`, `.js` and `.html` files. It does not see
  a function that is exported, imported and never called.
- Imported names their own file never uses, in the 231 `.mjs` files of
  `src/`, `host/`, `scripts/` and `test/`: one, `mkdir` in
  `test/host-modules.test.mjs:3`. Removed (2026-10-14; that file's six tests
  and the source tests pass, 430/0).
- Top-level functions and constants neither exported nor used in their
  file, in the same 231 files: two. `scripts/list-images.mjs` made a recipe
  graph loader it never called (its import and one line), and
  `host/dso/ffi.mjs` declared `FFI_BAD_TYPEDEF`. Both removed (2026-10-14):
  the script prints the same 130 images, the same 31 for `pi-local` and the
  same 534 sources as before; the plan builds nothing; source tests 430/0;
  `test/dso-browser.mjs` passes in both browsers and
  `test/host-modules-browser.mjs` in Chromium.
- Macros (2026-10-14, 06:55): of the macros the 157 C files of `src/`,
  `host/` and `include/` define, one is named nowhere else, and it
  configures an included header (`GHOSTTY_STATIC`,
  `src/ghostty/display.c:7`). Of the 290 `DOLLY_*` macros in the contract's
  and the modules' headers, the 15 no other file names are include guards
  and helpers their own header uses. Nothing to remove.
- Leftovers by pattern (06:55): no `TODO`, `FIXME`, `XXX` or `HACK` in
  `src/`, `host/`, `include/`, `abi/`, `scripts/`, `toolchain/` or `test/`;
  no `#if 0`; no commented-out statement in the core's `.mjs` files.

