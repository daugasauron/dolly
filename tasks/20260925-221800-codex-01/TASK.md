# Make the cargo world more varied and competitive

- STATUS: OPEN
- PRIORITY: 280
- TAGS: game,content,visuals

Continue through 2026-09-26 13:00 JST. Checkpoint image39 is saved as
`blockwalker-checkpoint-20260925-image39`; continue from that verified build. Keep this task open
until the remaining cargo, defense, interaction and terrain work is verified.
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

Terrain4 prototype now passes real in-Dolly physics and save checks: roof stops
a falling box at14.6m while ground clearance remains0.5m, terrain0–4 restore,
unknown terrain5 is rejected. A240-second populated run finishes with111 objects,
five deliveries, no removed actors/deaths/controller errors; tracked biped minimum
up0.949477/0.997399/0.996846/0.999185/0.961194. Evidence:
`build/blockwalker-compound-regressions-chrome-renewal-terrain-v4a/salvage/`.
Chrome views of the freight shed, slag terraces and existing districts are
inspected. With111→112 objects,30s warmup then15s sampling gives31.96FPS; no
errors. This is not a matched comparison against image38. Evidence:
`build/blockwalker-world-renewal/terrain-chrome/`.

The six covered stock loads remain unused in that first trial. A six-wheel shed
loader using the existing recovery program completes the transfer: cargo101 is
picked under the roof at367s and released in the open yard at550s;118 final
objects, no losses/errors, minimum up0.999994. All original programs and blueprints
remain. Evidence: `...-chrome-renewal-shed-loader/salvage/shed-proof.json`.
Its first three alignments were still improving when a fixed15s timeout aborted.
An unbundled progress-based timeout is in `shed-loader-progress.js`. In the later
north-flak scene the loader picks101 at102s, releases at182s and picks a second
load. That scene differs; it is not a matched performance comparison.

The northern-inlet variant cuts the mainland slab while retaining terrain0–3.
`terrain-v4-bay.tar` SHA48899fe3b1350817e45463eba9a2ddc298ec304e9bd6054bb53d8bbbbc93f74d
contains the physical quay and arch. A Minamo skiff drives24m from open water
into the inlet using ordinary thruster keys and brakes at(29.962,-86.001).
75s, minimum up0.975939, no loss/error, raw status0. Evidence:
`...-chrome-renewal-inlet-boat/salvage/inlet-proof.json`.

An87-part long-arm flak design, extended23-part loading shuttle and six-wheel
tender remain prototypes. Two600s northern trials preserve all actors and reload,
but fire zero shots: no eligible enemy enters48m. Both raw tests fail their
two-shot requirement. The second also verifies the inlet geometry and loader
progress change. A new trial places the battery at(61,30), near East's cargo
approach, with crew clearance retained. Its effectiveness is not yet established.

The channel placement passes a300s populated trial:119 final objects,8 deliveries,
no losses/deaths/controller errors. Loader107 physically supplies106 twice;
cargo110 hits enemy59 at148.833s and109 hits enemy9 at229.850s, with34.18N and
29.09N contact forces. No friendly projectile contacts. These are actual hits,
not confirmed shootdowns. All98 original designs/programs/placements remain.
Evidence: `...-chrome-renewal-channel-flak/salvage/flak-proof.json` and raw trace.
Tender recovery after the initial ammunition stock is still unverified.

Firefox views show the inlet, roof, loader and battery; the populated scene has
no errors. A matched119-object300s save,30s warmup and15s sampling measures
terrain3 at32.73FPS versus terrain4 at25.59FPS. Coarse profiling attributes most
CPU time to world_step (14.53→14.96ms per physics step); rendering stays around
3ms/frame. Deep profiling identifies controller/sensor work as the main cost;
its own clock instrumentation materially reduces FPS, so use the coarse pair
for performance. Evidence: `build/blockwalker-world-renewal/{terrain-pair,
profile,deep-profile}-firefox/`.

