# Reload artillery through physical ground and rooftop supply

- STATUS: CLOSED
- PRIORITY: 285
- TAGS: game,combat,logistics,physics

Eight stations provide four types per team: ground Tengu and Hosen, a shorter
roof sling supplied by a flyer, and a roof battery supplied by a car and 20 m
hoist. All transfers use ordinary magnets, pistons, thrust, winches and measured
cargo support through editable Lua. Targeting retains enemy/combat selection and
predicted friendly-trajectory refusal. Suppliers discover mechanisms, coordinate
claims, use local reserves, then seek released own-team ammunition in combat.
No forced attachments, actor-ID rules, teleports or weakened targets were added.

All guns share the short Koban loader; its unused channel duplicate was removed.
The loader centers held cargo and reports readiness after settling. Guns enable
pickup only when the actual magnetic pole sees the intended round ahead of
competing dynamic shapes. Actual gun grip acknowledges handoff. The fork moves
sideways clear of accepted cargo before rising; a contact probe measured the old
elbow trapped against the gun head/arm at 97/125 N. Vertical arm clearance uses
actual shape heights, allowing friends beneath roof launchers.

Komatsu cars use a fixed fork, two individual front steering knuckles and their
existing rear axle. All three use ordinary 100 N·m steering; the 17-part design
has a five-cell front track. A rejected layout trapped its front wheel against
its fork at 44.7 N. Reserves now sit 5 m outward from home, leaving turning room.
Service-lane waypoints are reached within 2.5 m before turning toward the hoist.
Both crane and car require supported cargo before deliberate magnetic release.

Verified inside Dolly wasm64; evidence under
`build/action-front-20260927/artillery/` unless otherwise noted:

- `repeated-v3`: exact catalog gun/loader with an ordinary active opposing
  courier; actual grips at 33.150/140.617/189.217 s, shots at
  108.067/156.967/211.667 s. Reload intervals 48.9/54.7 s. No motor/target overrides.
- `team-strategy-v5`: both gun types pass enemy/combat selection, physical
  friendly-trajectory refusal, vertical arm clearance, mechanism pairing,
  off-center/lost-acknowledgement recovery and complete fork withdrawal while
  the gun retains its round. Neutral logistics excludes own ammunition.
- `steering-v8`: empty Red roof; two distinct rounds gripped by car at
  23.750/235.417 s, hoist at 155.550/352.383 s. First round continues through
  loader at 183.867 and gun at 216.117 s. Car and hoist each complete two supported
  releases by 367.117 s, with no faults or removals.
- `blue-steering-v8`: same final design/controller; car at 114.000/327.817 s,
  hoist at 257.317/424.533 s; first loader at 285.967 / gun at 312.817 s. Both suppliers
  complete two supported releases by 439.967 s, with no faults or removals.
- Parent `roof-fire/run-v3`: final shared controllers, empty roof; flyer at 8.617 →
  loader at 67.967 → gun at 96.567 s. An ordinary scout dispatches an opposing courier;
  target at 104.817 s and actual shot/release at 147.617 s.
- `recovery-v3`: after consuming its home reserve, the flyer catches a separate
  combat round at 91.150 s and returns it to the roof magazine at
  (61.05,16.48,-72.95). Two supported deliveries. Clearance includes observed
  anchored assemblies. Subsequent gun/loader changes pass the final proofs above.

The populated follow-up found roof guns mostly outside enemy traffic, with
uncollected parcels on the northern and southern flanks. Four scouts and the
four extra couriers now start in north/south sectors. Courier selection adds a
soft distance penalty from its home latitude; fallback patrol uses that latitude
inside combat. Claims, retries and outside-sector work remain available. Worlds
without combat metadata retain neutral-depot patrol and ordinary distance ranking.
The central roof reserve from each station moves to its ground supply stack,
opening the real hoist/flyer deposit bay while preserving all object IDs/counts.

