# Keep the loading quay clear between hauler deliveries

- STATUS: OPEN
- PRIORITY: 250
- TAGS: bug,game,physics

The full-population continuation after the boat recovery stalls at the loading
quay. At 2670, 2850 and 3030 simulated seconds, the hauler remains at
(-41.997, 105.845), in its return phase. Pallets 85 and 88 are stacked at the
loading spot; the loading crane waits for the hauler to leave.

Exact saved replay:
`build/blockwalker-competition-after-traffic-hour-7/segment-3030/`.
`build/blockwalker-hauler-jam-baseline.log` reproduces ten more seconds without
progress. Actual contacts show 52.335 N between the hauler telescope and the
upper pallet, 15.601 N against the crane head, and 60.211 N between the rear
ballast block and the quay. Wheels spin with almost no chassis motion.

Prevent deliveries into an occupied drop area, clear the idle crane from the
vehicle path, and recover the actual saved pile using existing motors and
sensors. Verify cargo survives, both pallets resume delivery, the hauler returns
to the lift and subsequent freight continues. No teleports or collision exemptions.

The candidate moves the idle crane over the water, keeps the hauler arm raised
while withdrawing, waits short of an occupied pad, and lifts the top pallet first.
The exact pile clears: at 3090 s the hauler is returning to the lift and East
has departed with cargo; at 3150 s West is receiving the second pallet. The run
stops at 3244.783 s for the independent [Amberguard edge failure](../20260924-132700-codex-01/TASK.md),
so it does not establish both island deliveries.

A delayed-boat trial proves the new hauler waits five seconds with its load at
z=98, leaving one pallet on the pad; that state reloads. Releasing both waiting
boats together exposes a second quay issue: both approach the berth and jam,
with no delivery after 1046 s. The old berth check only covers 13 m and does not
resolve simultaneous arrivals from the waiting positions. Evidence:
`build/blockwalker-quay-delay-candidate/{physics.log,blockwalker-world.json}`.

The delayed-service regression passes with berth clearance and deterministic
priority for simultaneous arrivals: 1472.500 s, East 16 / West 16, eleven
reloads, zero removals, minimum barge up 0.93878 and maximum joint separation
0.02782 m. All four pallets traverse the five carriers in order. The hauler
waits with its second load at z=98 while the first pallet occupies the pad;
boats then resume after a reload. All three crane observation interruptions
still pass. Evidence: `build/blockwalker-quay-delay-priority.log` and its
`physics.log`. The same physical scenario extends the existing freight fixture.

The same fixture with the previous catalog fails `pad<=1`, reproducing the
second pallet being stacked. Evidence: `build/blockwalker-quay-delay-old-catalog/physics.log`
(expected negative result). This distinguishes the behavior check from a test
that only accepts both versions.

Remaining: verify the saved combined world after the walker repair, then package
the earned checkpoint.
