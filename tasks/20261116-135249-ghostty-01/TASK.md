# Remove the ghostty-x11 image; Ghostty's GTK application stays a package on x11-desktop

- STATUS: OPEN
- PRIORITY: 200
- TAGS: cleanup,x11,0.1.8

Owner (2026-11-16): "just remove the ghostty-x11 image since it kinda works on the X11 desktop
anyway."

## State (2026-11-17)

Merged into `integrate/0.1.8` (b6d8595e7, `remove/ghostty-x11`). On `ws/recipes`: the domain
catalog's closure, as the image builder selects it, has no `ghostty-x11` and lists the package
`ghostty-gtk` among its 169 packages, so the packaged `amy-index.txt` does
(`work/audit-1116-evidence/recipes/ws-recipes/domain-packages.mjs`). The test's policy no longer
names the page's own `amy-index.txt` (`tasks/20261116-143047-recipes-17`).

The branch's `demos/ghostty-gtk/test/ghostty-gtk-browser.mjs` passed on the released images of
`work/round1113` in Chromium (18.7 s; installed and started in 7.8 s) and Firefox (24.4 s)
(`work/audit-1116-evidence/recipes/ws-recipes/logs/ghostty-r1113.log`, run by
`logs/ghostty-on-round1113.mjs`).

Left for the 0.1.8 round: `ghostty-gtk` is built with `zig-llvm` on LLVM 22 (the Zig and LLVM chain,
a 9 GB slot), which this tree does not rebuild (a build here was stopped at `llvm22`); once the
round has rebuilt it, `node demos/ghostty-gtk/test/ghostty-gtk-browser.mjs chromium firefox` on
it, and its packaged `amy-index.txt` listing `ghostty-gtk`, close this. Rebuilds ghostty-gtk.

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