`courier-sectors-v2` passes the combined strategy regression, including actual
radio/visible-cargo sector preference, yielding to teammate claims, accepting
outside-sector jobs, and bounded home-latitude patrol. The exact source tar is
`72747defe7a0b80de601d7bb3c75bae00b910e064f93a990b0bd06a5e97902a9`.
`sector-layout.lua` supplies all 12 existing-slot changes; the final populated
run must establish encounters and resupply with this layout.

The first integrated sector run (`full-v4`) exposed an instruction-budget fault
in Blue Tengu at 126 s while checking a 6.55 s ballistic trajectory. Both gun
controllers now reject unrelated whole-assembly bounds before expanding shapes,
then reuse one relative trajectory envelope and sampled path per neighbor.
The existing 0.1 s collision segments, margins, blockers and 200,000-instruction
limit are unchanged. Coarse bounds include 0.2 m for rotated cube/wheel corners.

`gun-budget-before` / `gun-budget-after` replay the same saved 120 s state for
180 s. Maximum measured Blue Tengu cost falls 71,000 → 24,000 instructions and
Red Hosen 61,000 → 20,000, with matching shot times/counts and island deliveries.
This restored replay does not reproduce the original fresh-world fault;
`full-v5` verifies the actual startup sequence for 1,200 s: zero controller
faults, 11 physical shots and 13 island deliveries. `gun-budget-regression-v2`
passes both guns' physical friendly-fire refusal for a rotated cube corner and
a 21-block assembly whose root is 20 m from its intersecting tip, plus all
existing targeting, retry, withdrawal and courier-sector checks.
Optimized source tar: `c55ada4194c86290279e7077619356e03b38796c5a587df6b5b55aed94a90cc7`.

The populated `full-v5` run exposed a Red hoist return jam: its empty hook
wedged between two rail blocks after being reeled to 1 m. Replaying the actual
240 s checkpoint measured 99.93/99.97 N contact forces and unchanged 0.931 m
extension. Empty return now uses 2 m cable and waits for measured 1.5 m vertical
hook clearance while holding each rail separately. If the hook remains high
beside the rail, a short extension within the last slider's existing travel
opens the pinch before retraction. Geometry, motor forces and loaded phases
remain unchanged.

- `hoist-return-before`: exact old-program save remains jammed for 10 s.
- `hoist-return-after-v2`: same physical state, updated hoist source only;
  pinching contacts disappear within 1 s, seek resumes after 9.467 s, and it
  remains retracted through the 60 s replay. No removals.
- `hoist-return-repeat-red`: fresh supply completes at 571.367 s with three
  distinct car/hoist transfers, three supported car deposits and two supported
  hoist deposits; two rounds reach the gun at 210.267/450.483 s. The middle
  hoist deposit used its existing timeout, then recovered and delivered again.
- `hoist-return-repeat-blue`: fresh supply completes at 441.717 s, with two
  distinct car/hoist transfers and two supported deposits by each. First round
  continues through loader at 285.967 and gun at 312.817 s. Both fresh tests
  assert no controller faults or removals.

Final hoist source SHA256:
`5820564e8df8a18b22975c5f789d3744ea75c2f2070fb887edd29fb548fb7730`.

Final car/stock integration artifact: `road-supply-final-candidate.lua`, SHA256
`d265a6d945fc6061c5d46b15215b53d7d1476e49646cd1f871a4fb2fd6c83917`.
Red source tar: `47dd85104ffe420d833051175fc25a79c331b7ae9b35f775eec06874472221a9`.
Blue source tar: `8047512cfd3e6b8939dc4708de627e2c9bb8271a1464c82897bdf69671b212f6`.

Final integrated verification: parent `full-v5` runs the complete final layout
for 1,200 s with 11 shots, an air-supplied roof shot and real deliveries from both
cars/hoists, without faults. `full-v6` then continues the actual 600 s checkpoint
with the final recovery sources; Red hoist returns after 9.467 s and remains in
service. All 156 actors remain through another 600 s, with no faults/removals.
Actual local Firefox/Chrome image checks, terrain-7 restore, GPU captures and
source/package preservation pass in the parent evidence directory.
