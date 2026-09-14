# Blockwalker

Build a character from boxes and powered hinges, then try to walk it across a
plain floor. The starter has five boxes and four joints; a three-box chain and
an empty grid are also available. There is no automatic gait or balance system.

The C program uses the same raylib and Box3D libraries as the gamedev image.
Box3D runs fully 3D physics in Wasm on the CPU, with the existing serial,
non-SIMD build. A WGSL shader renders oriented boxes, joint markings, lighting
and shadows on WebGPU. Raylib draws the editor panels in Wasm; those pixels
are uploaded when the controls change. World frames have no GPU readback.
This is a renderer for this box game, not a general GPU backend for raylib.

| Action | Control |
| --- | --- |
| Place a box or joint | Choose the part, then click an empty box face |
| Select / erase | Pick or Erase tool; V / X |
| Orbit / zoom / recenter | Camera buttons, right-drag or Alt + left-drag / scroll / H |
| Edit a joint | Pick it, choose X/Y/Z, click each key to rebind |
| Test / return to editor | Test character or Enter / Escape |
| Undo | Undo button or Ctrl-Z |
| Leave the editor | Escape, returning to Slop |

A regular block attaches rigidly to its parent. A joint block hinges at its
parent attachment and carries the attached branch with it. Two keys drive
opposite directions. Deleting a block removes its branch; Undo restores it.
Blueprints contain up to 64 boxes. Test mode leaves their build pose unchanged.
Blocks weigh about 0.91 kg. Gravity is 4 m/s² and the character starts just above
the floor, giving time to try the controls. Hold a joint's keys to turn it;
release them to brake. Highlighted keys and joint angles show the response.

The working blueprint is `/workspace/blockwalker.character`, reloaded when
the program restarts. Export downloads a copy; Import restores it into a fresh
image or browser session. Dolly's normal saved sessions also retain the file.

```sh
node scripts/prepare-blockwalker.mjs
DOLLY_BUILD_IMAGES=blockwalker node scripts/generate-routes.mjs
DOLLY_BUILD_IMAGES=blockwalker DOLLY_SNAPSHOT_IMAGE=blockwalker node scripts/build-system-snapshot.mjs
node scripts/serve-gpu.mjs 9099 blockwalker
```

The separate [Dollyfile](../Dollyfile-blockwalker) reuses `gamedev-sdk`, compiles
the C sources inside Dolly, and runs `blockwalker --check` against actual
Box3D motors in both directions on all three axes, braking under gravity,
and 40 seconds of joint/weld/floor stability. `test/blockwalker-browser.mjs`
drives camera controls, the editor, key assignment, export/import, physics
and restart in Chrome.
On this Linux machine it can run under `xvfb-run -a` with the NVIDIA Vulkan
adapter, without opening a window on the desktop.
