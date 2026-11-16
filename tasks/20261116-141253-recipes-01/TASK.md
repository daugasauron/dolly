# raylib's header includes dolly/display.h and dolly/input.h, which amy install raylib does not bring

- STATUS: OPEN
- PRIORITY: 260
- TAGS: audit,recipes,amy,0.1.8

From the recipes audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`): every package `amy` offers installed alone into a fresh `default` session.

## State (2026-11-17)

Fixed in source on `fix/amy` (`work/fix-amy`, commit `183b064ef`): `demos/slopyard/Dollyfile-raylib`
INSTALLs libdolly-display and libdolly-input beside libdolly-touch, pins refreshed (raylib,
gamedev-sdk, slopyard-build, slopyard-game, slopyard rebuild). By the audit's method on round1113's
dist (`amy install raylib libdolly-display libdolly-input cc`, then amy-programs.json's raylib
program): compiles, links and exits 0 in Chromium and Firefox
(`work/audit-1116-evidence/recipes/fix-amy/byhand-*.jsonl`, case `raylib-fixed`). Waits for the
round to rebuild raylib; `test/amy-browser.mjs`'s raylib session (raylib alone, then cc) then
confirms it; it fails on today's image in both browsers.

## Found

`/usr/include/dolly/raylib.h`, which the `raylib` package exports, starts with
`#include <dolly/display.h>` and `#include <dolly/input.h>`. `demos/slopyard/Dollyfile-raylib` builds
`FROM Dollyfile-system`, whose base holds those headers, and installs only
`Dollyfile-libdolly-touch` (line 15). A session that installs `raylib` gets neither header:

```
$ amy install raylib && amy install cc
$ cc -O0 /tmp/amy-raylib.c -ldolly-raylib -lraylib -o /tmp/amy-raylib   # amy-programs.json's raylib program
In file included from /tmp/amy-raylib.c:1:
/usr/include/dolly/raylib.h:4:10: fatal error: 'dolly/display.h' file not found
```

With `amy install libdolly-display libdolly-input` added by hand the same program links and runs
(raylib 6.0, `PLATFORM: DOLLY`, exit 0). The release's test passed only because
`test/cases/amy-programs.json` installs `sdl2`, which installs both libraries, earlier in the same
session (`tasks/20261116-141504-recipes-03`). This is the owner's "amy install doesn't work, missing dependencies":
the package's recipe declares `REQUIRES HEADER display` and `input` for its own build, and its record
names neither for whoever installs it. Docs: "A package holds its own files and names the packages
its recipe installs" (`docs/dollyfile.md`, INSTALL).

Evidence: `work/audit-1116-evidence/recipes/run-b.jsonl` (case `raylib`) and `debug2.jsonl` (case
`raylib-fixed`); drivers in `work/audit-1116-evidence/recipes/scripts/`.

## Do

In `demos/slopyard/Dollyfile-raylib`, beside line 15: `INSTALL` `Dollyfile-libdolly-display` and
`Dollyfile-libdolly-input` (the headers `dolly/raylib.h` includes), as `Dollyfile-sdl2` installs them.

## Done when

In a fresh `default` session, `amy install raylib`, then `amy install cc`, and amy-programs.json's
raylib program compiles, links and exits 0, with no other package installed.
