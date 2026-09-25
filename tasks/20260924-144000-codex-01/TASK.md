# Keep industrial freight and air supplies moving in long sessions

- STATUS: OPEN
- PRIORITY: 250
- TAGS: bug,game,physics

The uninterrupted fresh seed-42 hour preserves all 60 original objects but
stops heavy deliveries at 1986.133 s. The hauler repeatedly targets Air parcel
80 at (-49.79, 51.17), while ore pallet 79 waits on the lift. Its magnet stays
1.94 m high over the small parcel and cannot attach. The freight path is idle.
The exact 3600 s state and ten-second contact/sensor replay are preserved in
`build/blockwalker-continuous-population-fresh42/segment-3600/` and
`build/blockwalker-lift-jam-baseline/`.

All six outstanding air parcels also accumulate at just two drop sites:
three around the foundry and three around the western ruins. Couriers reject
obstructed descents, so the six-parcel cap prevents further exposed drops.
No cargo is lost and no character is removed, but survival alone misses this.

Give the ore hauler an explicit ore job selection, including rejecting a stale
light-parcel job after reload. Recover the exact saved freight chain without
moving bodies or removing the obstructing parcel. Spread new outstanding air
drops across distinct sites, retaining the total cap and difficult salvage.
Verify continued heavy and light deliveries in a fresh continuous population,
plus a physical parcel distraction in the existing freight regression.

The ore-only candidate recovers the exact stalled pallet 79: East scores it at
4133.667 s; subsequent pallet 87 is aboard West's departing barge. The light
parcel remains in the world. This replay stops at 4135.517 s because lookout
34 tips near Marrowstep, not because of a freight failure. Preserve that
independent failure rather than reporting the whole continuation as passing.
Evidence: `build/blockwalker-ore-recovery-selected/segment-0720/`.

Root/carrier traces independently identify the recovered pallet on lift 52 at
3600.017 s, hauler 53 at 3615.017, crane 54 at 3808.517, East barge 55 at
3835.017, and receiving crane 57 at 4105.517. Parcel 80 remains uncollected.

The supply regression now rejects the previous spawning rule and passes the
new one: a midair reload retains seed, next-drop time and parachute; after
800 more simulated seconds, all six active parcels originate at distinct
sites, all chutes have folded, and nothing is removed. The measured descent
velocity is -1.667 m/s for a 0.913 kg parcel. Evidence:
`build/blockwalker-supply-spacing-distinct.log` and its saved world.

The physical freight regression with a distracting light parcel passes at
1453.567 s: East 16 / West 16, eleven reloads, no removals, minimum barge up
0.94671, maximum separation 0.02841 m. Four heavy pallets complete all five
carriers in order. The light parcel remains loose and uncollected. The same
trial includes an occupied loading pad, simultaneous boat arrivals and brief
observation loss at all three cranes. `build/blockwalker-quay-delay-parcel/`.
The general game/controls check also passes: 11.684 m driven through real keys,
75 Eyes samples, actual magnetic pickup, and no browser errors.
`build/blockwalker-reconciled-driver.log` and
`build/blockwalker-reconciled-driver/cargo-physics.log`.

The uninterrupted default-seed 90-minute trial finishes with all 60 originals,
zero removals, 68 deliveries and a 91–91 score. All 18 heavy deliveries have
independently traced lift → hauler → loading crane → team barge → receiving
crane handoffs. Each team receives two heavy and three light deliveries in
the last fifteen minutes. This verifies freight continuity; a separate
[Marrowstep controller stall](../20260924-162500-codex-01/TASK.md) remains.
Evidence: `build/blockwalker-continuous-population-fresh0-90m/summary.json`.
The image-22 2400 s population also retains all originals, with seven heavy
chains. In the final fifteen minutes East receives two heavy/three light
deliveries and West one heavy/two light.
`build/blockwalker-continuous-population-image22-0/summary.json`.

Verified in packaged source `c092744`; the
[checkpoint](../20260923-213000-codex-01/TASK.md) records served-browser evidence.

Reopened for the 91-placement checkpoint. The fresh seed-42 2400 s run stops
heavy freight after four loads: the fifth pallet rests on the lift while the
hauler repeatedly approaches it with its magnet off. In the saved state the
pole is near the pallet's corner, but the program requires a horizontal gap
below 0.22 m to the whole pallet's center before powering it. This rejects a
physically reachable surface. Evidence: `build/blockwalker-rivalry-checkpoint42/`.
The candidate powers the magnet within the cargo's sensed bounds, leaving
actual capture to the unchanged 0.65 m contact query and rejecting wrong targets.
Verify saved recovery and uninterrupted fresh freight before closing again.

The 180 s contact-pickup replay recovers pallet 110 from the lift and carries
it to the quay; the hauler returns for the next pallet while the crane begins
pickup. All 125 objects remain, with 37 deliveries and no errors. The same
continuation preserves all four stored heavy loads and Kawasemi completes its
second delivery. The candidate is now canonical; fresh continuity remains
pending. Evidence: `build/blockwalker-forklift-foundry-contact/`.

Image 29 fresh seed-42 endurance (`build/blockwalker-rivalry-image29-fresh42/`)
retains all 117 objects over 2400 s, with 27 deliveries and no controller errors,
but no heavy pallet reaches either island. Pallet 92 reaches the quay standing
on edge; the loading crane remains in `pickup` from 679.85 s to the end, with
its head about 1.12 m horizontally off the pallet COM. The second pallet waits
on the hauler behind it. The warehouse-storage assertion therefore fails
upstream of the warehouse handlers (0/0 stored). Preserve this exact save.
Raising the head before horizontal alignment and using the observed cargo top
recovers pickup, but the maximum lift still leaves the upright pallet on the
ground (37.7 N support) and against the crane (21.6 N contact). It cannot swing
clear. Evidence: `build/blockwalker-forklift-quay-clearance/`. Improve physical
lifting clearance as well as the pickup program; this is not a completed fix.

A 67-part crane prototype adds a mast level, a 3x3 bearing and a second lowering
ram. Directly chasing the head's yaw excites boom sway; slow joint-angle feedback
settles it. Replaying the exact 117-object failure, it picks up upright pallet
92 at about 8 s, lifts it clear, and releases onto East barge 55 at 30 s. The
barge sails with that physical pallet, and the original hauler deposits pallet
97 at the quay. No other design, cargo pose, mass or capture force was changed.
`build/blockwalker-forklift-quay-high-lift-joint-feedback/`. The prototype is not
bundled; fresh repeated freight and warehouse operation remain required.

The fresh isolated nine-machine chain with only that quay replacement runs
1800 s, retains 19 objects without program errors, and completes two physical
quay-to-barge transfers. West receives and stores one heavy pallet; East's
receiving crane wedges its pallet against the quay while swinging. The original
hauler is also slow (first quay arrival at 899 s). Thus the two-per-team storage
assertion fails; this is not an endurance pass. Evidence:
`build/blockwalker-rivalry-crane-fresh-chain/`. Taller, broad-bearing receiving
cranes with ordinary sensor-driven programs are the next source-only experiment.
