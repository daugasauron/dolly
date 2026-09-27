# Launch magnetic tether rounds from the slingshots

- STATUS: OPEN
- PRIORITY: 290
- TAGS: game,combat,physics

The user intended a magnetic projectile fired by an existing slingshot, with a
rope that ground vehicles can grasp and pull to drag down an enemy aircraft.
The overnight hovering tower is the wrong interaction and reportedly caught a
friendly aircraft. Replace that default approach; verify actual teams and
incidental contacts instead of trusting the target predicate.

Build the chain from ordinary editable parts and generic Lua programs: supply
and load a tether round, sling it, physically attach its magnet to an enemy,
let a ground machine acquire/pull the trailing end, and show the aircraft being
restrained or pulled down. No hidden forces, target-ID exceptions, teleports or
weakened enemies. Preserve friendly release, reload/reuse, save/restore and real
cable forces; explain what each machine is doing visibly in the game.

Complete with actual slingshot→projectile→enemy and ground-grip→rope→aircraft
force evidence in focused and populated runs, repeated operation, no sustained
friendly captures, Chrome/Firefox rendering and a packaged local preview.
Requested September 27; work deadline 12:00 JST (03:00 UTC). Evidence root:
`build/mechanics-20260927/`. Preserve the 07:45 checkpoint while iterating.

Implemented: five-part Kusari cargo rounds, Kanagu articulated ground tugs,
root-body loading, enemy-only magnetic heads, readable Lua status and 96 m
winches. Shishi is removed from new catalogs; saved custom copies remain valid.
Generic observations include actual parts, rotations and magnet targets. Range
is measured between rigid bodies so a remote projectile head does not hide its
nearby rope handle. Reeling detects actual friendly tug magnets, including
simultaneous enemy/tug holders. No hidden forces or target-ID exceptions.

Verified in Dolly wasm64:

- `tether-park`: loader→gun→opposing courier→ground handle grip. Aircraft root
  falls from about y32 to y1.62; cable 96→1.48 m, tension 37.93 N; tug upright.
- `canonical-fresh`: 1,800 s, both opposing couriers grounded, both tugs holding
  handle part 4, final cable tensions 31.40/27.79 N, 13 world deliveries, all 85
  originals retained, no controller errors/deaths. Predates the multi-holder fix.
- `lost-handle`: actual saved remote-head incident. Tug acquires at 1109.083 s;
  projectile enters haul despite simultaneous enemy and tug holders. Head
  descends y34.85→12.58; tug remains upright. This is continued pulling, not a
  second completed ground-down.
- `body-range-reciprocal.log`: actual Box3D part observations, support, copies,
  invalid IDs, reciprocal endpoint range, 96 m loaded reeling, ownership,
  cargo-credit guards and save/reload pass.

Still OPEN: captured aircraft remain restrained; automatic round recovery,
reload/reuse and repeated tether interceptions are not implemented. Keep this
separate from the slingers' existing repeated ordinary-cargo shots.

Packaged verification: `build-image-v3.log` passes the image's physical checks.
Chrome and Firefox load the actual 9097 preview with 85 canonical embedded
programs, no errors and clean exit (`local-preview-{chrome,firefox}/proof.json`).
Fresh/restored real-time rendering also passes; other 56 runtime/image assets
and six protected save files are unchanged. See `docs/crash-handoff.md`.

Final packaged-source run `checkpoint-fresh`: 2,400 s, 15 deliveries, 103 objects,
all 85 originals retained, no faults/deaths. West capture 77.783 / tug 105.567 s;
East capture 669.683 / tug 670.667 s. Both couriers finish grounded, both tugs upright
and gripping handle part 4. Final cable lengths 1.244/2.980 m and tensions
60.64/30.68 N. No friendly tether-head grips in the event log. Firefox's actual
Import world UI restores all 103 programs and both complete attachment chains
(`checkpoint-restore/proof.json`), then continues without errors.
