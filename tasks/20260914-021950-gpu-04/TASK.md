# Investigate Firefox WebGPU canvas presentation on Linux

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: gpu,browser

Verified on the actual X11 desktop after reboot with matching NVIDIA 580.178.04
kernel/userspace drivers. Installed Firefox 155.0.1 renders aurora, prism and the
8,192-particle compute scene in a fresh profile with `dom.webgpu.enabled` enabled.
BiDi page screenshots were visually inspected; compute returns `[3,5,7,9]` into
the Wasm filesystem. Normal rendering uses zero bytes of explicit pixel readback.
See [recorded results](../20260914-013806-gpu-03/evidence.json).

Playwright Firefox 155.0 also passes when launched with a visible window on the
actual desktop. `node test/gpu-browser.mjs` now requires different pixels when
switching scenes, unchanged pixels while paused, correct compute, and three
immediate Ctrl-C/restart cycles. This caught a lifecycle race where the kernel
reused a lease before the provider finished retiring the old scope; open now
waits for retirement, with allocation credits retained until queue completion.

The earlier blank presentation remains reproducible in the tested headless/Xvfb
configurations even with the healthy NVIDIA driver. Standalone WebGPU clears
outside Dolly also failed there. Driver repair alone did not resolve that path;
the precise virtual-display/compositor cause remains unproven. Some such runs
reject adapter acquisition entirely; Dolly returns to its shell. Firefox redacts
the adapter name, so its selected vendor was not established from WebGPU.

The completion criterion of actual Firefox-visible pixels, scene changes and
compute-to-render is met without a CPU readback fallback. Personal browser
profiles and existing images are unchanged. Reproduction and browser opt-ins
are in `docs/gpu.md`; screenshots remain in the GPU worktree at
`build/gpu-proof/firefox-{aurora,prism,garden}.png` and
`build/gpu-proof/firefox-real-display-{aurora,prism,garden}.png`.
