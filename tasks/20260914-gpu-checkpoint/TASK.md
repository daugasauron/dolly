# Checkpoint: GPU fluid and in-sandbox local inference

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: gpu,llm,checkpoint

Prepare a tested checkpoint on `codex/gpu-shaders-20260914`, named by the
annotated tag `gpu-checkpoint-20260914`. Retain the separate Dollyfiles and
cached compiler/library images. Completion requires current fluid rendering
and compute checks, verified bundled inference and persistence, valid image
inputs, and a home-page entry for each experiment.

| Image | What runs inside Dolly | Uncompressed image |
| --- | --- | ---: |
| `gpu-fluid` | Upstream C fluid solver, WGSL, input and control panel | 155 MB |
| `pi-local` | Pi and llama.cpp with bundled Qwen3.5-0.8B Q4_K_M | 822 MB |
| `dollyfile-studio` | The same model plus Neovim and image authoring tools | 858 MB |

Both workloads compile and execute inside Wasm64. The browser owns the generic
GPU broker, device resources and canvas presentation. The model engine,
tokenization, sampling, conversation and filesystem remain inside Dolly.
The former browser-side WebLLM service, worker, UI, npm dependency and generated
assets are removed. Default weights arrive with the image and survive refresh
through the verified image cache; saved deltas do not duplicate them.

## Run this checkout

```sh
node scripts/serve-gpu-demo.mjs 9094 gpu-fluid
node scripts/serve-gpu-demo.mjs 9097 pi-local
```

Run these in separate terminals, then open
`http://127.0.0.1:9094/gpu-fluid/` or `http://127.0.0.1:9097/pi-local/`.
The servers use existing built artifacts. On a new checkout, follow the
bootstrap instructions in README.md, then build the selected
images with `DOLLY_BUILD_IMAGES=gpu-fluid,pi-local npm run image`.
Provider or UI edits reuse the compiler/library bases. Check rebuild reasons
first with `DOLLY_BUILD_IMAGES=gpu-fluid,pi-local npm run image -- --plan`.

Fluid: move the pointer to stir; H toggles controls, Space pauses, R resets,
A toggles automatic stirring and Q returns to the shell. F11 toggles fullscreen.
Pi: enter a prompt; Escape interrupts, `/model` selects a model, Ctrl+Shift+S
saves files and conversations. The first image load includes the 580 MB weights.

## Limits

Use HTTPS or localhost. Local inference requires `shader-f16`; this NVIDIA/Linux
Chrome setup needs the isolated-profile flags in
[local models](../../docs/browser-local-models.md#browser-and-storage-requirements).
Firefox renders the fluid correctly but Qwen generation remains around 0.5
tokens/s, [tracked separately](../20260914-llm-firefox-performance/TASK.md).
The 0.8B model is small and its coding/tool reliability is limited. Context is
8,192 tokens; thinking and image input are disabled. Optional larger models
still download into volatile files.

The GPU extension is experimental, with a deliberately partial WebGPU C adapter.
It does not yet accelerate the existing game renderers. The process ABI and
compiler seed identity are preserved; the browser GPU boundary and image-size
changes require review before merging. Detailed contracts and measurements:
[GPU](../../docs/gpu.md), [browser boundary](../../docs/browser-boundary.md),
[fluid evidence](../20260914-070000-gpu-05/TASK.md),
[inference evidence](../20260914-llm-in-image/TASK.md), and
[bundled weights](../20260914-llm-bundled-weights/TASK.md).

## Checkpoint verification

- All 21 required image artifacts match their pinned inputs and are reusable;
  no compiler or image rebuild was needed. [Image identities](evidence.json)
  record the exact runtime, seed and four retained experiment snapshots.
- The current runtime passed the full fluid browser check in Chrome 151 and
  Firefox 155: visible ink/smoke/shadows, pause, input, resizing, grid/pressure
  controls, reset, compute readback, normal exit and two interrupt/restart cycles.
  The solver and direct replay both produced 271,431 nonzero dye values and a
  sum of 194,882.001529972. Normal rendering read back zero pixel bytes.
- Bundled-model checks passed on this same runtime in Chrome and Firefox, with
  generation, cancellation/restart, cached refresh, and session restore while
  external requests were denied. Chrome passed again after removing the 24
  stale WebLLM assets. See the linked model issues for structured results.
- The generated home page passed a real Chrome check: both experiments appear
  above build images, with compact rows and open/rebuild/Dollyfile links. The
  full catalog retains all 40 entries. Build-output symlinks are now ignored.
- 274 source tests passed; 249 HOST inputs and 40 recipe pins verified; the
  kernel has exactly the typed outer imports in the browser contract. Packaging
  documentation now admits dated tatr task IDs and their evidence.json files,
  with tests retaining rejection of private files and paths outside the site.
  GPU release inventories run in the existing headless Wasm build worker;
  desktop browser checks separately prove rendering and input.

Local verification logs: `build/gpu-checkpoint-{plan,fluid,source,inputs}.log`,
`build/fluid-proof/`, `build/gpu-checkpoint-menu.{png,json}` and
`build/llm-host-removal.log`. The selected checkpoint can be packaged separately
with `DOLLY_BUILD_IMAGES=gpu-demo,gpu-fluid,pi-local,dollyfile-studio bash
scripts/package-pages.sh build/gpu-checkpoint-20260914.tar.gz
build/gpu-checkpoint-releases`. This preserves the main distribution and its
existing catalog. Main remains unmerged.
