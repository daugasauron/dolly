# Treat passive block assemblies as cargo

- STATUS: CLOSED
- PRIORITY: 220
- TAGS: game,cargo,physics

Ordinary spawning recognizes only a single unanchored block as cargo. A beam made
from three ordinary boxes is therefore invisible to cargo-handling programs,
although the ore spawner manually marks its multi-block pallet as cargo.

Use the same rule for all unanchored assemblies containing only ordinary boxes.
Keep articulated machines and anchored structures out of cargo classification.
Preserve explicit cargo roles in saved worlds. No current catalog design is a
passive multi-box assembly, so this does not reclassify existing bundled robots.

Experimental source: `build/slopyard-multipart-cargo/world.c` and `source.tar`.
Two lines replace the single-block rule; the ore-specific assignment is removed.
The initial experiment left served image41 and canonical source unchanged; the
verified classification is now in canonical source as recorded below.

The payload-beam trial replaces three ammunition props with ordinary
three-block beams: one alloy box and two hull boxes, about1.369kg total, below the
existing1.5kg light-ammunition limit. Initial in-Dolly assertions pass for cargo
classification, block count and measured mass. Gun body, loader and forces stay
unchanged. Inputs: `build/slopyard-multipart-cargo/{catalog.json,defense.c}`;
output: `build/slopyard-compound-regressions-chrome-payload-beam/salvage/`.

Completion requires physical pickup/handoff, preserved ordinary-machine roles,
rendering and save restoration in browsers. The separate projectile-disruption
gate may still fail; do not claim a combat improvement from classification alone.

Completed600s trial:125 objects,14 deliveries, no lost actors/controller errors/
deaths/friendly impacts, but zero shots or payload drops. At277s gun87 physically
holds beam91; it loses that grip during spin-up around280.217s. The fixture exits1
and retains its full trace. This does not establish a usable ammunition design.
`build/slopyard-multipart-cargo/handoff.c` is a prepared, unrun focused handoff
check. Browser rendering/save restoration of the experimental source remains
unverified at that checkpoint. Keep the beam ammunition out of the deployed world.

Verified and applied to canonical world.c: unanchored plain-box assemblies are
cargo, and the ore spawner no longer needs its own override. The focused fresh
physical run passes: beam91 attaches loader88 at6.650s, then gun87 at52.183s;
57.2s final,114 objects, no losses/errors/deaths. Evidence:
`...-chrome-cargo-handoff-fresh/salvage/{regression.log,salvage.jsonl}`.
The first handoff fixture accidentally loaded the boot world's single-block
stock; the corrected fixture explicitly creates its advertised fresh catalog.

Chrome and Firefox compile/run the changed C app inside Dolly and pass fresh
classification, builder-created cargo, anchored/actuated exclusions, restoration
of119/134-object worlds and their actual magnet attachments, and an explicitly
saved non-cargo override. Rendered images inspected. Evidence:
`build/slopyard-multipart-cargo/view-{chrome,firefox}/proof.json`.
The extended existing cargo browser regression also passes: loaded lift travel
5.701m, boat travel12.509m,11 bodies restored with roles/poses intact, no model
requests. `build/slopyard-multipart-cargo/regression.log` records the result.
This closes cargo classification, not the unsuccessful ammunition experiment.
Packaged and locally deployed as image42. Chrome/Firefox restore seven saved
worlds and all111 unchanged designs; the existing cargo browser regression also
passes against the packaged executable. Evidence: `build/slopyard-image42-`
`preview{,-firefox}/proof.json`, `build/slopyard-image42-cargo.log`, and
`build/slopyard-image42-artifacts.json`.
