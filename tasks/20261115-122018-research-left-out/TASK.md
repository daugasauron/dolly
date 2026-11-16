# Voxel Flyover research: what it considered and left out

- STATUS: CLOSED
- PRIORITY: 10
- TAGS: godot,demo,flyover,research,0.1.8

The research of 2026-11-15 (`work/research/flyover-2026-11-15.md`, end of section 14) weighed these
for the game and left them out; its 15 ranked steps are the tasks tagged `research`. Recorded so
that they are not researched again without a new reason:

- Full volumetric clouds: temporal reprojection and 3D textures. FogVolume clouds are worth one
  experiment at the top quality level only (section 5.2); the cloud balls stay for every other.
- An FFT ocean: compute every frame, no visible gain from the air.
- TAA and FSR 2: ghosting at 30 frames a second, untried on `gpu@0`.
- Wave function collapse and relaxed-grid towns: not functions of a point, so not endless.
- Octahedral impostors: they need baked textures.
- Hydraulic erosion by simulation: not endless.
- Grass blades or shell grass: below the flyover's resolution.
- GPU boids by compute: an untried path, not needed at these counts.
- Hillaire's physical atmosphere: a physical model for a painted sky.

## Closed (2026-11-15)

A record of the research's decisions, not work to do.
