# Make the 0 A.D. port ready for merge

- STATUS: CLOSED
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

The headless multiplayer host now freezes its finished simulation while polling
until every connected peer has simulated the winning turn. Two headless peers,
a graphical client/headless host, and a graphical host/headless client all pass
149 matching command/hash records, winner metadata, clean exits and relay cleanup.
Hardware graphical-client/host runs took 112/137 seconds with 4.83/5.19 GB peaks.
Evidence: `.cache/0ad/multiplayer-polish-{headless,visual-client,visual-host}.log`.
The complete 41-file engine patch reconstructs from the pristine pinned archive.
All 277 source tests pass (`.cache/0ad/engine-polish-source-tests.log`).

The stronger AI check now compares 100 turns after saving at turn 300 with
uninterrupted play, then repeats the continuation from a fresh engine process.
It passes after removing restoration-time RNG draws and repeated dropsite commands,
consuming stale AI deltas on a full refresh, and notifying the AI when gathering
orders switch between a resource and its dropsite. Observation preserves pending
AI changes. Evidence: `.cache/0ad/ai-order-update-browser.log` (23-second economy
check). Upstream's stricter per-turn rejoin diagnostic exposed a missing builders
list in full foundation observations. After correcting it, the diagnostic passes
every comparison from turns 300 through 400 (`.cache/0ad/ai-foundation-rejoin-final.log`).
The normal regression also checks the pending construction event at turn 361,
then continues through turn 400 in the same and fresh processes
(`.cache/0ad/ai-foundation-browser.log`). The earlier assertion verified that
noninteractive failures exit with status 1 without consuming control input or
damaging the shell.

The canonical `scripts/build.sh` completes with the pinned compiler cache and
unchanged process sysroot, including exact outer-import and process ABI validation.
Runtime identity is `7e699dd3ff5b68204c0ec623493ef98bbbde220d1d128ae5a09b6ce240fbe6ce`;
image-input identity is `8e94a9e8bd663a5f42298a24e403537224cc9e5a8698ff7189b415418c05263d`.
The engine rebuild reproduces SHA-256
`44b8b1cc4c493242279b6bd7c1307f9956ca4b4ddbfe75e4bce1ca2942e3e039`.
Evidence: `.cache/0ad/canonical-runtime-polish.log` and
`.cache/0ad/engine-canonical-polish-{build,link}.log`. A full image rebuild exceeded
its 6 GiB scope during the Rust tools build; the bounded retry uses 8 GiB.

That rebuild exposed SDK-cache contamination: 0 A.D.'s Boost and other port
headers enlarged the base seed from 109 MiB to 258 MiB and the game image to
740,740,617 bytes. Seed packaging now installs fresh headers from the pinned SDK
in an isolated temporary cache. Two runs produce identical loader/data bytes;
the seed is 112,656,253 bytes and artifact checks reject leaked Boost, PNG and ICU
headers. All 22 non-snapshot artifact checks and all 277 source tests pass.
Evidence: `.cache/0ad/clean-seed-{reproducible,artifacts}.log` and
`.cache/0ad/seed-polish-source-tests.log`. Final runtime identity is
`66cb0420eb7882c2f43736dc698d91edf1d25871a7ea8a340d46c060ff6a1dd0`;
image-input identity is `1694666dacf60e72d4cd729e9e935cd096a1a6093be868dc45cce63790d91b70`.

The final game snapshot is 581,165,340 bytes, SHA-256
`59959b83080b5ae6befa96c4b7b7ff0798aa36ed2ceb3c058b7a9c8ef7f6572a`.
Both hardware gameplay suites pass: Firefox 155 at 47 ms/frame and 3.97 GB peak,
Chrome 151/NVIDIA Blackwell at 24 ms/frame and 3.16 GB peak. These runs verify
selection/movement, quick-save/load, training, completed construction, Petra,
sound, two fresh processes and shell recovery. F10 now opens the upstream menu;
Ctrl-F10 exits cleanly. The menu screenshot was inspected. Evidence:
`.cache/0ad/final-{firefox,chrome}-gameplay.log` and `browser/graphics-menu.png`.

Core browser checks pass in Chrome and Firefox. Both browsers pass the rebuilt
audio SDK checks; the rebuilt GPU SDK passes rendering, quotas, malformed/copy
checks and forced termination using SwiftShader. The complete selected artifact
suite passes 26 checks, with the unrelated CPython check skipped. Evidence:
`.cache/0ad/final-core-browser.log`, `final-audio-{chrome,firefox}.log`,
`final-gpu-sdk.log`, and `final-artifacts.log`.

Completed against implementation commit `8d8778e` on September 24, 2026.
Two complete builds in independent browser profiles and a cached build produce
the exact released 581,165,340-byte image, SHA-256
`59959b83080b5ae6befa96c4b7b7ff0798aa36ed2ceb3c058b7a9c8ef7f6572a`.
Evidence: `.cache/0ad/final-image-reproducible.log`.

Release `e7545fde96afe53b4380893cc80a4e2c66294a8cb90e1f036827af4fcdf26db9`
passes real-browser inventory acceptance for all twelve selected images,
including `zero-ad`, `audio-sdk` and `gpu-sdk`. Its 90 shared packs total
516,386,675 compressed bytes; the complete site is 1,332,464,815 bytes.
Archive: `build/0ad/dolly-zero-ad-pages.tar.gz`, SHA-256
`ddc33a909a443c517ebccc22a5ce58fcd9de2834bbcd7150a04eedcb38467363`.
Evidence: `.cache/0ad/final-release-package.log` and the release's
`release/acceptance.txt`.

The release is served at `http://127.0.0.1:42727/zero-ad/`. A fresh Firefox 155
session verifies its engine hash, launches bare `zero-ad` on a non-fallback
adapter, keeps the town visible after eight seconds outside the canvas, and
exits cleanly with Ctrl-F10. The resulting screenshot was inspected.
Evidence: `.cache/0ad/final-release-firefox.log` and
`.cache/0ad/browser/release-firefox-pointer-outside.png`.

The branch is ready for merge. The documented baseline limits remain selected
Athens/scenario content, an external engine bootstrap, buffered audio latency,
and HTTP multiplayer without lobby/native-peer/network-rejoin support. These
gameplay checks do not establish the cause of the earlier whole-PC freezes.
