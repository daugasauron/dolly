# Voxel Planet stage 4: Air by the book: Hillaire's tables for sky, aerial perspective and rim

- STATUS: OPEN
- PRIORITY: 276
- TAGS: godot,demo,planet,0.1.9

The research and its plan: `work/research/planet-2026-11-16.md`; the parent task is `tasks/20261116-133746-planet`.

The first demo's air is three hand-made parts that agree by construction, not by a model: Godot's
fog with a density set from the camera's height, a closed form of the air a ray passes in
`sky.gdshader` (the rim seen from space, the dark zenith), and a veil the land's and the sea's
shaders lay over themselves from out of the air (`from_above`). What is left:

- One model (Hillaire 2020: transmittance, multiple scattering and sky-view tables of a few
  thousand texels, redone a frame) for the sky's colour, the haze over far ground at every height
  and the rim, so a sunset is seen the same from the ground, from 20,000 units and from orbit.
- The haze over far ground by the way through the air on a sphere: Godot's fog is by distance
  alone, and its height fog by Godot's Y, which far ground has left by the planet's curve.
- The planet's shadow in its own air (the dark segment over the horizon after sunset), and the
  low clouds and the flyer lit by it.
- Keep the painted sunrise and sunset the owner likes: the tables give the light, the paint stays.

Done when: one set of parameters draws the air from the ground to orbit, in Chrome and Firefox
on both adapters, within the frame budgets.
