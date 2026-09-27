# Steer wheeled vehicles through articulated servo axles

- STATUS: OPEN
- PRIORITY: 270
- TAGS: game,controls,physics

The user wants a servo hinge between wheel axles instead of clunky differential
wheel-speed/friction steering. Use existing suitable joints or add a small
physical servo mode only if needed. Character programs must visibly command the
steering joint and propulsion through the generic input/sensor interface.

Start with a builder car and representative working cargo vehicles; replace
turning by wheel-speed difference with joint-angle steering. Verify left/right,
reverse, centering, turning radius, loaded stability and terrain navigation with
real contact forces. Preserve configurable controls, visible Lua programs, old
saves and builder editing; no vehicle-name rules. Complete after autonomous and
manual browser driving, populated deliveries and local image verification.
Requested September 27; work deadline 12:00 JST (03:00 UTC). Evidence root:
`build/mechanics-20260927/`. Preserve the 07:45 checkpoint while iterating.

Implemented: the builder car, Tonbi trucks, Nekote feeder and new Kanagu tugs
use servo hinges between wheel axles. Visible Lua discovers hinges with a subset
of descendant wheels and commands equal propulsion. Old designs without a
steering axle retain their existing differential fallback. Braking/reverse,
backing alignment, waypoint lookahead and actual large-object bounds are handled
in programs; no engine-side vehicle-name rule or extra steering force exists.

Verified in Dolly wasm64:

- `steering`: straight 9.545 m, both turns, reverse, centering; up 1.0 and maximum
  joint separation .00966 m.
- `court-servo-v3`: two physical pickup/releases in 480 s in the four-object yard.
- `driver-corrected.log`: real Chrome keyboard drives 10.23 m over 88 observed
  frames. D turns the Eyes camera right; forward/reverse/left/centering/magnet,
  Lua import/export/invalid-import preservation/restart pass. W→I remapping:
  W 0.000011 m versus I 4.48 m. Sources compile inside Dolly.
- `loader-yard-4` versus `loader-yard-6`: removing the tandem rear axle allows
  pickup 131.317 / release 213.217 s and carousel transfer; six wheels cannot turn
  into a pickup within 600 s. Ordinary motor force and counterweights retained.
- `canonical-fresh`: 1,800 s, 13 world deliveries, no controller errors/deaths,
  both new tugs remain upright and physically restrain aircraft.

Still OPEN: reliable populated truck/feeder deliveries, congested pickup routes
and loaded docking. World delivery totals are not proof that these specific
trucks completed deliveries. The later backoff/waypoint experiment is kept only
under the evidence folder; it did not resolve the crowded stalls.

Packaged verification: `build-image-v3.log` passes the image's physical checks.
Chrome and Firefox load the actual 9097 preview with 85 canonical embedded
programs, no errors and clean exit (`local-preview-{chrome,firefox}/proof.json`).
Fresh/restored real-time rendering also passes; other 56 runtime/image assets
and six protected save files are unchanged. See `docs/crash-handoff.md`.

The required starter-car image self-check now discovers wheel/steering/eyes
parts, round-trips the blueprint and verifies physical articulated turning,
joint stability and camera pose. It no longer assumes nine parts or drives
fixed wheel indices. `build-image-v3.log` verifies the updated check.

Final packaged-source run `checkpoint-fresh` verifies one real populated West
truck placement: cargo 88 grip 1787.000 / release 2121.767 s, jobs 1 at 2,400 s, truck
upright and seeking more cargo. East's truck is overturned and Nekote still
has zero placements. Both cable tugs are upright with their real handle grips.
The full run has 15 world deliveries and no faults/deaths; these outcomes keep
the broader traffic/docking task OPEN.
