# Voxel Planet stage 1: The curved world: fields in 3D, grids to the horizon, every shader on the sphere

- STATUS: CLOSED
- PRIORITY: 279
- TAGS: godot,demo,planet,0.1.9

The research and its plan: `work/research/planet-2026-11-16.md`; the parent task is `tasks/20261116-133746-planet`.

## Closed (2026-11-17)

Done in `demos/godot/voxel-planet` (commits `9ee467fdd` to the parent task's last): the slow
fields are evaluated at the point of the sphere in three dimensions (`terrain.gdshaderinc`,
`terrain.gd`), with the planet's own fields (continents, belts of mountains, climate by region and
by latitude); eight grids reach round the planet, six with their ground in textures of their own
and two reading the whole planet's; every vertex stage carries its chart place onto the sphere
(`lift`); far ground is the mean of what is finer than it is read. Looked at on stills of a flight
by itself (the coast of the start, a town, a sea, mountains with their snow, far ranges in the
haze) and measured as the parent task says. What it leaves is in stages 3, 5 and 6.
