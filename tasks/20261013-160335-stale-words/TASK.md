# Left by the investigations: comments that still say COMPILEC, a field of the page's parser nothing reads

- STATUS: OPEN
- PRIORITY: 110
- TAGS: core,cleanup,seed

Met by the investigations of 2026-10-14 while reading, checked by the
integrator, not acted on. None of it is a decision about the language.

Done when: each is corrected or removed in the round that rebuilds what
holds it, and the suites pass.

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
