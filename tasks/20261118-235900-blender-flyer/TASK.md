# Voxel Flyover's flyer made and animated in Blender, in one image with Blender

- STATUS: OPEN
- PRIORITY: 130
- TAGS: blender,godot,demo

Owner (2026-11-18): "Separately, I want to use one agent to make blender useful. The goal is to
create a demo video that creates a model in blender, then updates it in godot (voxel flyover) in
the same image. Make the target demo video make the main character(s) cooler. I want to animate
them as well so fix the numpy thing." "The video isn't urgent, create it once everything is
pinned in the catalog. Thats just the goal." Then: "For the blender, not only the pelican but the
whole model including the board, the engines and the dog."

NumPy in Blender is [20261116-230506-blender-2](../20261116-230506-blender-2/TASK.md).

## State (2026-11-19)

Built and run in Dolly on the branch's own images (`feature/blender-anim`):

- `demos/godot/voxel-flyover/flyer.py` makes the whole flyer in Blender: the board, the jets (a
  red band, a nozzle of flaps) with their fans, the bicycle, the chain of 60 links, the shaft,
  the pelican with flying goggles and a scarf, and a Pembroke corgi of one surface each for
  trunk and head, painted tan and white on its vertices, in a cape with a gold paw print. It
  bakes "pedal" (five turns of the cranks and all they drive), "steer" and "alive" (8 s: the
  pelican looks about, blinks and claps its bill; the corgi pants, tilts its head and looks down
  at the pelican) onto NLA tracks, and exports a GLB (1.4 MB) with extras for fur and cloth. In
  the voxel-flyover build it runs in Dolly's Blender, the export taking 16.6 s (9.7 natively).
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
  video's steps are in `demos/godot/README.md` ("The flyer in Blender").

Left: the round that builds the catalog's images (godot and every game on it, blender,
voxel-flyover, the applications), then the video.

## Done when

The flyover flies the Blender-made flyer in both browsers from the catalog's images, and the
README's steps in `blender-flyover` change what the game shows. The video waits for the catalog.
