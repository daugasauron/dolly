# Launch, ground and recover independent magnetic tether rounds

- STATUS: OPEN
- PRIORITY: 290
- TAGS: game,combat,physics

Each slingshot fires a compact independent character. After its magnet catches
an opposing aircraft, it lowers a rope handle to the ground. Allied ground
machines grasp the handle and haul the aircraft down. Release grounded victims
so they can recover, then return ammunition for reuse. All behavior must use
editable parts, ordinary Lua programs and actual physics, without hidden forces,
forced attachments, target-ID rules or weakened enemies.

Implemented: four-part Kusari rounds (two opposed magnets and a winch handle),
20 Hz controllers, post-capture gravity deployment, ground-holder detection,
supported-victim release, abort/retraction, ground tug patrol and missed/spent
round recovery. Tugs use observed loading positions and sensed static obstacles.
Loader rails are raised above floor seams, carry uses the full vertical stroke,
and their clearing magnet withdraws vertically before translating sideways.
Physical opposing support no longer disables projectile arming; friendly loader
and gun transport still inhibit it. The compact winch motor stops at minimum
length instead of continuously squeezing its own parts.

Acceptance: measure actual slingshot→enemy→deployed handle→ground tug→grounded
release, bay return and repeated operation; no sustained friendly captures;
save/restore, populated-world and browser preview validation. Keep OPEN until
those results exist. A physical miss or a stronger aircraft escaping is valid,
but neither proves the complete intended chain.

Terrain-7 base staging follow-up (`build/base-zones-20260927/`): final populated
900 s run loads both slingshots but fires neither. An earlier run at the same
gun positions fired at an opposing collector at 805.817 s. Measure coverage
and encounter frequency as well as repeated ammunition reuse; keep targeting
physical and team-aware. Truck bays now stay within loader reach, and tugs
revisit home between middle patrols so stranded rounds do not disappear from
their observation range indefinitely.

Verified in Dolly wasm64, `build/combat-20260927/`:

- `tether-controls/terminal.log`: compact storage stays at 1.000 m; a falling
  friendly target causes no latch/payout; an opposing target physically latches,
  deploys to 18.100 m, releases after supported ground contact and retracts to
  1.000 m. This fixture has no ground tug and does not prove the complete chain.
- `tether-launch-v2`: raised loader transfers the compact four-part round, gun
  grips at 52.067 s and fires at 110.267 s. No latch. Contact with the opposing
  courier exposed the now-fixed physical-carrier arming gate.
- `tether-launch-v3/v4`: a wider six-part grapnel proved harder to transfer and
  lost grip during wind-up. That design is rejected; the four-part round stays.
- `tether-launch-v5`: tug physically recovers missed ammunition at 560.317 s
  and returns/releases it in its observed bay at 596.667 s (`recycled=1`).
  Loader handoff measurements exposed the sideways-withdrawal collision.
- `tether-launch-v6`: latest compact loading succeeds; loader releases at
  51.867 s, gun grips at 68.517 s and fires at 105.817 s. The real projectile
  passes the courier: closest pole-to-surface distance is 0.607 m with the face
  pointing away; nearest front-facing sample is 0.799 m, beyond the unchanged
  0.65 m capture radius. This is a physical near miss, not disabled arming.
  Tug recovers the miss and the round finishes 0.778 m from its initial bay.
  All five original controllers remain intact with no errors or deaths.

Current focused artifacts: `tether-audit.c` records actual pole distance, facing,
power and attachment each physics tick; also saves a 40-second contact dump.
`tether-launch-offset14.tar` varies only the real courier's initial position from
v6. `tether-contact.tar` uses the three current canonical characters, with an
initial nonoverlapping free-flight gap, to isolate capture/deploy/tug/release
without forced attachment or changing the aircraft's controller or strength.

Earlier evidence, before compact-flight/release rework, remains in
`build/mechanics-20260927/`: `tether-park`, `canonical-fresh`, `lost-handle` and
`checkpoint-fresh` proved actual launched capture and ground hauling. The final
2,400 s run kept all 85 originals, logged 15 deliveries and no faults/deaths;
both aircraft ended grounded with cable tensions 60.64/30.68 N. Those rounds
paid out before launch and never released, so this does not certify the new
lifecycle. Browser import restored both attachment chains in Firefox. Generic
part observations, reciprocal range, multi-holder ownership and cargo-credit
guards have separate real-physics evidence in `body-range-reciprocal.log`.

New lifecycle evidence:

- `full-v11`: in the populated world, gun shoots at 97.167 s, round catches the
  opposing scrap collector at 99.367 s, and tug grips its deployed handle at
  142.633 s. Collector descends from about 18 m to 3.53 m; the physical head
  grip breaks at 163.483 s and the collector recovers. Tug returns ammunition
  at 308.717 s (`recycled=1`). This is actual combat/recovery, not a scripted hit.
- `tether-contact`: canonical active courier, round and tug; no forced latch.
  Head catches at 0.017 s, tug grips at 9.467 s, and the program releases the
  supported victim at 32.867 s (`grounded=true`, one release, zero aborts).
  Tug returns/releases at 61.567 s; courier recovers and grasps neutral cargo
  at 214.800 s, then approaches its delivery depot. Core deployment/haul/release
  therefore works against a fully active aircraft.
- `tether-offset14`: complete actual launch chain: shot 105.817 s, enemy latch
  109.000 s, tug grip 166.367 s, supported programmed release 181.467 s. Victim
  is free afterward; no permanent restraint or enemy weakening. Bay return is
  still in progress at 420 s, so repeated interception is not yet established.

The final source fixes address measured recovery and pickup problems:
loaders choose the X/Z/Y of a reachable actual root-body shape and clamp their
rail target (the old rotated-round ALIGN target could exceed physical travel).
A recovered cable that stalls against its own hull is accepted as folded only
when both endpoints are near ground, the root and handle settle, payout has
stopped progressing, and both paid-out length and actual endpoint distance fit
inside the observed head/handle geometric span. The reel then stops, with an
explicit folded-hull status, instead of driving forever against self-contact.
Keep this task OPEN for reliable compact reload and repeated interception.

Latest-source tracked regression passes in Dolly wasm64:
`build/combat-20260927/tether-lifecycle-final/terminal.log` records capture at
0.017 s, physically supported release at 32.867 s, maximum payout 34.000 m,
actual grounded handle grip, sustained recovered flight and resumed cargo work.
The tested source includes the final compact-fold and loader pickup changes.
This completes the requested projectile/ground-tug/release behavior; reliable
rotated-round reload and repeated interception remain the open follow-up.
