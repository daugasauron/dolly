# More cursors for a program that holds the display

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: host,display,wine

Owner (2026-10-10), about the Wine desktop: "I want cursor stuff to work. For
example when I have the mouse pointer on the edge of a window it should
indicate that I can resize it."

`display@0` let a program choose among five of the page's cursors (text,
default, crosshair, pointer, hidden). A window system needs more, and they
exist only as the page's own: the list gains the four resize arrows, move,
wait, progress, not-allowed and help (`host/display/display.h`, values 5 to
13). It stays a closed list of numbers: a program supplies no image, and the
kernel refuses any other value.

## Consequences

- `display.h` changes, so `display@0`'s digest does and every executable
  that draws is rebuilt: with the microphone already on `main`, the next
  release rebuilds every image anyway.
- Wine's driver (`demos/wine/dlls/winedolly.drv`) maps the system cursors
  onto the list; a program's own cursor image still shows as the default
  arrow. SDL's system cursors could be mapped the same way.

## Evidence (2026-10-10, `core/display-cursors` in `work/rust`)

- Runtime `50d4396e…`, image inputs `4acb6663…`; `default`, `system`,
  `system-build`, `audio-sdk`, `gpu-sdk` and `dolly-docs` rebuilt on it.
- `node test/display-cursor-browser.mjs` passes in Chromium and Firefox: a
  program holding the display sets each of the 14 values in turn and the
  canvas shows `text`, `default`, `crosshair`, `pointer`, `none`,
  `ns-resize`, `ew-resize`, `nwse-resize`, `nesw-resize`, `move`, `wait`,
  `progress`, `not-allowed`, `help`; value 14 is refused with `EINVAL`.
- The display, indicators, microphone and audio browser tests pass in both
  browsers on that seed; `node --test 'test/*.test.mjs'`: 343 pass.

Not done: Wine's mapping and its test (the Wine worktree is on the released
seed until it takes `main`); the rest of the catalog on this seed.

## Closed (2026-10-11)

The catalog was rebuilt on this seed in the v0.1.2 round (`tasks/20261011-011000-v012-draft`):
every image, source tests 424/0, artifact checks 25/0, the core browser suite in Chrome and
Firefox, every demo test and five GPU tests.
