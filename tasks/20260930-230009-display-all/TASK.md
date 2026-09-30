# Give every image except the root builder the display and a shell

- STATUS: OPEN
- PRIORITY: 310
- TAGS: images,display,core

Owner request (2026-10-01): every image can be opened; only the root builder,
which exists before the display library, cannot, and its "open" is grayed out
on the start page (`57be3b8`).

Today 19 build images have no `display@0` and no open route (for example
`system-build`, `ghostty-build`, `system-tools`, `rust-sdk` and the images built
from them).

## Change (written, stashed as "display-for-all recipes" until the Codex fix)

- `modules/display.dm`: `REQUIRES HOST display@0`, the display library, font
  and licenses copied from `ghostty-build`, and `EXPORTS ENV DISPLAY`.
- `system-tools` and `rust-sdk` use it, so every image built on them inherits
  it; `system` drops its own copy of those rows.
- `ghostty-build` requires the display and runs the library it just built.
- Every image except `system-build` enters `/bin/foreground -i /bin/slop`.
- Recipe pins updated; the whole catalog must be rebuilt.

## Done when

- The catalog is rebuilt and released; the start page shows "open" on every
  row except `system-build`; opening each former build-only image gives a
  working shell in Chrome and Firefox; core, artifact and demo tests pass.
