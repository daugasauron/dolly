# Remove the ghostty-x11 image; Ghostty's GTK application stays a package on x11-desktop

- STATUS: OPEN
- PRIORITY: 200
- TAGS: cleanup,x11,0.1.8

Owner (2026-11-16): "just remove the ghostty-x11 image since it kinda works on the X11 desktop
anyway."

## State (2026-11-16)

Done on branch `remove/ghostty-x11` (worktree `work/ghostty-rm`), commit `30a0c0dd1` on `main`
`b09b1e243`; not merged. Left: the merge, and the round's check below.

Removed:
- `demos/ghostty-gtk/Dollyfile-ghostty-x11` (the application: Xsdl, Ghostty with Slop, amy, nena).
- Its line in `config/domain-pages-images.txt`, its row and paragraph in
  `demos/ghostty-gtk/README.md`, and its test `demos/ghostty-gtk/test/ghostty-x11-browser.mjs`.

Kept, and why:
- `ghostty-gtk` (the package): `amy install ghostty-gtk` on `x11-desktop` is the X11 workbench of
  the demos page (`sites/slopshare.dev/agents/index.html:117-127`). The domain catalog reached it
  only through `ghostty-x11`: without `ghostty-x11` its closure went from 224 to 222 images,
  `ghostty-gtk` with it (`work/audit-1116-evidence/ghostty/closure-before.txt`). The catalog lists
  `ghostty-gtk` in its place: 223 after, nothing else leaves (`closure-after.txt`).
- `mesa-build`: `demos/godot/Dollyfile-godot:20` and `Dollyfile-godot-editor:20` build `FROM` it.
- The patches, `prepare-*.sh` and source pins: `ghostty-gtk` and `mesa-build` use them.
- Tasks: none open tracks only `ghostty-x11`. `20261113-101500-ghostty-gtk-leftovers` is about
  `ghostty &` on `x11-desktop` and stays open; closed tasks are history.

Changed:
- The demo's test is `demos/ghostty-gtk/test/ghostty-gtk-browser.mjs` on `x11-desktop`: amy
  installs `ghostty-gtk` from xterm's shell, twm places the window at a click, and the old checks
  run in Ghostty's terminal (a typed command, 20 cells of one background colour, an erased row
  redrawn while the first row stays as drawn), then the X server ends and the shell reads the
  file. Without it the package had no test, while `test/amy-browser.mjs:293` says
  `demos/ghostty-gtk` uses it.
- The package's man page (`FILE /usr/share/man/cat1/ghostty.1`) named `ghostty-x11` as the X
  server to use; it names `x11-desktop`. This changes the recipe, so the next round rebuilds
  `ghostty-gtk` (828.9 s in round 1117, `round-1117-evidence/catalog-1.log`); the 0.1.8 version
  bump of the `/v0.1.7/` references rebuilds it in any case.

What it saves: one application of the catalog: its 87,405,960-byte snapshot and 22.2 s of
packaging in round 1117 (`catalog-1.log`), and one demo test.

## Evidence (2026-11-16, `work/audit-1116-evidence/ghostty/`)

- `ghostty-gtk-browser.mjs`, run against `work/round1113`'s `dist/` (the released 0.1.7 images of
  the same recipes, through `run-on-round1113.mjs`, the test with that tree's `browser.mjs`):
  passed three times in Chromium (6.8 s, 7.3 s, 6.6 s) and twice in Firefox (8.8 s, 7.4 s);
  `amy install ghostty-gtk` and Ghostty's start took 2.1 to 2.6 s, its prompt 0.8 to 1.4 s more
  (`chromium-1.log`, `firefox-chromium-2.log`, `final-3.log`; screenshots in `shots/`).
- `node --test test/dollyfile-graph.test.mjs`: 8 of 8 passed (`dollyfile-graph.log`).
- `node scripts/lint-dollyfiles.mjs`: 229 recipes linted, no finding (`lint.log`).
- `npm run test:source` in the source-only worktree: 446 of 451 passed; the same five fail on
  unchanged `main` there (`source.log`, `source-main.log`): they import `dist/dolly-build-id.mjs`,
  `dist/dolly-process-abi.mjs` or `dist/dolly-process-0.wasm`, which only a runtime build makes.
- `git grep ghostty-x11` outside `tasks/`: only the README's link to the port's task
  (`tasks/20261014-232500-ghostty-x11`).

## Done when

The branch is merged; the round's catalog has no `ghostty-x11` and its `amy-index.txt` lists
`ghostty-gtk`; `node demos/ghostty-gtk/test/ghostty-gtk-browser.mjs chromium firefox` passes on
the rebuilt `ghostty-gtk`.
