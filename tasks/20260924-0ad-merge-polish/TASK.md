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
Frame-based input checks now wait for the game to consume the input mailbox;
queued GPU reports alone could let the test click before selection was handled.
Local release packaging and acceptance remain pending.

The GPU texture/depth/indexed-rendering and hostile-packet checks pass in Chrome
151/SwiftShader, including quotas, stale handles, copied packets, close and forced
termination. All 277 source tests pass. The updated engine patch reconstructs
all 40 modified files from the pristine pinned archive. The canonical zero-ad
image build rebuilt all ten dependent images and produced a 581,815,363-byte
snapshot, SHA-256 `6fc7ea630f90a4c8031f0ead4e9b90622bbdf88143be85de607e8e45f0751029`.
