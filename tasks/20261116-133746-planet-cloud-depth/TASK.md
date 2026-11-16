# Voxel Planet stage 7: Clouds with depth: a deck flown through, storms from orbit

- STATUS: OPEN
- PRIORITY: 273
- TAGS: godot,demo,planet,0.1.9

The research and its plan: `work/research/planet-2026-11-16.md`; the parent task is `tasks/20261116-133746-planet`.

The cloud layer is a field on the sphere at 520 units: the sky's shader paints it from under, the
land's and the sea's shaders lay it over themselves from over it (where the way from the eye
passes through the layer), and on the way through it the air is white where cloud stands. The low
clouds (balls around the flyer) draw in from 1,400 to 4,200 units up. What is left: a deck with
depth that is flown through and seen from above with its relief and its shadows on itself;
the weather's fronts and storms as shapes seen from orbit, turning with the planet; the low
clouds seen from high up; lightning seen from orbit at night.

Done when: the climb through the clouds and the view down on them have depth, within the budgets.
