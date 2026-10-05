# A touch input module for phones, with a demo image that proves it

- STATUS: OPEN
- PRIORITY: 250
- TAGS: core,host-modules,input,mobile,demo

Owner request (2026-10-06): "a smartphone-input module so it's easy to write
programs for phones (respond to touch, drag etc), and a simple image with
some demo to prove/test that it works nicely."

## Today (main `0d1d6e42`)

- Input belongs to `display@0` (`host/display/input.mjs`): keys, wheel and one
  pointer stream from Pointer Events. A finger arrives as that single pointer:
  there are no contact ids, so no second finger, no pinch, and a drag cannot
  be told from a mouse drag. `terminal.html` already sets `touch-action: none`
  on the canvas and a device-width viewport.
- Nothing has been measured on a phone: whether mobile browsers boot Dolly at
  all (wasm64, cross-origin isolation, memory), how the on-screen keyboard,
  rotation and safe areas behave.

## Work

1. Measure first: which phone browsers boot `default` and a graphics image
   (real devices where possible, emulation otherwise), and what breaks.
2. A host module of its own (`touch@0`, per `host/README.md`): contact
   records with an id, phase (down, move, up, cancel), position in surface
   pixels and, where the browser reports them, pressure and radius; bounded
   ring, its own ABI digest, a row in `docs/browser-boundary.md`. The page
   only copies contact data; it grants nothing else.
3. Gestures (tap, long press, drag, pinch, two-finger rotate) are a small C
   library in Wasm over those records, not trusted page code.
4. What a phone program also needs, decided per item and recorded: surface
   size, scale and rotation (display's surface), safe-area insets, and
   showing or hiding the on-screen keyboard for text.
5. An `APPLICATION` (working name `touch-demo`) that declares exactly what it
   uses and proves the module: draw with several fingers, drag and fling
   objects, pinch to zoom, with the contact state visible on screen.

Coordinate with `20261002-072000-input-host-module` (keyboard and mouse leave
`display@0` in the same contract round) so the two modules share record
conventions.

## Done when

- The demo passes a browser test with emulated multi-touch in Chrome and
  Firefox (Playwright touch contexts) and is checked by hand on at least one
  real phone, with the result recorded here.
- A program that declares only `display@0` and `touch@0` receives contacts;
  one that does not declare `touch@0` is refused by the loader.
