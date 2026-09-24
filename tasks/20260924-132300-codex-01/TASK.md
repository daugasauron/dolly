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
