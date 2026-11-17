# Voxel Planet stage 6: Charts joined on the ground: two lattices cross-faded over a band

- STATUS: OPEN
- PRIORITY: 274
- TAGS: godot,demo,planet,0.1.9

The research and its plan: `work/research/planet-2026-11-16.md`; the parent task is `tasks/20261116-133746-planet`.

The chart's anchor moves only over 8,000 units up. A flight that stays on the ground keeps its
chart: the chart's stretch across the flight's way grows with the distance from the anchor (1 %
at 147,000 units, 80 minutes of flight; 4 % at 300,000), and float32's steps with it. What is
left: a move of the anchor on the ground with no visible change, the old chart's trees and
houses drawing back as the new chart's grow over a band, as the game's rings of trees already do;
roads and lots across the band.

Done when: a flight of four hours along the ground shows no change at a move and no stretch.
