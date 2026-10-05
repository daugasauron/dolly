# A microphone capture module

- STATUS: OPEN
- PRIORITY: 50
- TAGS: host-modules,audio,input,boundary

Owner request (2026-10-06, low priority): an "input voice" module that
captures the microphone through the browser.

## Today (main `0d1d6e42`)

- `audio@0` is playback only. `AGENTS.md` (hard constraints) and
  `docs/audio.md` both state that the sound interface grants no audio capture.
  A capture module is new browser authority: the owner's request is the
  decision to add it, and the hard constraint must be reworded with it.

## Work

- A host module of its own (working name `microphone@0`), separate from
  `audio@0` so playback never implies capture: mono PCM frames at a declared
  rate into a bounded ring in Wasm; open, read and close; its own digest and
  boundary row.
- Authority stays with the user and the page: the browser's own microphone
  prompt per origin, capture only while a program of an image that declares
  the module holds it open, and a trusted on-page indicator while capturing
  (as the GPU indicator: the guest cannot draw or hide it). Denied or absent
  devices fail explicitly.
- A small demo or test program (level meter, or record and play back through
  `audio@0`).

## Done when

- Browser tests with a fake capture device (Chrome's fake media stream flags;
  Firefox's equivalent preference) cover granted, denied and no-device cases
  and the indicator's state.
- `docs/browser-boundary.md`, `docs/audio.md` and `AGENTS.md` say exactly what
  is granted.
