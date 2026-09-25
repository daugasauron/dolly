# Make the cargo world more varied and competitive

- STATUS: OPEN
- PRIORITY: 280
- TAGS: game,content,visuals

Originally scheduled through 2026-09-26 13:00 JST; the later stable-checkpoint
request pauses expansion. Keep this task open for the remaining work.
The user likes the physical catapults;
air retrieval is too easy and the terrain looks flat and gray. Improve cargo,
interaction, combat/defense, terrain and visuals while retaining the late-90s
PlayStation industrial style.

Verify distinct terrain districts in rendered browser views, with readable routes,
cover, height and industrial landmarks. Cargo should give ground vehicles,
cranes and boats useful roles alongside aircraft. Add physical defenses and
reload interactions using editable character programs, ordinary actuators and
real cargo; no hidden forces, actor-specific engine behavior or guaranteed hits.
Preserve captures and teammate rescues. Measure sustained deliveries, shots,
physical handoffs and performance in populated browser runs. Retain existing
characters and save compatibility unless a measured problem justifies a change.

Start from checkpoint 2860af6/image37. Known freight, porter and guard coordination
problems are tracked in 195200, 195201, 195202 and 205300. Their earlier combined
candidate failed and must not be promoted as a bundle. New experiments live in
`build/blockwalker-world-renewal/`; keep verification evidence with this issue.

First terrain-material pass: rust brick, teal steel/water, ochre rock and mossy
ground with reduced haze. Before/after Chrome captures use the identical saved
1500-second, 118-object world and six fixed cameras. Both run without errors;
30-second warmup plus 15-second sample measures 32.10→32.63 FPS. This single pair
shows no observed slowdown, not a proven speedup. Evidence:
`build/blockwalker-world-renewal/chrome/`. The material pass is packaged in image38;
geometry, stronger defenses and cargo competition remain unfinished.

Firefox also passes the same six views and populated performance check:
41.79→42.34 FPS, no errors. Browser-specific pairs use the same saved world;
no cross-browser speedup claim. Rust foundry/teal steel remain readable in both.
The ore-hauler diagnostic identifies rear wheel17 contacting the shaft marker
at(-39.7,0.6,71.3), rather than another vehicle. The isolated generic reverse
recovery passes; evidence is recorded in task20260925-195202. It remains unbundled.

Image38 compiles inside Dolly and passes packaged Chrome/Firefox checks: all98
designs/programs, five saved worlds, loaded carousel/boat attachments, no browser
or controller errors. Other images and protected user state retain their hashes.
See `build/blockwalker-image38-preview{,-firefox}/` and image38-preservation.json.
The unverified terrain4 prototype is retained locally under
`build/blockwalker-world-renewal/terrain-v4-source/`; it is not part of the image.
