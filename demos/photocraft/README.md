# PhotoCraft

[PhotoCraft](https://github.com/storytold/photocraft) 0.20.1, an image editor in Rust, built
inside Dolly by Cargo from its pinned sources, offline, as the `photocraft` package: the desktop
app on the page and its command line. Its window is egui's on wgpu and winit, which here run on
platforms of Dolly's own, as Godot runs on its platform and RenderingDevice driver
([task](../../tasks/20261110-225500-photocraft/TASK.md)).

In Chrome on an NVIDIA GPU (2026-11-11) the page shows PhotoCraft 4 s after it loads, the Great
Wave (3859 by 2594) drawn by its GPU canvas on `gpu@0`; Ctrl+I inverts it, and quitting saves it
through zenity's dialog and PhotoCraft's JPEG options
([test](test/photocraft-gpu-browser.mjs)); a frame follows a move of the pointer over its menus
in 14 ms at the median, 16 at the 90th percentile (30 moves). Cargo compiles the package in 28 minutes in the image
build, and zenity in 5 more. The update check finds no network, as Dolly gives programs none.
Text copied outside the page pastes into the New Layer dialog's name, and the field's Ctrl+C
gives it back to the browser's clipboard (the same test, Chrome and Firefox, 2026-11-13). On a
touchscreen with no fine pointer a tap lands on the window's pixel under the finger, also once the
page's bar has come below the canvas and left the window less room
([test](test/photocraft-touch-browser.mjs), Chrome, 2026-11-18).

On `x11-desktop` (2026-11-13, [test](test/photocraft-x11-browser.mjs)), `amy install photocraft`
and `photocraft` with the Great Wave open its window 21 to 23 s after the command, in Chrome and
Firefox; Ctrl+I's inverted picture shows within a frame, a drag of the title bar moves it, and
twm's Delete closes it after PhotoCraft asks to save. Its title shows the em dash as other
characters: twm reads `WM_NAME`, where x11-window stores the UTF-8 title as Latin-1 text.

## Images

- `photocraft`: PhotoCraft, with Hokusai's Great Wave to open (`/usr/share/photocraft/pictures`), its command line `photocraft-cli` (convert, inspect and batch images and
  PSD files, run its commands, serve them to agents over MCP) and `zenity`, the dialogs it opens.
- `photocraft-photos`: PhotoCraft on the page with Hokusai's Great Wave open; quitting it leaves a
  shell.

## Platforms

- winit ([`platform/winit`](platform/winit), selected by `winit.patch`): one window, the page's
  canvas, through the `display@0` and `input@0` leases. Records name keys as a browser's
  KeyboardEvent does, so the web platform's key tables read them; composed and pasted text is
  committed as an input method's. A thread of the window's own waits for each record, so the
  loop waits on one condition for records, other threads' events and its deadline. While the
  window has the page its Ctrl+C is Copy, not the terminal's interrupt key (`ISIG` off). Where
  `DISPLAY` names an X server (`x11-desktop`), the window is one of its windows instead, through
  [`x11-window`](../x11/README.md), whose records are `input@0`'s: the window manager moves,
  resizes and closes it.
- wgpu ([`platform/wgpu`](platform/wgpu), installed in its `backend/dolly` by `wgpu.patch`): the
  browser's WebGPU through `gpu@0`'s explicit records, which keep WebGPU's object model as wgpu's
  API does, as a custom backend that `Instance::new` takes for `BROWSER_WEBGPU`. Creations and queue
  writes go to the scope's packet as they are made; a command buffer's records, and the objects
  they name, wait until it is submitted, and SUBMIT presents the surface it drew on. Shaders are
  WGSL; there are no automatic pipeline layouts, mapped writes are writes from a copy on unmap, and
  WebGPU's validation errors arrive with the next WAIT (`docs/gpu.md`). An X window's surface
  is a texture of its own: at each present it is copied to a buffer, read back and put in the
  window.
- raw-window-handle names the window between them (`raw-window-handle.patch`).
- File › Open is the browser's file picker (`upload@0`), as in PhotoCraft's own web build: the
  page keeps the file's name, so the document is `upload` with the extension its bytes show. Each
  file a save writes into Dolly is offered to the browser as well (`download@0`): the page shows
  its Save button ([`platform/photocraft`](platform/photocraft); the C calls are a crate of their
  own, as PhotoCraft keeps its one other `unsafe` crate).
- Where the browser gives no WebGPU adapter, PhotoCraft starts itself again with `--safe-gpu`, on
  the CPU renderer; the first process waits for it (`photocraft.patch`), so the page's
  foreground job, which alone gets the display, lasts until the second one quits.
- rfd's other dialogs are the `zenity` command, as its Linux backend's are without a desktop portal
  (`rfd.patch`); [`zenity`](zenity) is an egui program on the same platforms, which takes the page
  from PhotoCraft and gives it back when it exits.
- Copy and paste are the page's clipboard (`clipboard@0`, [input](../../docs/input.md#clipboard)):
  arboard holds it for the process (`arboard.patch`), so egui's Ctrl+C and Ctrl+X reach the
  browser's clipboard and its Ctrl+V reads what the user pasted. `open` uses a Unix desktop's
  openers, which Dolly does not have (`open.patch`).

## Sources

[`prepare-photocraft-sources.py`](prepare-photocraft-sources.py) stages PhotoCraft's archive, the
git dependencies its lock names ([`config/sources.json`](config/sources.json)), each referenced as
a path in its checkout, and every crate vendored, with Dolly's target patched into the crates that
lack it, for these versions ([`config/patches`](config/patches); ring takes Codex's).
