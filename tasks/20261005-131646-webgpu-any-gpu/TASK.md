# WebGPU on any GPU: discrete adapters, optional shader-f16, model-size packages

- STATUS: OPEN
- PRIORITY: 290
- TAGS: gpu,local-llm,packages,demo

Owner (2026-10-05): "currently firefox 'works' because it uses the integrated
gpu, not my nvidia one. I want the nvidia one to work, but it complains again
on the f18 something something. The WebGPU setup should be adaptable for anyone
that has a GPU, and packages should let them try different model sizes. Verify
this with playwright." ("f18" is presumably `shader-f16`.)

This machine: NVIDIA RTX 5070 (12 GB, driver 580.178.04) and an AMD integrated
GPU (`1002:13c0`).

## Work

1. Reproduce with Playwright in Chrome and Firefox, each forced onto each
   adapter. Record the adapter, its features and limits, and the exact error.
2. Adapter choice belongs to the `gpu@0` provider: decide the power preference,
   show the chosen adapter in the GPU indicator, and update
   `docs/browser-boundary.md`.
3. Negotiate instead of requiring: no optional feature or raised limit is
   assumed. The inference path picks f16 or f32 from what the adapter grants
   and says which; a missing requirement fails with a line naming it.
4. Model sizes as packages a user installs with `amy`, including sizes above
   the 2 GiB image limit (Qwen3.5-4B is 3 GB): choose the mechanism and record
   which size fits which amount of GPU memory.

## Done when

- A Playwright matrix {Chrome, Firefox} x {NVIDIA, integrated, no GPU} is
  recorded here with tokens per second per model size.
- The local model runs on the NVIDIA adapter in both browsers, or the browser
  defect is identified with its upstream reference.
- At least three model sizes install with `amy`.
