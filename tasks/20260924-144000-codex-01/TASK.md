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
The general game/controls check also passes: 10.748 m driven through real keys,
74 Eyes samples, actual magnetic pickup, and no browser errors.
`build/blockwalker-final-driver.log` and its `cargo-physics.log`.
