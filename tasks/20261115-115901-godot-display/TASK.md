# godot-projects and godot-x11 fail in the display-less demos suite

- STATUS: OPEN
- PRIORITY: 180
- TAGS: tests,godot,0.1.8

## State (2026-11-16, the audit)

Not started. The `needs` map of `demos/run-browser-tests.mjs:21-30` still names
`godot-flyover-browser.mjs` and `godot-gpu-browser.mjs` and neither of these two. The round's GPU
stage that runs them with a display is `tasks/20261116-140017-repo-01`'s.

The round's demos suite (`demos/run-browser-tests.mjs`, no `DISPLAY`) ran
`demos/godot/test/godot-projects-browser.mjs` and `godot-x11-browser.mjs`, whose Chrome cannot
start there: "Missing X server or $DISPLAY" (0.1.6's round on 2026-11-14 and 0.1.7's on
2026-11-15, `build/round-1117-evidence/demos.log`). The GPU stage runs both with a display, and
both pass there. The suite skips `godot-flyover-browser.mjs` and `godot-gpu-browser.mjs` as
needing a display; these two should say so the same way, so a round's demos suite reports no
failure that is not one.

## Done when

The demos suite lists both as skipped for want of a display, and the GPU stage still runs them.