A controller-phase geometry cache improves a separate matched terrain4 run from
25.27 to28.13FPS. It caches only bounds/mass/center of mass while poses are fixed;
velocities, actuator state and ownership stay live. A static-terrain cache and
exact simulation comparison are under verification before packaging image39.

The final cache pair measures23.94→32.85FPS on the same119-object terrain4 save;
world_step cost15.04→14.53ms. Both runs finish with121 objects and no errors.
`build/blockwalker-world-renewal/cache2-firefox/` records the paired sample.
Static terrain boxes are materialized once per terrain version; sensor bounds
are shared only within one controller phase. Physics frequency/substeps stay60/8.

The full playground fixture initially fails its old lookout35s travel deadline:
no cargo contacts, minimum up0.996549, farthestz38.863. The pre-cache code produces
exactly the same35s metrics and reaches45.541 at60s without contact/failure.
`...-chrome-checkpoint39-lookout-baseline/salvage/` records that comparison.
The canonical test now allows60s, retaining all distance/stability/contact
assertions. Initial failed run: `...-chrome-checkpoint39/`; corrected full run passes below.


Image39 checkpoint verified (`blockwalker-checkpoint-20260925-image39`):
`...-chrome-checkpoint39a/salvage/checkpoint-proof.json` confirms the full playground
fixture plus a fresh300s run:119 objects,8 deliveries,2 shots/hostile hits, no
controller errors/deaths. The entire saved state equals the uncached baseline,
including every pose and controller memory. All12 fixed camera images are also
byte-identical across the cache change. These optimizations preserve behavior.

The image compiles inside Dolly in45.0s (snapshot packaging38.0s). Source22files,
1318912bytes, SHAeab9772d17304b67ef5f5bc6f15ef0fefa8299ee00a51516fe07fc28e10bfeac;
snapshot234713867bytes, SHAf382c050e77ecf19fe0676cdd4bb9f00ae7c37d310bd26eccd24cb40df022a66.
Packaged Chrome/Firefox checks pass all111 designs and six saved worlds, including
original format1 and terrain4, with loaded carousel95→98 andboat94→91 magnets
physically attached. Other12 images,13 catalog entries and six protected files
remain unchanged. Evidence: `build/blockwalker-image39-preview{,-firefox}/`,
`build/blockwalker-image39-preservation.json`;40 recipe lint checks pass.
Local preview9099 serves this image. The broader task remains open: sustained
ammunition retrieval, cargo throughput, traffic coordination and balanced air
defense still need work; two hits do not establish successful shootdowns.

2026-09-26: user requested a stable checkpoint. Keep image39 at07967f6 as the
playable build; tag `blockwalker-stable-20260926` also records the current handoff
and follow-ups. Both browsers recheck all111 catalog entries, six saved worlds
and physical magnet attachments with no errors. Image/source hashes and protected
files/catalog are unchanged. Evidence: `build/blockwalker-checkpoint-20260926-`
`preview{,-firefox}/proof.json` and corresponding preservation.json.
Supply experiments remain unbundled; task20260926-000614 records their failed
sustained-supply checks and the first completed tender delivery. This broader
gameplay task stays open.

The next material pass is verified in Chrome and Firefox and is now in
`scene.wgsl`: broader moss, patched concrete, broken seams and shore tide stains.
Matched119-object300s save,14 fixed camera views,30s warmup/15s sample:
Chrome30.40→30.73FPS; Firefox33.89→33.98FPS. Both retain121 final objects with no
errors/deaths. These pairs show approximately unchanged performance. No collision
geometry or physics changes. Evidence: `build/blockwalker-ground-materials/`
`bundle2-{chrome,firefox}/`. The screenshot bundle is produced inside Dolly;
earlier attempts hit a download timeout and the seed tar's extract-only interface.

Catalog entry106 also now contains the verified interception program: three
different rounds hit their intended aircraft in a fresh populated run, no friendly
airborne impacts. The same run fails freight/resupply; tasks195202 and000614 record
the measured wall collision and misplaced ammunition. These source changes are
not yet packaged. The playable image39 and protected user state remain intact.
