# PhotoCraft built from source, as a demo image

- STATUS: OPEN
- PRIORITY: 350
- TAGS: port,demo,gpu,rust

Owner (2026-11-10, night): "I want to do a complete port of PhotoCraft, built from source, that
should be another demo image. The extension work we did to make godot work should be useful for
that too?" To start once Godot's work is on `main`.

## State (2026-11-11, night)

Branch `port/photocraft` (worktree `work/photocraft`). The desktop app needs two platforms Dolly
did not have, as Godot needed a platform and a RenderingDevice driver: winit on `display@0` and
`input@0` (`platform/winit`, about 600 lines after orbital's) and wgpu on `gpu@0`'s explicit records
(`platform/wgpu`, a custom backend of about 2,000 lines: `Instance::new` takes it for
`BROWSER_WEBGPU`). raw-window-handle names the window between them. rfd's dialogs are `zenity`,
an egui program on the same platforms (`zenity/`); arboard says there is no clipboard; `open` uses
a Unix desktop's openers; tokio's refusal of `net`, `process` and `signal` on Emscripten is kept to
wasm32, as its message says; ring takes Codex's patch. Dolly's libc named `nlink_t` `usize`, where
musl's is `unsigned long` (`c_ulong`), so crates that widen it to u64 did not compile
(cap-primitives): fixed in `demos/rust/toolchain/libc-0.2.18[56].patch`, which the Rust seed's next
build takes.

The staging rewrote git references only in each checkout's root manifest; a member's
(craft-libs' `crates/print`) kept its own, so Cargo would have fetched: now every manifest.

The whole app type-checked for `wasm64-unknown-emscripten` with a host nightly (`cargo check
-Zbuild-std` with Dolly's target spec, `demos/rust/toolchain/wasm64-emscripten-probe.json`) before
the first build in Dolly; that check is a developer's, the images build in Dolly.

Built in Dolly on 2026-11-11 (`photocraft`, `photocraft-photos`), the first runs found, each fixed
and rebuilt: wgpu-hal and wgpu-core took Emscripten's GL ES (WebGL by Emscripten's JavaScript) on
wasm64 too (the link failed), now wasm32 only as wgpu's own crate has it; egui creates its instance
with wgpu's WebGPU detection, which answered no off the web (now: does gpu@0 open a scope);
Emscripten's libc numbers errno as WASI does (EPERM 63); accesskit asks whether the window was
shown before its adapter exists; wgpu's error scopes are each thread's; a view must keep its
texture, which RELEASE destroys once the work queued before it is done; a download stays in an
image only when a FILE row keeps it. Then PhotoCraft opens the Great Wave, Ctrl+I inverts it, and
quitting saves it through zenity, which takes the page and gives it back (Chrome, NVIDIA). The
command line converts and inspects images; its GPU export reached gpu@0.

Left: Firefox's run of the test; Ctrl+Shift+S, Save As, is the page's (it saves the session), so
Save As is the File menu's; the clipboard; HiDPI (the window is the canvas at scale 1).

## What PhotoCraft is

[storytold/photocraft](https://github.com/storytold/photocraft) (MIT OR Apache-2.0): an image
editor in Rust (edition 2024, rust-version 1.95; Dolly's Rust is 1.98.1), 25 crates and 4 apps,
927 locked packages. `photocraft` is the desktop app: eframe 0.37 with the `wgpu` renderer (wgpu 30)
on winit, rfd's file dialogs, arboard's clipboard, accesskit. `photocraft-cli` is headless (convert,
inspect, batch, an MCP server), its GPU renderer an optional feature; its closure is about 585
packages without wgpu, the app's about 844.

## Plan

1. `photocraft-cli` without its GPU feature, built by Cargo in Dolly (`rust-build`), as Codex is:
   proves the toolchain on the project, and gives agents PhotoCraft's commands and MCP server.
2. The app: Dolly's Rust target is `wasm64-unknown-emscripten`, for which winit has no platform and
   wgpu no backend that fits (its Emscripten path is WebGL through Emscripten's JavaScript). Two
   backends, as Godot needed a platform and a RenderingDevice driver: winit on display@0 and
   input@0 (winit 0.30.13 picks a `platform_impl` by cfg aliases its build.rs sets; Redox's
   `orbital`, 1,599 lines, is the size to expect), and wgpu on gpu@0's explicit records, which
   keep WebGPU's object model as wgpu's API does (wgpu 30 takes a backend from outside,
   `Instance::from_custom`, and egui-wgpu an existing instance and device). File dialogs and the clipboard: what rfd and arboard can do here, or their refusals.
3. The demo image: the app on the page, with sample images and the CLI.

Done when the `photocraft` application opens, edits and saves an image on the page in Chrome and
Firefox, drawn through gpu@0, built from these sources inside Dolly, with its browser test.
