# PhotoCraft

[PhotoCraft](https://github.com/storytold/photocraft) 0.20.1, an image editor in Rust, built
inside Dolly by Cargo from its pinned sources, offline, as the `photocraft` package: the desktop
app on the page and its command line. Its window is egui's on wgpu and winit, which here run on
platforms of Dolly's own, as Godot runs on its platform and RenderingDevice driver
([task](../../tasks/20261110-225500-photocraft/TASK.md)).

## Images

- `photocraft`: PhotoCraft, its command line `photocraft-cli` (convert, inspect and batch images and
  PSD files, run its commands, serve them to agents over MCP) and `zenity`, the dialogs it opens.
- `photocraft-photos`: PhotoCraft on the page with Hokusai's Great Wave open; quitting it leaves a
  shell.

## Platforms

- winit ([`platform/winit`](platform/winit), selected by `winit.patch`): one window, the page's
  canvas, through the `display@0` and `input@0` leases. Records name keys as a browser's
  KeyboardEvent does, so the web platform's key tables read them; composed and pasted text is
  committed as an input method's. A wait for input lasts at most 10 ms so that other threads'
  repaint requests are seen: no call ends another's wait for a record.
- wgpu ([`platform/wgpu`](platform/wgpu), installed in its `backend/dolly` by `wgpu.patch`): the
  browser's WebGPU through `gpu@0`'s explicit records, which keep WebGPU's object model as wgpu's
  API does, as a custom backend that `Instance::new` takes for `BROWSER_WEBGPU`. Creations and queue
  writes go to the scope's packet as they are made; a command buffer's records, and the objects
  they name, wait until it is submitted, and SUBMIT presents the surface it drew on. Shaders are
  WGSL; there are no automatic pipeline layouts, mapped writes are writes from a copy on unmap, and
  WebGPU's validation errors arrive with the next WAIT (`docs/gpu.md`).
- raw-window-handle names the window between them (`raw-window-handle.patch`).
- rfd's dialogs are the `zenity` command, as its Linux backend's are without a desktop portal
  (`rfd.patch`); [`zenity`](zenity) is an egui program on the same platforms, which takes the page
  from PhotoCraft and gives it back when it exits.
- A program on Dolly has no clipboard to write: arboard says so (`arboard.patch`), and a paste
  reaches the app as text. `open` uses a Unix desktop's openers, which Dolly does not have
  (`open.patch`).

## Sources

[`prepare-photocraft-sources.py`](prepare-photocraft-sources.py) stages PhotoCraft's archive, the
git dependencies its lock names ([`config/sources.json`](config/sources.json)), each referenced as
a path in its checkout, and every crate vendored, with Dolly's target patched into the crates that
lack it, for these versions ([`config/patches`](config/patches); ring takes Codex's).
