# Voxel Flyover is the planet, with mobile controls (2026-11-17)

- STATUS: OPEN
- PRIORITY: 300
- TAGS: godot,demo,planet,0.1.8

Owner (2026-11-17 07:30): "The Planet stuff is completely awesome. Replace the current game with
this, I also want to keep improving it. One major thing is I want it to support mobile controls.
Keep using Fable5.2 to work on the game today until 6pm, if you run out of work see my previous
comments about it." Brief: `work/briefs-2026-11-17/planet-day.md`. The planet's own record is
`tasks/20261116-133746-planet`.

## State (2026-11-17, 08:00)

- **One game** (`01d5efeed`): the planet's project is `demos/godot/voxel-flyover`, its recipes
  `Dollyfile-voxel-flyover` and `Dollyfile-godot-voxel-flyover`, its test
  `test/godot-flyover-browser.mjs`. The flat flyover's project, the planet's own recipes
  (`Dollyfile-voxel-planet`, `Dollyfile-godot-voxel-planet`), its test
  (`godot-planet-browser.mjs`), its rows in `config/upstreams.json`, `test/amy-browser.mjs`,
  `prepare-sources.sh` and the README's list of images are gone. The image names did not change,
  so the front page, the menu, `config/domain-pages-images.txt` and the demos page point at the
  planet as they are. The game is named Voxel Flyover and prints `FLYOVER` lines.
- **Touch**: Godot's Dolly platform reads `touch@0` (`platform/display_server_dolly.cpp`), so
  every recipe that runs Godot declares `touch@0` and Godot and its editor are built again; the
  other Godot images (`airtime-godot`, `lantern-drift`, `dodge-the-creeps`, `truck-town` and their
  applications) are for the integrator's round. The game's controls are `touch.gd`.
