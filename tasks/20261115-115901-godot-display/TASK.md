# godot-projects and godot-x11 fail in the display-less demos suite

- STATUS: CLOSED
- PRIORITY: 180
- TAGS: tests,godot,0.1.8

## State (2026-11-17)

Closed: see the closing section.

## Done when

The demos suite lists both as skipped for want of a display, and the GPU stage still runs them.

## Closed (2026-11-17)

Fixed on `ws/release` (`fe88a4b3a`): the demos runner's `display` map names
`godot-projects-browser.mjs` and `godot-x11-browser.mjs` with the other two Godot display tests,
so the suite skips them ("needs a GPU window on a hardware adapter, in Chrome and the installed
Firefox: run with --display") and `demos/run-browser-tests.mjs --display=:N`, the round's GPU
stage (`scripts/round.sh gpu`), runs them on the display.

Evidence: the runner over stand-ins of all 59 demo tests' names (`build/ws/fake-demos.sh` in the
branch's tree) listed both as skipped in the suite and ran both with `DISPLAY=:148` under the lock
in `--display`. The same display mode on 0.1.7's images (a worktree at `b09b1e243` with this
branch's test files) ran zero-ad's two display tests, "2 passed" (`build/ws/logs/display-zero-ad.log`).
`godot-x11-browser.mjs firefox` there, under the lock on `:148`, started the installed Firefox by the
launcher and passed its game's checks (the window drew 45 s after the command, 28.6 frames a
second, 1.91 times as much red as blue), then ran past its 20-minute deadline in the editor's
step at load 40 on 16 cores: 0.1.7's round measured 16 s and 55.0 frames a second for the same
steps and passed (`work/round1113/build/round-1117-evidence/gpu-godot-x11.log`). The round runs both
tests whole in its GPU stage.
