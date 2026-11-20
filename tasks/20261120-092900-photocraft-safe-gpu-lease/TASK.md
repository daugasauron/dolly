# Without a WebGPU adapter, PhotoCraft's CPU relaunch is refused the display

- STATUS: OPEN
- PRIORITY: 200
- TAGS: bug,photocraft,0.1.8

## State (2026-11-20)

Cause read, not fixed: the fix is in the port (a rebuild), not on the page.

## Seen

Where the browser gives no WebGPU adapter (the Android emulator's Chrome 145; on this host Chrome
156 without `--enable-unsafe-webgpu` and Firefox 160 on Xvfb), RC1's `photocraft-photos` prints:

    eframe::native::run: Exiting because of error: WGPU error: Failed to create surface for any enabled backend: {}
    ... GPU startup: Plan { backend: Cpu, ..., reason: Some("--safe-gpu: CPU renderer for this launch") ... }
    winit error: os error at .../src/platform_impl/dolly/window.rs:55: display: Operation not permitted (os error 63)
    PhotoCraft could not start ...

## Cause

PhotoCraft retries a renderer failure "in a fresh process" (`apps/photocraft/src/main.rs`, after
`eframe::run`): it spawns itself with `--safe-gpu` and returns at once. In Dolly the first
process was the foreground one and ends; its child, whose parent is gone, descends from no
foreground process, and display@0 gives a lease only to the foreground process or its
descendants (`host/display/kernel.c`, `process_may_acquire_display`): `EPERM`.

## Choices

- The port waits for the relaunched child on Dolly (`Command::status` for `spawn`), so the parent
  stays in the foreground while the child holds the display: a patch and a rebuild of PhotoCraft.
- PhotoCraft's Dolly platform reports no adapter before the first start, so its plan takes the
  CPU renderer at once and there is no relaunch.

Done when photocraft-photos opens on the CPU renderer in a browser without a WebGPU adapter.
