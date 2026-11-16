# Voxel Planet: Voxel Flyover on a planet you can leave (research, plan, first demo)

- STATUS: OPEN
- PRIORITY: 290
- TAGS: godot,demo,planet,0.1.9

Owner (2026-11-16, 22:20 to 22:40): "Is it feasible to make the world renderer spherical like the
earth with an actual horizon? I want it to still be larger than what would make it realistic for
anyone to do a "lap", so sort of same but spherical?" Then: "Ideally, I also want thing further
out to display, instead of "popping up". I want to be able to see mountain ranges beyond the
horizon etc. Also, ideally... I want to add "space" where it's theoretically possible to go out
into orbit and see all of the "earth". Reflect on this." And: "Skip step 1. Launch a fable5.2
research pass on getting something like this working in a subagent, and implement an initial demo
if realistic. Use a separate worktree. I want to keep the "surface experience" very similar to
what it is now."

Branch `feature/planet` (`work/planet`, from `feature/flyover-4` at `3f2b333e2`). Brief:
`work/briefs-2026-11-16/planet.md`. Research and staged plan:
`work/research/planet-2026-11-16.md`; its stages are the tasks `tatr ls :planet`.

## State (2026-11-16, 23:40)

In work. `demos/godot/voxel-planet` (a copy of Voxel Flyover's project) runs on a sphere of
600,000 units: fields in three dimensions, eight grids round the planet, a texture of the whole
planet for what is far, every vertex stage carried onto the sphere; a board that keeps climbing
leaves the air and sees the planet whole, and comes back down. The images `voxel-planet` and
`godot-voxel-planet` build, and the owner's page is `http://127.0.0.1:9049/godot-voxel-planet/`
(unit `dolly-serve-planet`). Left for tonight: the look from orbit by day, the measures (frame
times on both adapters and browsers, sudden changes over the tour), the test, a take.

## How it is looked at and measured

The flyover's tools, copied to `build/planet/` (not in git): `dev.mjs` plays the working tree's
project in the package's Godot without an image build, `probe.gd` saves frames and frame times,
`look.sh NAME "GAME ARGS"` makes a sheet of stills of a flight by itself, `planet.mjs` computes
the planet in JavaScript (a map, the shares of sea and land, a place to start).
