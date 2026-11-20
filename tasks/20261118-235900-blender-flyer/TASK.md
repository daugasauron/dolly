# Voxel Flyover's flyer made and animated in Blender, in one image with Blender

- STATUS: CLOSED
- PRIORITY: 130
- TAGS: blender,godot,demo

Owner (2026-11-18): "Separately, I want to use one agent to make blender useful. The goal is to
create a demo video that creates a model in blender, then updates it in godot (voxel flyover) in
the same image. Make the target demo video make the main character(s) cooler. I want to animate
them as well so fix the numpy thing." "The video isn't urgent, create it once everything is
pinned in the catalog. Thats just the goal." Then: "For the blender, not only the pelican but the
whole model including the board, the engines and the dog."

NumPy in Blender is [20261116-230506-blender-2](../20261116-230506-blender-2/TASK.md).

Owner (2026-11-21): "I want to rerecord the voxel flyover, the point was to demo one image that
edits the main model in blender and then loads it into godot and plays the game. Btw the recently
updated model looks awful." "I want you to spend the rest of the night to design a better
corgi/pelican using fable. I like the theme but the current model is horrible, the corgis neck is
transparent somehow?"

## State (2026-11-21)

Branch `feature/flyer-design` (commits d2c54ef56, 9aae1f7f6, 31de6ba87, fe1db1f57, c620d2570 and
the one that closes this), on integrate/0.1.8 at e09c641bc.

- **The transparent neck.** Measured, each mesh's signed volume after `flyer.py`
  (`bmesh.calc_volume`): every mesh `loft()` made was wound inside out (the corgi's neck -0.217,
  its trunk -1.157; of their faces none looked outward): 149 of the 185 meshes, all but the flat
  cloths and the two gears. The plain
  materials are drawn double-sided (glTF's `doubleSided`, then `Parts.lit`), which hid it. A
  coat's skin and its fur's shells cull their back faces, so on every coated part the near wall
  was culled, what showed was the inside of the far wall, and the shells grew inward along the
  inward normals. The neck ran from inside the chest into the head, so through its culled near
  wall one saw into it. `loft()` now winds its faces and caps outward: no mesh has a negative
  volume, and the fur stands out of the skin. 0edab0fa9's one shader did not cause it: the skins
  culled their back faces before it too.
- **The flyer.** The corgi's trunk is one surface from the rump along the back and up the neck
  into the head, with a cleft seat, a white nub of a tail, a darker saddle, fur on chin and paws,
  taller rounded ears, mirrored sunglasses (blue to amber) over eyes, a solid tongue, and a cape
  with a swallow's tail that hangs over the shoulders by its fixed end. The pelican is plumper,
  its head and eyes larger, with lids, a striped cap, goggles of one mesh, a brighter scarf; the
  front rods the bicycle hangs from pass beside its head, where they crossed its face. The board
  has cream rails and a golden underside. Every colour is in the vertices (Blender's solid view
  shows them; a material is a roughness and a metalness; coats and cloths carry no colour in
  their extras), and a coat's hairs are counted from its loft's girth and length, each standing
  somewhere in its cell.
- **The animations.** "alive" is twice "pedal"'s length; at 6 s the corgi looks down over its
  sunglasses at the pelican, which looks up and claps its bill. The scene is left for Blender to
  play ("pedal" cyclic, the handlebar straight), and `blender-flyover` opens with the script down
  the left (font 16) and a large 3D view of the flyer playing in its vertices' colours: 30 frames
  a second in Chrome, the window 13 to 15 s after the page opened, Alt+P 3.5 s.
- **Measured** on the images of c620d2570, RTX 5070, 2026-11-21, `godot-flyover-browser.mjs`
  passing in both browsers: Chrome 60.0 fps, gpu 8.5 ms, cpu 1.0; Firefox 58.8 fps, gpu 11.7,
  cpu 1.1. The base's images the same night: Chrome 60.0, 8.5, 1.1; Firefox 58.8, 11.7, 1.1. The
  flyer with its shadows natively, in a view from behind: 278 draw calls for 300, 388,000
  primitives for 293,000.
- **The steps** (`work/videos-2026-11-21/blender-flyover/steps-check.mjs`, both browsers, by keys
  and the pointer): the CAPE line typed over in the Text Editor, Alt+P, Ctrl+Q; the model the
  window wrote is byte for byte the one Blender makes without its window from the script with
  that line, and not the one from the script as it is; `voxel-flyover` then flies it (Chrome 60.0
  fps, Firefox 58.8) with no error. Chrome's stills show the blue cape in Blender and in the
  game; Firefox under Xvfb shows no WebGPU canvas in a still.
- **The video.** `work/videos-2026-11-21/blender-flyover/take3.mp4` (4:43), recorded at 06:01 with the round over: Blender opens on `flyer.py` and the flyer playing, the view is turned, the CAPE and BOARD lines are typed over, Alt+P, Ctrl+Q, `voxel-flyover` typed in the shell, the game flying the blue cape on the pink board, close views of both riders, the planet whole and the dive back; the game drew 59.9 frames a second while it was recorded. Its cut, `sites/slopshare.dev/agents/videos/voxel-flyover.mp4` (2:52, 23.9 MiB), replaces the Voxel Flyover video on the demos page, whose section links `blender-flyover`, now on the front page's list.
- **Found and left.** Blender in Dolly prints "Error: Not freed memory blocks: 3, total unfreed
  memory 0.001099 MB" as it quits from this window (the native Blender 5.3 does not, with the
  same scripts); the glTF exporter's `export_loglevel` cannot quiet its 250 lines a run (5.3's
  operator sets `loglevel` only when the option is below zero, and fails on any other value).
  In the shade under the board the plain materials take the sky's blue (the pelican's cap, the
  corgi's tongue from ahead), where the coats stay light.

