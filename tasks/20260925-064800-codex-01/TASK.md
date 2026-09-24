# Package the cargo-world checkpoint and start the local app

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,checkpoint

User requested a stable checkpoint and local launch. Freeze features, retain the
tested controller rates, package the current game, verify the actual served
image, and commit on `codex/blockwalker-playground-20260923`. Do not deploy or
modify the parent worktree. Preserve original saves, complete Pi history and
the other images.

The catalog has 91 placements, quarry terrain, red/blue rival and guard crews,
warehouse handlers, two cargo-slinger crews and one-way thrusters. New pickup
programs for the two warehouse trucks and ore hauler, and Kawasemi's flight
feedback, exactly match the successful populated saved-world replay. All
movement remains ordinary editable character programs.

Verification before packaging:

- Chrome and Firefox builder/world controls, camera shortcuts and exact source
  export pass: `build/blockwalker-thruster-ui-{chrome,firefox}/` and
  `build/blockwalker-world-ui-{chrome,firefox}/`.
- Fresh 2400 s world: 122 objects retained, 33 unique deliveries, both quarry
  handoffs, raider tipping/recovery, no controller errors. Warehouse storage
  failed (East 1 / West 2): `build/blockwalker-rivalry-checkpoint42/`.
- Corrected programs recover that exact failure. The 2760 s continuation has
  125 retained objects, 37 deliveries, all four delivered heavy loads stored,
  and the stalled fifth load moved to the quay:
  `build/blockwalker-forklift-foundry-contact/`.
- The corrected programs still need a fresh uninterrupted endurance run.
  Freight and warehouse issues remain open.
- Crowded Firefox averages 14.66 FPS after warmup; Chrome's views reach
  22.65–26.48 FPS. CPU simulation dominates. Experimental lower control rates
  and observation caches are excluded; the performance issue remains open.

Complete after the packaged image starts at `http://127.0.0.1:9099/blockwalker/`,
all 91 bundled programs/blueprints match the source, the populated save restores,
and protected files/other images remain unchanged. Record image hashes and
browser evidence here.

Completed September 25, 2026. Image 28 is running at the local URL above through
`dolly-blockwalker-preview-20260924.service`. The C build and `--check` run
inside Dolly; packaging finishes successfully. Image: 232579323 bytes, SHA-256
`7e751b852bf0b121c4f0ad57f7a6d9206177a44a32f38078bb56b483704a7f58`.
Source archive SHA-256:
`175799137f2a148854b34fc739fa5e6b69a3a6e2e264f5a01778a8ec70bb146a`.
Runtime identity remains
`sha256:d39a823c5863d0b1c8508f0d78e61cfe2408144a9ddaa6ecd57919e320718d72`.

Actual served-image tests pass in both Chrome and Firefox: all 91 bundled
programs/blueprints match, terrain is version 3, all 125 saved objects restore
with their programs and delivery ledger preserved, and no browser errors or
HTTP model requests occur. Screenshots verify quarry and both slinger crews;
sidebar machine names are distinct. Evidence:
`build/blockwalker-image28-preview/proof.json` and
`build/blockwalker-image28-preview-firefox/proof.json`.

The preservation check passes before and after packaging: all six original
files (392379755 bytes, including the complete Pi history), twelve other images
and thirteen catalog entries are unchanged. Evidence:
`build/blockwalker-image28-preservation.json`. Experimental rates and caches
remain unpromoted. No push or deployment was performed.
