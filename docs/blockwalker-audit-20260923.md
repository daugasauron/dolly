# Blockwalker checkpoint audit — September 23

Audited `aa28100` on `codex/blockwalker-20260914`. The game is a functional agent
physics playground with real working creations. It is not yet a dependable
save-and-return workflow or a polished manual-control game. Prioritize save
durability and resumed feedback before adding more creatures.

## Findings, in priority order

| Priority | Finding | Evidence / task |
| --- | --- | --- |
| High | A resumed controller receives false joint feedback on its first tick. A saved 1.310963273 rad hinge reports 0, then the correct angle one tick later. | [Controller restore](../tasks/20260923-203200-codex-01/TASK.md) |
| High | In-game saves are only in Wasm memory until the separate Dolly session action. A fresh game lost an added cargo object on refresh after waiting for its world save. | [Durable-save workflow](../tasks/20260923-203200-codex-02/TASK.md) |
| High | Saving a large imported learned session exceeds the 4 GiB browser limit. Recovery works, but normal capture still needs a fix. | [Existing memory issue](../tasks/20260923-200000-codex-01/TASK.md) |
| Medium | A plain blueprint cannot be saved to the library; character export omits its program; world export has no matching in-game import. | [Library and exchange](../tasks/20260923-203200-codex-03/TASK.md) |
| Medium | Importing proxy configuration a second time fails with EEXIST and claims it was cancelled. | [Proxy replacement](../tasks/20260923-203200-codex-04/TASK.md) |
| Medium | Sidelight IV has 12 actuators, but manual play exposes seven binding/angle rows. | [Complete control map](../tasks/20260923-203200-codex-05/TASK.md) |

No game or runtime implementation was changed for this audit. The checkpoint
and original learned saves remain intact. Reproduction scripts/artifacts are
under `build/blockwalker-audit-20260923/` and `build/blockwalker-audit-*.mjs`.

## What is working

- The fresh catalog has 53 placed objects / 1461 parts and 44 distinct library
  designs; repeated cargo placements share a reusable design. This is separate
  from the recovered learned world: 51 survivors and 78 saved experiments.
- A new 180.63 s browser run reached 177.03 simulation seconds. All 53 objects
  survived; all four bipeds remained upright. 34 objects displaced over a metre
  from the first sample, including cargo moved by mechanisms; that count is not
  a claim of 34 independently locomoting creatures. No page errors or model
  requests occurred.
- The earlier independent Sidelight IV audit measured 41 alternating physical
  placements and six reversals over 600 s. Its long saved run is also upright,
  but later step counts are controller diagnostics, not an independent audit
  of every placement. Walking is real; general collision robustness is unproven.
- Existing browser checks cover editor placement/undo, underside cameras,
  travel/follow/focus views, bindings, buoyancy, motors, hover, magnetic pickup
  and release, controller budget rejection and serialized save/reload.
- The C game uses real Box3D dynamics, raylib UI and WebGPU rendering. Rendered
  frames stay on the GPU; the new run recorded zero routine GPU readback bytes.
  Controllers and physics remain CPU work; the build disables Box3D SIMD.
- The full Pi history is preserved. Its 3717 entries parse, with 1217 embedded
  images accounting for 361869408 of 387804845 bytes. Model input retains at most
  three recent images; archive growth is a separate persistence concern.

## Limits and design assessment

The new run averaged about 27 rendered frames/s at 1280×720 on the shared NVIDIA
Blackwell host. Earlier short views measured 40–46 FPS. These are different
workloads/times, not a controlled regression comparison or GPU throughput limit.
Simulation stayed at approximately 0.98× wall time. Existing profiling attributes
cost to CPU physics, UI redraws and broker waits as well as rendering; adding GPU
effects alone will not resolve all frame-time costs.

Human play lags the agent workflow: the tested biped is late in a paged library,
only seven controls are visible, and the trace panel is a short non-scrollable
tail. The agent can inspect full designs/programs and detailed physics through
tools. A discoverable working example, complete control map, and reliable
save/reopen flow would improve this checkpoint more than a larger catalog.

The arms/magnetic-hands successor remains experimental. Earlier straight bipeds
have known late falls; bounded patrol and leg interference are still open
investigations. Deliberately difficult balance is part of the game, so falling
alone is not a physics-engine defect. No new multi-hour run was performed.

The save regression checks serialized fields without asking the first resumed
controller what it sees. Extend that existing test with actual feedback/command
continuity; do not add wording assertions or rerun the entire distribution for
game source edits. The checkpoint rebuild already reused dependencies and took
20.7 s inside Dolly; routine source-only probes used the existing game image.

## Verification scope

Chrome 151 / NVIDIA WebGPU, one disposable test browser at a time, 4 GiB/no swap.
Fresh world run and sensor probe: `build/blockwalker-audit-20260923.log` (23214,
exit 0). UI round trips and repeated proxy import:
`build/blockwalker-audit-ui-final-20260923.log` (91843, exit 0). Screenshots were
visually inspected. The test used credential-free dummy configuration and kept
Pi paused. No paid requests, host C compilation, live-world changes, or new
browser capabilities were involved. Firefox, other GPUs, background-tab behavior
and a fresh end-to-end live model conversation were not tested in this audit.
