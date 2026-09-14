# Add a physical basalt basin to the central plain

- STATUS: CLOSED
- PRIORITY: 240
- TAGS: game,terrain,gpu

The central 200 m plain remains visually sparse after populating the islands.
Add a stepped impact basin around x46,z72, with open north/east entrances, ledges
and a small crystal outcrop. Use the same boxes for terrain height, Box3D
collisions and GPU rendering. Keep known creature routes and island sites clear.
Use matte procedural rock/crystal materials; avoid extra host or GPU authority.
Provide a camera place button and expose the landmark in the existing world tool.

Verify real resting heights on the rim, ledges and basin floor, and physical
passage through an entrance. Check the browser camera control, shader appearance,
full populated-world survival and normal rendering speed. Preserve the live world
and complete Pi conversation when updating the in-image game.

Added 21 terrain boxes using the existing shared geometry table, two procedural
matte materials, a Basin camera button and a `world.terrain.basin` coordinate.
No browser capability or GPU/machine ABI change. Known live body poses did not
intersect the new area's x16..78,z48..100 bounds before the update.

C checks, built and run inside Dolly, verify resting crate centers 0.485 m above
the basin floor, 2 m ledge, 8 m north rim and 9 m south rim. An impulse-driven
crate crossed the open north entrance and ended at z61.128,y0.774. Its rotation
means an exact upright resting-height assertion is inappropriate for that moving
trial; the separate drops verify resting heights. The existing solid overhead
beam and passage checks still pass.

`test/blockwalker-browser.mjs` passed the new camera button and existing place,
population, prompt, builder, magnet and persistence controls. It rendered the
real new shader with no browser errors or ordinary GPU readbacks. The complete
`test/blockwalker-agent-browser.mjs` passed with the 35-object/880-part population,
including its cargo machines, flights, boats, bridges and save/reload. Both used
the 4 GiB/no-swap browser guard. Logs: `build/blockwalker-basin-{build,editor,integration}.log`;
native measurements: `build/blockwalker-proof/physics-check.log`.

The basin, crystal outcrop and entrance GPU images were inspected. An initial
full-view gallery measured 33 FPS, so performance was checked against old code.
New/old/new shader runs in one browser all measured 32–35 FPS. A subsequent
new/old/new terrain comparison, compiling each variant inside the same Dolly
instance with the same shader, measured 54–57 FPS for both geometries. These
comparisons did not reproduce a substantial basin-specific slowdown; the shared
setup's timings vary and should not be described as an isolated GPU benchmark.
All runs retained 35 objects/880 parts, real-time simulation and zero removals.
Artifacts: `build/blockwalker-basin/`, `build/blockwalker-shader-compare/`,
`build/blockwalker-terrain-compare/` and their matching build-directory logs.

The live update waited for Pi's compaction to finish, then paused the game and
saved a recovery archive. In-place compilation took 1.57 s and native checks
5.37 s. Verification retained all **44 objects/1053 parts**, magnetic attachments,
world age and the exact SHA-256 of the complete **235,645,401-byte** native history.
Pi resumed through real Astra/xhigh calls in session `blockwalker-basin` and
received the new terrain coordinates while retaining its current gantry work.
The first running backup still had all 44 objects and no new removals.
The actual resumed `watch_world` tool reports `terrain.basin: [46,0,72]`,
confirming that the live command loaded the updated C binary.
Evidence: `build/blockwalker-basin-{update,resume,monitor}.log` and
`build/blockwalker-walking/basin-{restore,updated}-proof.json`.
