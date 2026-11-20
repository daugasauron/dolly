# Without a WebGPU adapter, PhotoCraft's CPU relaunch is refused the display

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: bug,photocraft,0.1.8

## State (2026-11-20)

Fixed on `fix/paste-devices`: without a WebGPU adapter PhotoCraft says it needs WebGPU and quits
to the shell; where its GPU renderer fails with an adapter, the first PhotoCraft waits for its
`--safe-gpu` self, which gets the display and the input.

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

## The fix (2026-11-20)

On Dolly's target the first PhotoCraft waits for the `--safe-gpu` child and exits with its
status (`demos/photocraft/platform/photocraft/photocraft.patch`, `main.rs`), so the foreground
job lasts until the second PhotoCraft quits; display@0's rule stays. photocraft and
photocraft-photos rebuilt in `work/paste-devices` (Cargo 20 min).

Measured on the rebuilt image (served from the tree, Xvfb `:157`): in Chrome 156 without
`--enable-unsafe-webgpu` and in Firefox 159 with `dom.webgpu.enabled` off, the second PhotoCraft
now gets the display (no `EPERM`); the image's "PhotoCraft has quit" comes after its lines, and
the shell is in front (`echo` runs, `touch-lab/scripts/photocraft-cpu.mjs`). The second one then
stops on the same `WGPU error: Failed to create surface for any enabled backend`: its CPU renderer
still asks wgpu for the window's surface ("a software adapter for the window", `main.rs`), and on
Dolly wgpu's one backend is the browser's WebGPU through gpu@0. `photocraft-gpu-browser.mjs`
(both browsers) and `photocraft-touch-browser.mjs` (Chrome) pass on the rebuilt image with the
NVIDIA adapter.

## Choices for what is left

- On Dolly without an adapter, PhotoCraft does not relaunch and says that it needs WebGPU (the
  page already shows its "No GPU" notice).
- A window for the CPU renderer without WebGPU: its frames through display@0, a new path in the
  wgpu platform.

Done when photocraft-photos without a WebGPU adapter either opens on the CPU renderer or quits
at once saying it needs WebGPU, back to the shell.

The integrator chose the first (2026-11-20). A CPU-rendered window through display@0 is not part
of 0.1.8: a later feature, if it is wanted.

## Closed (2026-11-20)

On Dolly's target, after a failed start, PhotoCraft asks wgpu for an adapter; with none it prints
"PhotoCraft needs WebGPU, which the browser does not give this page." and exits with status 1,
without starting again; with one, it starts its `--safe-gpu` self and waits for it
(`photocraft.patch`, one hunk of `main.rs`; the demo's README). photocraft and photocraft-photos
rebuilt in `work/paste-devices` (Cargo 22 min). On the rebuilt image, served from the tree on
Xvfb `:157` (`touch-lab/scripts/photocraft-cpu.mjs`):
- Chrome 156 without `--enable-unsafe-webgpu` and Firefox 159 with `dom.webgpu.enabled` off:
  the line shows after the GPU start's error, then the image's "PhotoCraft has quit", the shell
  is in front (`echo` runs), `photocraft` from the shell exits 1 with the same line, and the
  page's "No GPU" notice shows.
- `photocraft-gpu-browser.mjs` passes on the NVIDIA adapter in Chrome and Firefox.
