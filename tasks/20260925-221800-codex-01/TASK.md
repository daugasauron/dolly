# Make the cargo world more varied and competitive

- STATUS: OPEN
- PRIORITY: 280
- TAGS: game,content,visuals

The stable checkpoint is complete. Work has resumed toward the broader goal
through2026-09-26 13:00 JST. Image40 remains the playable build at
`blockwalker-checkpoint-20260926-image40`; further candidates stay separate until
their cargo, defense, interaction and terrain behavior is verified.
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

Image40 packages the verified interception and ground-material changes; all111
designs remain and every blueprint is unchanged from image39. Chrome/Firefox
pass catalog, six-save restoration and loaded-magnet checks. Protected state and
other images are preserved;40 recipe lint checks pass. Build44.7s. Evidence:
`build/blockwalker-image40-preview{,-firefox}/proof.json`, image40-preservation.json
and image40-build.log. Tag `blockwalker-checkpoint-20260926-image40` records the
checkpoint; image39 rollback artifacts are retained. Remaining controller
experiments stay unbundled, including the failed final placement replay.

The denser-ammunition comparison passes hit detection but does not establish
better air defense. The same1549.85s attached-round save and force-limited gun
program use0.912673kg alloy versus2.738019kg ballast for101. Both fire once and
hit59 twice, no friendly impacts, no actor losses/controller errors; neither
courier delivers during90s. Minimum up is0.977654/0.984358. The heavier variant
has a larger altitude excursion, but altitude already differs before the counted
impacts; do not attribute the entire excursion to the shot. Evidence:
`build/blockwalker-compound-regressions-chrome-battery-dense-ammo/salvage/`.
The ammunition change remains unbundled. A45s impact-detail fixture is prepared
but unrun; it also records contacts while the round is still attached.

Stable checkpoint follow-up: the latest combined supply/freight trial fails its
quotas while preserving134 objects with29 deliveries and no errors/deaths.
An exact saved-state replay fixes the crane edge reach and tender drop tolerance,
but fresh sustained operation remains unverified (tasks195202 and000614).
Fork-assisted self-righting and wheel-traction replays fail physical recovery;
keep the friendly-fire clearance and rescue task205300 open.

The yard edge-stripe shader comparison finishes in Chrome:30.38→29.94FPS on the
same119-object save, ending121 objects with no errors. Evidence:
`build/blockwalker-yard-markings/paired-chrome/`. Firefox and visual review are
not complete, so it remains unbundled alongside the untested rescue dozer.
No new gameplay or shader experiments enter this checkpoint.

Final checkpoint confirmation: Firefox starts all111 bundled designs and reloads
the newest1440s handoff save with131 objects, unchanged programs/blueprints and
no errors/deaths. Rendered views inspected. Evidence:
`build/blockwalker-stable-image40-preview-firefox/proof.json`.
Served source/snapshot/Wasm match local files; runtime identities recompute
correctly. Six protected files (392379755 bytes),12 other images and13 catalog
entries remain unchanged. Evidence: `build/blockwalker-stable-image40-`
`{artifacts,preservation}.json`. No disposable simulations remain active.
Checkpoint notes tag: `blockwalker-stable-20260926-image40`; source stays at
image40 implementation300d656. Local preview remains available on9099.

Worn dock/platform edge stripes now pass both browser comparisons and visual
inspection of the harbor and inlet. Same119-object save and14 fixed views:
Chrome30.38→29.94FPS, Firefox33.55→32.68FPS after30s warmup/15s sampling. Both end
with121 objects and no errors/deaths. These samples show roughly0.4/0.9FPS lower
rates; they are not evidence of a performance improvement. Eight shader lines
add muted yellow/charcoal edge paint only to broad, thin, horizontal steel decks.
No geometry or physics changes. Source updated; served image40 remains unchanged.
Evidence: `build/blockwalker-yard-markings/paired-{chrome,firefox}/`.

Next air-defense experiment, prepared but unrun:
`build/blockwalker-payload-defense/{catalog.json,slinger.js,defense.c}`. The existing
channel gun waits for an enemy aircraft carrying cargo and aims at the payload.
This tests whether a normal light projectile can break the magnetic cargo grip,
which could interrupt deliveries even when the aircraft stabilizes after impact.
No damage rule, forced detach, stronger magnet or special engine force is added.
The fixture requires an actual projectile contact followed within3s by loss of
that carrier's magnet attachment while the payload remains at least5m above the
local floor, then observes30s more. It rejects friendly impacts and any actor
loss/error; maximum1800s, periodic300s saves. Three early shots at quarry scout9
currently hit without establishing a useful reduction in air retrieval.
Do not claim this candidate works until the physical trial is run.

Checkpoint preparation: fresh `battery-incremental-fresh` reaches1800s with
134 objects,31 deliveries, all111 originals, no controller errors/deaths. Both
heavy warehouses store two loads through actual truck/crane/barge/forklift
attachments. Four shots produce14 intended-aircraft impacts and zero friendly
impacts. Only one outside ammunition reload completes, so the combined fixture
correctly remains failed and task000614 remains open. Task195202 records the
individual freight stages. Image41 packages those six verified controller
changes and the previously measured dock-edge paint; all blueprints are retained.
Rescue-dozer and payload-defense experiments remain unbundled.

Image41 checkpoint verified:46.0s in-Dolly build, Chrome/Firefox111-design checks
and seven restored worlds pass, including the134-object1800s run. No new errors,
deaths or model requests; original saved attachments and programs are preserved.
Six protected files392379755bytes,12 other images and13 catalog entries remain
unchanged. Served source/snapshot/runtime hashes match local artifacts; all40
recipe lint checks pass. Evidence: `build/blockwalker-image41-`
`{artifacts,preservation}.json` and `preview{,-firefox}/proof.json`.
Tag `blockwalker-stable-20260926-image41`; local9099 preview remains available.
All disposable browser trials ended;11 orphaned Xvfb-only test scopes were stopped.
The broader competition goal and ammunition/rescue issues remain open.