Evidence on this machine: `work/videos-2026-11-21/blender-flyover/` (README, takes, `stills/`
before and after, `checks/` the tests' and the volumes' output).

## State (2026-11-19)


Built and run in Dolly on the branch's own images (`feature/blender-anim`):

- `demos/godot/voxel-flyover/flyer.py` makes the whole flyer in Blender: the board, the jets (a
  red band, a nozzle of flaps) with their fans, the bicycle, the chain of 60 links, the shaft,
  the pelican with flying goggles and a scarf, and a Pembroke corgi of one surface each for
  trunk and head, painted tan and white on its vertices, in a cape with a gold paw print. It
  bakes "pedal" (five turns of the cranks and all they drive), "steer" and "alive" (8 s: the
  pelican looks about, blinks and claps its bill; the corgi pants, tilts its head and looks down
  at the pelican), each one action with a slot per object, and exports a GLB (1.7 MB) with extras
  for fur and cloth. In the voxel-flyover build it runs in Dolly's Blender (2.4 s natively; it
  was 13 s, the waits' task).
- `model.gd` reads it at start with `GLTFDocument`, dresses coats and cloths with the game's
  shaders (which now take vertex colours too), seeks "pedal" and "steer" and plays "alive".
  `pelican.gd`, `drive.gdshader` and the primitive-built parts of `main.gd`'s `build_flyer` and
  `parts.gd` are gone.
- The godot package has `module_gltf_enabled=yes`; its check prints whether `GLTFDocument` exists.
- `godot-flyover-browser.mjs` passed with it: Chrome 56.6 fps, gpu 8.3 ms, cpu 1.9 ms; Firefox
  56.6 fps, gpu 8.6, cpu 2.2 (the flyer draws 297 calls with its shadows natively; the chain's
  identical links are already one instanced draw, measured with a MultiMesh in their place: 295).
- `blender-flyover` (`demos/godot/Dollyfile-blender-flyover`): Blender opens on the Scripting
  workspace with `flyer.py`, then makes the flyer; Run Script writes the file the game reads. The
  video's steps are in `demos/godot/README.md` ("The flyer in Blender"). Run by keys and the
  pointer on a hardware adapter (`build/flyover-steps.mjs` in the tree, not kept): the window drew
  31 to 39 s after the page opened; CAPE set to blue and Alt+P turned the cape blue in the 3D
  view and rewrote `flyer.glb`; Ctrl+Q left the shell, where `voxel-flyover` flew the corgi in a
  blue cape (Chrome, its frame; Firefox under Xvfb shows no WebGPU canvas, so there the new file
  and the game's report: 54.4 fps, no error).
- `blender-gpu-browser.mjs` and `blender-browser.mjs` pass in both browsers on the `-rdynamic`
  Blender with NumPy.

Left: the round that builds the catalog's images (godot and every game on it, blender,
voxel-flyover, the applications), then the video.

## Done when


The flyover flies the Blender-made flyer in both browsers from the catalog's images, and the
README's steps in `blender-flyover` change what the game shows. The video waits for the catalog.
