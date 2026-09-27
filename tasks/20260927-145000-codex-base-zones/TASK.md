# Separate blue and red bases from the contested middle

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: game,world,visuals

The combat checkpoint still scattered friendly/enemy/neutral designs together.
Its faint rear-lane marks did not communicate two bases, slingshots stood in the
combat area, and a blue salvage boat began in the eastern channel.

Terrain 7 should have unmistakable blue-west/red-east staging areas and a neutral
middle. Team units start on their own side with matching paint. Artillery and
loading apparatus stay inside the bases; mobile workers/scouts/guards enter the
middle for objectives. Retain island goals, physical logistics and old saves.
Use visible ordinary controller programs; no actor-specific engine movement.

Verify actual starting affiliation/positions, artillery containment, meaningful
movement toward contested cargo, continued cargo delivery, rendered overview and
both base views, clean browser operation and terrain-6 save compatibility.

Implemented: terrain 7 blue-west/red-east ground paint, marked boundaries at
x=-48/+48, gate frames and rear beacons. All 65 team units start on their own
side with matching blueprints. Guns, loaders and ammunition are behind those
boundaries. Camera controls distinguish bases, ports, guns and scrapyards.
Scouts/guards seek the middle; guards avoid routine enemy-base incursions.
The red barge starts in its own channel and follows the existing inbound route.
Supply trucks' bays remain within loader reach; cable tugs periodically check
home for missed rounds. Neutral resource machinery/cargo and physical captures
remain part of the competition.

Source evidence in `build/base-zones-20260927/`:

- `full-v3/layout-proof.json`: 900 simulated seconds, all 87 originals retained,
  99 total objects, five island deliveries, scores 2/3, no faults/removals.
  Actual saved poses verify starting teams/paint and artillery containment.
  Nine red and seven blue mobile units visit the middle. Relocating scout 11
  clears its quarry-frame obstruction; the quarry runner completes a trip.
- `team-strategy/inspection.txt`: ten existing physical checks pass for enemy
  targeting, friendly trajectory exclusion, loader pairing, real retry handoffs,
  and neutral cargo selection. Compiled and run inside Dolly wasm64.
- `scene-v1`: actual GPU overview and both bases visibly separate blue, neutral
  and red areas. Final v3 only adjusts a few starting positions and tug patrols.
- `local-preview-{firefox,chrome}`: rebuilt 9097 image, terrain 7, 87 matching
  programs/blueprints, correct base/gun views, no browser errors or GPU readbacks.
- `combat-restore`: Firefox imports all 103 objects from the terrain-6 checkpoint,
  preserves its combat bounds/programs/attachments and advances 20.48 s cleanly.
- `package-proof.json` and `preservation.log`: 69 canonical sources match served
  bytes; six protected saves, the other catalog entries and 56 image/runtime
  assets are unchanged. Selected image build takes 61.3 s.

Local preview: `http://127.0.0.1:9097/blockwalker/`. Complete checkpoint backup:
`build/checkpoint-20260927-bases/`; source tar
`20caec75c35595a1bb4016d40edc844f389a04a1fb03f3828f97b55f31382e1b`.

Artillery frequency is not certified by this layout task: v2 fired once at an
opposing collector from the new base position; final v3 loaded both slingshots
but recorded no shots. Repeated interception/reuse remains tracked in
`20260927-081800-codex-projectile-tethers`.

Palette refinement: reduced saturation and ground/wall tint coverage while
retaining team units, gates and boundary stripes. Verified actual Firefox
base/overview renders in `build/base-colors-20260927/`; package checks preserve
the other images and saves.
