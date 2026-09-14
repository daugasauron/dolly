# Build from underneath and use magnetic ball joints

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,bug

The builder camera stops at -0.1 radians of pitch, making lower attachments
inaccessible. Allow orbiting below the floor and keep the character visible
from there. Joint parts should be glossy magnetic-looking balls, with matching
spherical picking and collisions. Keep grid snapping and key-controlled hinges.

Verify bottom attachment to a low part from below the floor, undo/save/load,
sphere surface snapping, and the motor/stability checks in a real browser.

Verified on `codex/blockwalker-20260914`:

- Orbit pitch now spans -1.5 to +1.5 radians. The floor is one-sided, and the
  empty grid can also receive its first box when approached from below.
- WebGPU draws glossy spheres with metallic bands and colored poles. Raylib
  sphere picking snaps the surface normal to one grid axis. Box3D uses sphere
  colliders with the same 0.913 kg part mass; key-controlled hinges remain.
- Chrome 151.0.7922.71 on NVIDIA Blackwell: imported a three-part build with
  its lowest part at y=0 and a joint at (1,1,0). Seven Down clicks put the camera
  below the floor. Clicking the ball's underside attached a box at (1,0,0) to
  that joint. Undo, export and reimport passed. Top-side sphere attachment,
  camera drag/zoom, remapping, motor input and restart also passed.
- Fixed-root motor fixtures still turn both directions on all three axes and
  brake on release. The 40-second free-body stress run measured 0.00829 m peak
  attachment separation and 0.9999 m between welded centers. Direction checks
  belong to the fixed-root fixture because floor contacts can block a free leg.
- No browser errors or GPU readback. Seven recipe tests passed; 40 recipes
  linted. The final C image rebuilt inside Dolly in 7.9 seconds using cached bases.

Screenshots and detailed results: `build/blockwalker-proof/`, especially
`under-floor-attached.png`, `builder.png`, `physics-check.log` and `results.json`.

Visual follow-up: replaced the glossy finish with uniform matte colors, soft
diffuse shading and a subtle seam. Rebuilt the image and inspected the front
and underside in Chrome; screenshots are `balls.png` and `under-floor.png`.
