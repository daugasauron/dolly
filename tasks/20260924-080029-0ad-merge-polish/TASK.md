# Make the 0 A.D. port ready for merge

- STATUS: OPEN
- PRIORITY: 250
- TAGS: wasm64,gpu,audio,gamedev,port

Polish the complete port, separate reusable components into Dollyfiles, and
finish sound as a core, versioned interface. Work continues on the isolated
`codex/0ad-baseline-20260923` branch from the Blockwalker checkpoint `aa28100`.

Completion requires reusable build/package boundaries, a documented and checked
sound ABI with SDK integration, resolution of gameplay/lifecycle defects, and
browser and distribution evidence sufficient for merge review. Keep external
bootstrap exceptions explicit; splitting binary imports alone does not finish
the source-build work. The previous baseline task records existing evidence.

The user additionally requires hardware GPU execution and reports very slow
gameplay followed by a black view and apparently ineffective mouse input.
Reproduce and fix those symptoms before treating the graphics port as ready.
The production provider requests a high-performance WebGPU adapter; earlier
acceptance tests forced CPU SwiftShader and measured approximately 324 ms/frame.
On September 24, an isolated Chrome adapter probe on the real X11 desktop
reported NVIDIA Blackwell with `isFallbackAdapter: false`.

Hardware acceptance must reject fallback adapters, exercise actual game input,
inspect visible output, report frame timing, and verify shutdown/restart.
Use bounded browser processes and one graphics workload at a time following
the user's earlier full-machine freezes.

Reproduced the black view: leaving the canvas at its edge did not generate an
SDL mouse-leave event, so camera scrolling continued into unexplored terrain.
Additive display event 10 now reports pointer presence. Window focus loss also
clears held keys/buttons. Chrome 151 and Firefox 155 passed the real SDL probe
for entry/exit, a dispatched window-blur event, held-input clearing and shell
recovery. The default Athens scene remains visible after leaving the canvas in
both browsers. Evidence: `.cache/0ad/sdl2-input-proof.log` and the before/after
screenshots in `.cache/0ad/browser/`.

Hardware profiling found thousands of temporary uniform allocations and
completion waits per frame. Firefox spent 45.4 seconds in 456 release waits
while producing only three startup frames. The renderer now uses aligned uniform
ranges, retains streamed geometry buffers, and reuses unchanged resource groups.
The provider skips duplicate completion fences when no new work has been queued;
released allocations remain charged until their work completes. Initial hardware
measurements improved Chrome's economy scene from 251 to 38 ms/frame before the
resource-group cache was added. Full packaged gameplay passes on Chrome 151
(19 ms/frame in combat, previously 315) and Firefox 155 (59 ms/frame; a separate
diagnostic run measured 36). Both reject fallback adapters and verify selection,
movement, quick-save/load, two trained civilians, completed house construction,
Petra progress, audible signal, two fresh processes and sound-free shell recovery.
Peak process-tree memory was 3.19 GB in Chrome and 4.02 GB in Firefox, within
their 4 GiB limits. Evidence: `.cache/0ad/browser-{chrome,firefox}-polish-test.log`.
Input checks wait for the game to consume the input mailbox. A later screenshot
trace found the intermittent training test was clicking on the loading screen:
loading frames counted toward its 22-frame threshold. Startup now waits for
visible HUD pixels before sending gameplay input.
Local release `f0346673d3f567db386c3adb58a4e34df2ac20692c1a239d674d5ad7b44815dc`
passed all ten image inventories and is served at `http://127.0.0.1:42727/zero-ad/`.
A fresh Firefox 155 session verified the packaged engine hash, launched bare
`zero-ad` on a non-fallback adapter, retained the visible town after eight seconds
outside the canvas, and exited cleanly. Evidence: `.cache/0ad/release-firefox-hardware.log`
and `.cache/0ad/browser/release-firefox-pointer-outside.png`.

