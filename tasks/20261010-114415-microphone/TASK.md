# A host module that captures the microphone

- STATUS: OPEN
- PRIORITY: 220
- TAGS: host,audio,browser-boundary

Owner (2026-10-10): "I want you to implement and add a host module that can
capture the microphone through the browser."

This adds browser authority, so it changes a hard constraint of `AGENTS.md`
("the sound interface grants no audio capture"): `audio@0` still grants
none, and capture is its own module that an image must declare.

## Decisions (the integrator's, for the owner to overrule)

- `microphone@0`, beside `audio@0`, on the same per-process device lease
  (`src/device-lease.c`), process operation 130, kernel import
  `env.dolly_microphone_dispatch`.
- Fixed format: mono f32 at 48 kHz. The browser resamples and mixes down;
  anything else is the program's work, in Wasm.
- The browser's own prompt is the grant. OPEN asks and returns at once, so a
  program is never blocked on a person; READ never blocks; the state says
  waiting, capturing, denied or unavailable.
- One capture, one process. No device list, labels or choice of device.
- The page shows "Microphone" over the display while a program waits for or
  holds it, beside the browser's own mark. Tracks stop on close and on exit.
- `cc` links `libdolly-microphone.a` as it links every client; an executable
  records the module only when it calls it. `audio-sdk` declares it; no
  other image does.
- The Worker side of a leased device was the same code twice (GPU aside):
  it is now `host/lease-bridge.mjs`, used by playback and capture.

## Consequences

- New runtime and image inputs (`libdolly-microphone.a` and two headers join
  the sysroot): every image rebuilds at the next release.

## Evidence (2026-10-10, `core/microphone` in `work/rust`)

- The runtime builds with the module and `dist/dolly.wasm` has exactly the
  typed imports of `abi/dolly-browser-0.wat`: runtime `99a04de0…`, image
  inputs `25f85fa7…`.
- `node test/microphone-browser.mjs` passes in Chromium and Firefox with
  each browser's fake device (`test/fixtures/microphone.c`, built by `cc`
  in `audio-sdk`):
  - Chromium records the 440 Hz file the test plays at rms 0.3453 (played:
    0.3453); Firefox its own 1,000 Hz tone at rms 0.0707. Level and pitch
    are exact, so no block is lost or repeated; the count of captured frames
    equals read + queued + dropped.
  - Nothing is asked of the browser before a program opens the microphone;
    a second open is `EBUSY`; unread, the queue holds 96,000 frames and
    counts the rest as dropped.
  - Exit and Ctrl-C stop the tracks and hide the page's "Microphone on".
  - Denied (`--deny-permission-prompts`, `permissions.default.microphone`
    2): the state is denied and a read fails with `EACCES`.
  - At the provider (`test/fixtures/microphone-boundary.mjs`): malformed
    packets, an unknown operation, sequence replay, a reused lease and a
    stale revocation are refused, and only `{audio: true, video: false}` is
    ever asked for.
- `node test/audio-browser.mjs` passes in both browsers on the shared lease
  bridge; `node --test 'test/*.test.mjs'`: 343 pass; recipes lint.
- The first 0.2 s of a capture are silence in Chrome's fake device; the
  fixture measures after them.
- A capture closed at once rejected `AudioContext.resume()` in Firefox
  ("Closed before resume completed") as an uncaught page error; the provider
  takes that rejection.

- The core browser suite on the new kernel (`default`, `system`,
  `system-build`, `audio-sdk`, `gpu-sdk`, `cc`, `git`, `less`, `python` and
  `dolly-docs` rebuilt on it): every test file passes in Chromium and
  Firefox except `amy-browser.mjs`, which installs packages (`rust`,
  `cargo`, `llvm`, …) that were not rebuilt. `sockets-browser.mjs` and
  `dolly.artifacts.mjs` hold the kernel's exact import list and gained
  `env.dolly_microphone_dispatch`.

Not done: the rest of the catalog rebuilt on this seed (the next release
round), and with it `amy-browser.mjs`, the artifact tests and the demos.

Not measured: a real microphone and the browsers' real prompts (headless
tests use fake devices and preset answers); Safari.
