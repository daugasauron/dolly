# Keep Postbird from hovering forever over the receiving crane

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: bug,game,physics

At 5400 s in the default-seed continuous population, Postbird (10) still holds
parcel 62 over East's receiving yard at (151.18,18.17,29.86). It entered lower
at 502.617 s and has moved less than a metre over the last fifteen minutes.
Its nearest-depot selection chooses the receiving crane's working yard, while
traffic clearance correctly keeps the aircraft above that crane indefinitely.

Evidence: `build/slopyard-continuous-population-fresh0-90m/slopyard-world.json`
and root traces. Reconcile the older courier with the industrial receiving yards:
select a clear compatible depot, and reroute an existing obstructed delivery.
Retain the load and altitude safety rule. Verify physical release/credit from
this saved state and normal operation in the complete population.

The repaired saved-state replay delivers parcel 62 at 5421.783 s, about 22 s
after resuming. It retains carrier 10 throughout transport and first releases
at (163.006,6.058,18.001), above the East depot's existing cargo stack. The
parcel settles and earns one point; Postbird returns to searching. All 60
originals survive the full 180 s. Evidence:
`build/slopyard-reconciled-recovery-retain-load/segment-0180/`.
The earlier candidate released during its phase transition and failed this
check; that is fixed by retaining magnet power through the reroute.
The fresh image-22 2400 s population makes two Postbird deliveries; it
finishes in seek, entered 5.67 s earlier, with 14.05 m final-quarter root
range. No original object is removed.
`build/slopyard-continuous-population-image22-0/summary.json`.

The compact industrial regression now reproduces the old lower-phase stall
at (151,30). The new controller makes two real deliveries, stacking cargo
0.970 m higher, while leaving an obstructed third parcel unheld. It survives
a loaded-world restart and retains both credits. It excludes obstructed pickup
columns and allows a 0.4 m / 0.45 m/s pickup approach after twelve seconds; the previous 0.2/0.2 gate
could keep a hovering aircraft circling just outside simultaneous tolerances.
The saved failure is 0.096 m from its target at 0.441 m/s. The test checks
physical attachment, release, scoring and the uncollected obstruction.
Evidence: `build/slopyard-postbird-regression-approach/` (old fails, new passes).

The precise approach remains the first choice. Applying the larger tolerance
immediately changed legacy deposits so the crates did not stack; the complete
physics test caught that regression. With the bounded alignment fallback, both
legacy and industrial two-delivery/stacking cases pass, including the obstructed
parcel and loaded restart. The full game check also passes gait recovery,
terrain/water, radio, parachutes, handoffs, manual driving and tilted Turntable:
`build/slopyard-approach-driver/{cargo-physics.log,driver-proof.json,turntable-proof.json}`.
All sixty exported controller sources match the current catalog.

Verified in packaged source `c092744`; the
[checkpoint](../20260923-213000-codex-01/TASK.md) records served-browser evidence.