The GPU texture/depth/indexed-rendering and hostile-packet checks pass in Chrome
151/SwiftShader, including quotas, stale handles, copied packets, close and forced
termination. All 277 source tests pass. The updated engine patch reconstructs
all 40 modified files from the pristine pinned archive. The canonical zero-ad
image build rebuilt all ten dependent images and produced a 581,815,363-byte
snapshot, SHA-256 `6fc7ea630f90a4c8031f0ead4e9b90622bbdf88143be85de607e8e45f0751029`.

Sound now has a documented process/outer ABI, an in-Dolly `audio-sdk` library
build, and a C client that preserves active handles, validates replies and
reserves sequence space for close/reopen. The provider bounds resume requests
without blocking the first trusted interaction. Chrome 151 and Firefox 155 pass
the installed SDK playback checks, malformed-reply mock, stereo measurement,
sequence exhaustion, quotas, hostile mailbox and process-termination checks.
Evidence: `.cache/0ad/audio-sdk-browser-{chrome,firefox}.log`.

`gpu-sdk` similarly builds the reusable GPU client inside Dolly; `gpu-fluid`
now links that library instead of embedding a second client and header copy.
Both SDKs and the fluid application compile through normal image recipes. The
installed GPU SDK passes texture/depth/indexed rendering, quotas, invalid packets,
fresh processes and forced interruption in Chrome/SwiftShader
(`.cache/0ad/gpu-sdk-browser.log`). All 277 source tests pass.
The remaining port work includes 0 A.D. component build
boundaries, sound latency, multiplayer host completion, AI save/load semantics,
and final build/release reproducibility.

Measured the game's audio cushion: 8192 frames produced 31 Firefox underruns;
16384 produced 13, versus 5 with 32768 in the final full gameplay check. Retain
the 32768-frame cushion rather than trade known gaps for lower latency. Writes
now use whole 2048-frame chunks, bounding queued buffers to 16 even at high FPS
(previously tiny per-frame writes could hit the 64-buffer quota). Firefox passes
the complete gameplay check with HUD-based readiness and the hardened PCM client
at 48 ms/frame. Chrome also passes at 20 ms/frame and two cumulative underruns.
Evidence: `.cache/0ad/audio-chunks-{firefox,chrome}.log`. The patch reconstructs
40 upstream files exactly. Engine SHA-256 is
`a1656f8513d7cc94e0118268e43c65696cba7e318581c51bd2f5c0461ad81462`;
snapshot SHA-256 is `9ce263d27fd7ea4a2cc8f11ff64e9e203a30114c5b66e907c2d3a6341f746855`.

`openal-build` now compiles OpenAL Soft 1.24.3 inside Dolly using the source-built
CMake/Clang toolchain and runs the numerical loopback fixture against its installed
SDK. The first build caught CMake retaining bootstrap OpenAL headers with the
same normalized timestamp; installation now replaces that header directory.
The completed image is 228,704,819 bytes, SHA-256
`f6ad0a2bcaa65def00a10a76b5ad4409ceffc6e9964705dce73c9854fe817fc3`.
Evidence: `.cache/0ad/openal-image-build-headers.log`. CMake rebuilt from source
in 1213 seconds; the standalone OpenAL build and checks took 124 seconds.
The external engine bootstrap consumes the same pinned, patched OpenAL source;
the engine itself remains an explicit external bootstrap exception.
All 277 source tests pass (`.cache/0ad/openal-polish-source-tests.log`).

The canonical `sdl2-build` recipe rebuilt the pointer-presence changes inside
Dolly in 179 seconds. Its normal browser suite passes source compilation,
RGB565 presentation, Unicode/composition/paste, pointer entry/exit, held-input
clearing on blur, ordered drawing, screenshots and shell/display recovery.
Evidence: `.cache/0ad/sdl2-polish-{image,browser}.log`. SDL source and downstream
recipe pins now identify that verified source bundle.
