# Fingers

A program for a touchscreen: one finger moves a figure, two fingers zoom it
about their midpoint and move it, and each finger is marked with its id while
it is down. [`fingers.c`](fingers.c) is an ordinary SDL2 program that reads
SDL's finger events; Dolly's SDL2 makes them of the records of `touch@0`
([input](../../docs/input.md#touch)), and SDL's own mouse of the first finger.

## Images

- `fingers`: fingers on a touchscreen: one moves a figure, two zoom and move it, each marked with its id.
- `fingers-build`: `fingers`, built against the `sdl2` package.

Test: `npm run test:demos -- fingers` ([`test/`](test/)): two fingers by
Chromium's touch events (CDP) and by touch PointerEvents in Firefox.
