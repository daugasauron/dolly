# Integrate PCM playback as a v4 host module for 0 A.D.

- STATUS: CLOSED
- PRIORITY: 260
- TAGS: audio,abi,0ad

Pair `src/host/audio.mjs` with `include/dolly/audio.h` and the existing
`abi/dolly-audio-0.wat`. Reuse main's bounded PCM provider and bridge. Runtime
must own lifecycle and deny disabled audio; microphone/network access is outside
this interface. Audio must not require threads.

Implemented in the Slopyard integration worktree:

- Fixed registry owns `audio@0` and `env.dolly_audio_dispatch`. The module owns
  request/completion/revocation messages, trusted input listeners, lazy device
  creation and disposal. Browser startup failure and worker exit dispose hosts.
- The audio client stamps its linked ABI requirement; the v4 audio SDK and 0 A.D.
  module declare playback. 0 A.D.'s recipe generator preserves its audio, GPU,
  display and HTTP requirements when preparing distribution assets.
- Browser test now uses the module for autoplay/gesture handling and checks
  that a host without audio rejects the requirement and handles no audio requests.

Verification on 2026-09-30:

- `node --test test/audio-host.test.mjs test/host-modules.test.mjs` passes:
  module bridge initialization/denial, copied packets, stale reply rejection,
  memory growth, completion, bounded revocation and disposal; actual recipe
  requirements agree between build graph and browser loader.
- Pinned recipe graph lint passes. The default image does not require audio;
  0 A.D. and audio SDK do not require threads.

The combined kernel and audio SDK rebuild successfully. Chromium and Firefox
pass `test/audio-browser.mjs`: real stereo playback, autoplay resume, bounded
queues, disabled modules, copied packets, cancellation and recovery.
Both also pass `test/0ad-graphics-browser.mjs zero-ad hardware`: combat and economy
audio reach the browser graph, alongside rendering, gameplay input, save/load,
fresh processes and shell recovery. Logs are in
`build/slopyard-integration-20260930/{audio,zero-ad}-{chromium,firefox}.log`.

Merge `1f0995d` reconciles both histories; local main now contains the verified
integration through `136f1e2`. All 40 domain images pass packaged browser
inventories, including audio SDK and 0 A.D. The default image remains audio-free.
