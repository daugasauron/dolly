# Add a physical cargo carousel to the works yard

- STATUS: CLOSED
- PRIORITY: 210
- TAGS: game,content,physics

Kaiten is a matte industrial four-arm carousel on an exposed4x4 bearing, with
four two-stage hydraulic heads and magnets. Its editable program discovers
actuators from the blueprint, checks swing/output clearance and verifies actual
load support before release. Existing porters collect and deliver its parcels.
All94 existing models and placements remain; the carousel and3 parcels are added.

Earlier73/81/89-part prototypes exposed real clearance/reach defects. Low heads
struck the porter boom;3m stroke could not fully unload; later the suspended
parcel still struck porter parts9/10. The final93-part model raises its arms
another metre and uses two2.5m stages. It clears loaded heads while retaining
5m lowering reach. No collision exemption or hidden cargo transfer was added.

Fresh1500s combined run: all3 parcels delivered,2 carousel handoffs, maximum
joint separation.002994m. Chronological magnetic chains95→38→delivery are
verified for96 and98;97 is collected directly. Full trace/source preservation:
`build/blockwalker-compound-regressions-chrome-competition-v5/salvage/`.

Image37 Chrome/Firefox restore the carousel holding98, with attachment retained,
and match all98 catalog blueprints/programs. Three focused GPU views in both
browsers were captured and inspected under `build/blockwalker-carousel-final-
view-{chrome,firefox}/`. Packaged Firefox runs118 objects at45.42FPS with real-time
simulation after30s warmup. See `docs/crash-handoff.md` for checkpoint evidence.
