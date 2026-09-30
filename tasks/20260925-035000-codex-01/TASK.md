# Make thrusters one-way and keep their exhaust faces open

- STATUS: CLOSED
- PRIORITY: 210
- TAGS: game,physics,compatibility

A thruster has one firing key and a nozzle direction. Thrust acts opposite the
nozzle, and both placement and orientation edits must refuse a neighboring
block on that face. Render one nozzle and flame. Apply the same rule to imported
new blueprints, not just mouse placement.

Existing programs use reversible engines. Upgrade old character/world formats
into physical opposing jets while preserving keys, original body indices,
programs, memory and saved motion. Back up the original world before automatic
upgrade. Explicitly test blocked old mounts, save/reopen, import rejection,
one-way force on all axes and actual aircraft/boat behavior after conversion.

The in-Dolly C physics suite passes with one firing key and all six nozzle
directions. A 24 N jet produces 4.8000 kg m/s of momentum in 0.2 s, with the
expected opposite sign. Placement/orientation checks reject a blocked nozzle.
Evidence: `build/slopyard-thruster-conversion4/`.

The import fixture and real browser import/export workflow pass. A disposable
copy of the original world preserves all 51 creatures and 78 programs,
original body poses/velocities, memory, seeds and attached magnets. Automatic
startup migration writes the original version-1 world to a numbered backup;
the upgraded version-2 world round-trips exactly. Invalid new jet imports are
rejected. Evidence: `build/slopyard-import/physics.log` and
`build/slopyard-thruster-import4.log`. Protected recovery files were not
modified.

The first fresh-world run revealed asymmetric relocation of engines whose
old exhaust faces were blocked by landing legs. Mount selection now preserves
radial symmetry in equal-distance choices. Aircraft/boat verification, the
single-key builder UI, final catalog promotion and image packaging remain.

Firefox's rendered builder workflow passes firing/release, rebinding, blocked
orientation changes, blocked nozzle placement, legal side attachment and undo
(`build/slopyard-thruster-ui-firefox/`). The 180 s populated symmetric-mount
run keeps the boats afloat and aircraft upright. Postbird's old controller
oscillated with its wider mounts and added mass; the canonical editable program
now derives its four motor arms from the blueprint and uses retuned attitude
feedback. It physically delivers its starting crate at 29.883 s and remains
stable for 180 s (`build/slopyard-launcher-postbird-tuned/`). Other bundled
program sources are unchanged. Combined-world and packaged-image checks remain.

The fresh 1800 s one-way-engine world retains 102 objects with zero controller
errors but stalls at six deliveries. Save/trace:
`build/slopyard-rivalry-one-way-teams42/`. The wider freighter cannot reach
its loading berth (117.54 versus requested 116.75 m); the two team aircraft
orbit their destinations instead of settling within their arrival tolerance.
An isolated 360 s courier reproduction also fails to settle. Keep this task
open until revised physical mounts and visible flight feedback restore cargo
cycles; buoyancy and upright flight alone are insufficient verification.

The revised freighter layout keeps its original 7 by 5 metre footprint with
all eight nozzle faces open. Both real receiving berths are reached within
4 mm in `build/slopyard-launcher-compact-berths/`. The team courier's
visible attitude feedback now settles with the added jet mass: the paired
360 s test delivers at 148.633 s and begins a second pickup, where the original
program never reaches its first pickup. Evidence:
`build/slopyard-launcher-courier-{original,tuned}/`. The delayed upside-down
recovery fixture also passes in world and practice modes with physical opposing
jets (`build/slopyard-retention-one-way-recovery/`). A fresh combined run
is now checking the revised geometry and programs.

The revised 1800 s world makes 28 deliveries, including five heavy barge loads,
and delivers both quarry cores, with all 121 objects retained. Evidence:
`build/slopyard-rivalry-compact-tuned42/`. A comparison against the older
1200 s save finds one remaining precision-flight regression: Kawasemi made two
deliveries before conversion but now circles its pickup. Its 16-part airframe
matches the already tuned team couriers exactly apart from paint. The same
feedback gains are prepared in `build/slopyard-thrusters/kawasemi-tuned.js`;
the gantry/courier handoff and saved-world replay must pass before promotion.

Kawasemi's retuned program now passes: the isolated original gantry/courier
handoff scores at 93.083 s and remains stable through 360 s. Replaying the
populated 2400 s failure with only program updates delivers its waiting crate
at 2463.300 s, preserving all objects. The canonical source now uses those
gains. Evidence: `build/slopyard-launcher-kawasemi-tuned/` and
`build/slopyard-forklift-pole-pickup/`. Final UI and packaging remain.

Closed at the image 28 checkpoint. Chrome also passes firing/release, rebinding,
blocked nozzle placement/orientation and legal side attachment/undo
(`build/slopyard-thruster-ui-chrome/`). Both browsers launch the actual
packaged image, verify all 91 blueprints/programs and restore the 125-object
save with no browser errors (`build/slopyard-image28-preview/` and its
`-firefox/` counterpart). The previously documented force, migration, aircraft,
barge and recovery tests pass. Freight endurance remains tracked separately.
