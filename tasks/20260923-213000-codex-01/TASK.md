# Make Blockwalker a drivable, social cargo playground

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,physics,controls

Completed the work scheduled through 2026-09-24 18:00 JST on branch
`codex/blockwalker-playground-20260923`. Preserve the retro reconciliation,
learned world and complete native Pi history. Compile C inside Dolly; browser
verification uses one disposable 4 GiB/no-swap browser tree at a time.

Completion requires:

- An Eyes block gives an actual body-relative first-person view in the shared
  world, with a way back to the builder/viewer.
- A simple starter car drives through physical motors, interacts with world
  cargo, and has clear controls.
- A Turntable rotates attached assemblies continuously, including tilted mounts,
  with editable controls and saved designs.
- Physical cargo pickup, transport, release and settling earn persistent credit
  once per crate, with visible feedback and player attribution.
- Characters observe one another, select varied destinations and handle traffic.
  Preserve articulated walking; surviving in place does not count as walking.
- Reconcile the population and industrial world. Archive the old bridge and
  earlier prototypes; retain the useful learned characters and add activity.
- Two island teams compete through scouts/radio, parachute parcels, heavy ore,
  hydraulic lift, hauler, cranes and boats. Verify continuing physical handoffs.

Source checkpoint: `c092744`. Preview:
`http://127.0.0.1:9099/blockwalker/`, owned service
`dolly-blockwalker-preview-20260924.service`. Image 23 is 232318813 bytes,
SHA-256 `769a7e4235d5b0240cc6d5928797bd9599215ddc66b49f1ea5569d89bc304ea1`.
Source tar SHA-256:
`04fd25b6c5393faf2a0ae60594d29c620b1bd4822b52c76781a2ce7bb6d65c8e`.
The rebuild took 23.9 s using unchanged runtime
`d39a823c5863d0b1c8508f0d78e61cfe2408144a9ddaa6ecd57919e320718d72`.
All other twelve local preview/dependency catalog entries compare unchanged
against `build/blockwalker-before-image20-catalog.json`. This is the local
preview subset, not a replacement for the public distribution catalog.

The fresh world has 60 objects / 1604 parts / 41 library designs: 44 characters
with Eyes and 16 original cargo objects, plus bounded replenished supplies.
Nineteen older prototypes, including the drawbridge, remain optional archive
entries. New worlds use the industrial map; imports retain their map version,
population, programs and library. The nine-part starter car uses WASD, E/Q for
its magnet, Backslash for Eyes/follow and Escape for the workshop. Custom
magnet hints now follow assigned keys. Earlier blueprint versions still load.

The three walkers retain physical gaits. Five small lookouts roam, observe
nearby machinery and move clear of traffic. Skiffs and larger boats choose
water routes. Yard, harbor and submerged-cargo salvagers make physical handoffs.
Team couriers use scout reports; the heavy chain uses five successive carriers.
Parcels weigh about 0.913 kg; ore pallets about 10.952 kg. The supplied 30 N
flying magnets cannot lift the ore, while stronger player machines remain
possible. Scores, carrier attribution, radio and supply timing persist.

Verification:

- The image-22 fresh population runs 2400 s without process/world reloads:
  all 60 originals survive, zero removals, 34 deliveries, East 42 / West 29.
  All seven heavy deliveries have independently traced five-carrier chains.
  The last fifteen minutes include heavy/light deliveries for both teams.
  Sidelight/Amberguard/Marrowstep have 164/3008/3029 independently counted
  airborne/support foot placements, with 41/740/752 in the final quarter.
  All five lookouts keep roaming; Postbird delivers twice and resumes seeking.
  `build/blockwalker-continuous-population-image22-0/summary.json`.
- That run exposes one further yard-porter destination/approach stall. The final
  source changes only that controller: from the same 2400 s save it delivers
  stuck parcel 82 at 2495.267 s, ending the 180 s replay with nine credits,
  all originals, zero removals and minimum up 0.99970. The forty-minute test
  therefore predates this last porter repair; it is not a final-source soak.
  `build/blockwalker-porter-home-slow-approach/`.
- Physical delayed-quay regression: four full ore chains, eleven reloads,
  occupied pad, simultaneous arrivals, missing observations at all three
  cranes, and a distracting light parcel. East 16 / West 16, no removals.
  `build/blockwalker-quay-delay-parcel/`.
- Current controllers: 60,000 in-Wasm calls, 1,000 paused calls and five stopped
  runaways. `build/blockwalker-image23-controller.log` (exit 0).
- M/N-bound manual car: 10.506 m driven, actual pickup/release, 87 body-relative
  Eyes samples and inspected normal/focus HUDs, no browser errors.
  `build/blockwalker-custom-driver-bindings/`.

- The complete physical/game check before the porter-only repairs passes both
  two-delivery courier cases with 0.970 m stacks, the obstructed parcel, saved controller inputs,
  gait recovery, overflight clearance, buoyancy, radio isolation, parachutes and
  dock handoffs. Real keys drive 11.791 m, capture 75 Eyes poses and pick up cargo;
  the tilted Turntable's maximum separation is 0.00376 m. All sixty exported
  controller sources match the catalog. `build/blockwalker-approach-driver/`.

The [porter repair](../20260924-170000-codex-01/TASK.md) records the failed
image-21 trial, exact reproduction, collision repair and final delivery recovery.
Image 23 is verified through the owned 9099 preview. Native Chrome averages
60.5/61.0 FPS in normal/focus views, with zero readbacks and browser errors,
and resumes after 90 s in an actually hidden tab. The native browser is
connected without Playwright's focus emulation; forced-visible automated tabs
do not count as background verification.
`build/blockwalker-competition-preview-image23-native-resume/proof.json`.
Firefox averages 57.0/58.9 FPS with zero readbacks/errors. Its fresh and restored
exports match all sixty controller sources, preserve all originals and record
zero removals. `build/blockwalker-competition-preview-image23-firefox-served/`.
Firefox background/resume is not claimed: its automated pages stayed visible.
The image hash and unchanged other catalog entries are independently checked in
`build/blockwalker-image23-package-proof.json`.

The [competition task](../20260924-074500-codex-01/TASK.md) records the initial
map/radio/supply implementation. Follow-up evidence is kept with the fixes:
[loading quay](../20260924-132300-codex-01/TASK.md),
[Amberguard navigation](../20260924-132700-codex-01/TASK.md),
[freight and supply continuity](../20260924-144000-codex-01/TASK.md),
[lookout traffic](../20260924-145000-codex-01/TASK.md),
[piloting hints](../20260924-155000-codex-01/TASK.md),
[Marrowstep recovery](../20260924-162500-codex-01/TASK.md), and
[Postbird deliveries](../20260924-162800-codex-01/TASK.md).

The original named sessions and `build/blockwalker-recovery-20260923/` remain
untouched. The complete 387804845-byte native history survives Save and
close/reopen with independently checked restored-file hashes (3.08 GiB peak).
Immediate same-tab refresh of that large session still exceeds the 4 GiB test
limit; the [memory issue](../20260923-200000-codex-01/TASK.md) remains separate.
Image identities include the snapshot hash: older named saves remain recoverable
through Recover files, rather than directly launching against a new image.
[Lua/YAML migration](../20260923-211500-codex-01/TASK.md) is also separate.
