# PhotoCraft built from source, as a demo image

- STATUS: OPEN
- PRIORITY: 350
- TAGS: port,demo,gpu,rust

Owner (2026-11-10, night): "I want to do a complete port of PhotoCraft, built from source, that
should be another demo image. The extension work we did to make godot work should be useful for
that too?" To start once Godot's work is on `main`.

## State (2026-11-10, 23:10)

Branch `port/photocraft` (worktree `work/photocraft`) from `main` 54e5938ba. Sources pinned
(`demos/photocraft/config/sources.json`): PhotoCraft 0.20.1 at 331aa99d, and the git
dependencies its lock names: craft-libs at two revisions, its egui and winit forks, winprint at two.
`prepare-photocraft-sources.py` stages them for an offline Cargo build as Codex's script does: each
git reference becomes a path in its checkout, the crates.io crates are vendored (4 parts, 152 MB),
and Dolly's target is patched into the crates that lack it, for these versions
(`config/patches`): tokio 1.54 and socket2 0.6.5 already know Emscripten (only tokio's peer
credentials remain), cc 1.5 archives in one run of LLVM's ar with its parallel mode off, mio polls
with poll(2), zlib-rs keeps its SIMD to wasm32. Left: build `photocraft-cli` (it waits for
`rust-build` on the new seed, from main's round), then the application.

The CLI's closure has tokio (its MCP server, rt-multi-thread) but not reqwest, rustls or
aws-lc-sys: those come only through Windows printing (winprint) and the app's update check.

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
