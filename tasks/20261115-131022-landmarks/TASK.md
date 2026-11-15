# Voxel Flyover 7: landmarks of many places and a few of fantasy, one a plot, by where they fit

- STATUS: OPEN
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`.

Owner (2026-11-15, 21:30): "Take inspiration from the real world and different cultures when creating objects, also feel free to add fantasy like environments as well." Overlaps `tasks/20261115-121944-research-09` (horizon landmarks) and `-research-11` (fantasy regions).

Done when: landmarks of several places and cultures and a few fantasy ones stand where they fit, rare enough to be finds, visible from afar without popping, not flown through, each looked at in stills; frame times hold on both adapters.

## State (2026-11-15, 23:10)

In the game (`terrain.gd` `landmark`, `landmarks.gd`): a plot of 260 units has one landmark at most, by its place: a lighthouse with turning beams on a level coast, a windmill among fields, a tower of its kind in a town (a mast in a city, a clock tower with a spire, a slender tower with a gallery and a dome, a hall under three steep roofs, a tower of five storeys under wide roofs, a white bell tower under a blue dome, a meeting house under a cone of thatch), an arch of stone in the desert, giant mushrooms that glow at night in a marsh, a ring of standing stones in the cold, crystals in the mountains, a gate of two posts and two beams on open ground, and islands that float over the board's ceiling with trees and a thread of water. A slow field of 53 thousand units makes a realm of wonders, a tenth of the world, where mushrooms, crystals and floating islands are six times as frequent. The 49 plots around the flyer are kept, one built a frame, each growing out of the distance between 880 and 700 units; the flight looks ahead for their tops as for roofs. Looked at: a lighthouse, a windmill, an arch, mushrooms (`mark.sh`). Script time 0.1 ms a frame; no cost measured on the AMD GPU. Left: looking at the towers, stones, crystals, gate and floating island, by night as well; stilt houses, terraces; the image's test; a take.
