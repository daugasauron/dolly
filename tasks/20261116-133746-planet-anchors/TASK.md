# Voxel Planet stage 3: Anchors everywhere: a fixed set of charts, all state carried over a move

- STATUS: OPEN
- PRIORITY: 277
- TAGS: godot,demo,planet,0.1.9

The research and its plan: `work/research/planet-2026-11-16.md`; the parent task is `tasks/20261116-133746-planet`.

The chart's anchor moves under the flyer when it is over 8,000 units high and 120,000 from the
anchor (`main.gd`'s `move_anchor`). What is left:

- The new anchor is wherever the flyer is, so what stands on the chart's lattice (each tree, each
  lot of a town) depends on the way a place was reached. Anchors from a fixed set (the points of
  a geodesic lattice some 60,000 units apart, each with its axes) make a place the same from every
  approach.
- A move lets go of what kept a place in the old chart: the beacons lit (their count is kept, their
  rings are not), the landmarks, the wakes' history. Carry them over.
- A move draws the visible grids' grounds anew in one frame (measured: see the parent task). Spread
  it, or prepare the next chart's grounds before the move.
- A chart's own stretch is not told to the near ground: `lift` takes the chart for flat around
  the flyer, which is off by 0.7 % at 120,000 units from the anchor (a strain of 13 units across
  the band at 1,700 to 2,250 units where the near and the far formula meet).

Done when: two flights that reach one place by different ways see the same trees and houses
there, and a move shows in no measure.
